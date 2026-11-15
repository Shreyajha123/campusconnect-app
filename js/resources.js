// ============================================================================
// CAMPUSCONNECT — STUDY RESOURCES (FIRESTORE BASE64 & LOCAL INDEXEDDB)
// ============================================================================

import {
  collection,
  doc,
  setDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { db, isFirebaseConfigured } from "./firebase-config.js";
import { getTimestampMillis, mapFirebaseError, showToast } from "./ui.js";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const FIRESTORE_SAFE_BASE64_LIMIT = 850000; // Keeps Firestore doc safely under 1 MB limit
const LOCAL_DB_NAME = "CampusConnectFiles";
const LOCAL_STORE_NAME = "files";

// ============================================================================
// LOCAL INDEXEDDB FALLBACK FOR LARGE PDFs (> ~620 KB)
// ============================================================================

function openLocalFileDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LOCAL_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const idb = request.result;
      if (!idb.objectStoreNames.contains(LOCAL_STORE_NAME)) {
        idb.createObjectStore(LOCAL_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveLocalFileData(id, dataUrl) {
  const idb = await openLocalFileDb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(LOCAL_STORE_NAME, "readwrite");
    tx.objectStore(LOCAL_STORE_NAME).put({ id, dataUrl });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getLocalFileData(id) {
  const idb = await openLocalFileDb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(LOCAL_STORE_NAME, "readonly");
    const req = tx.objectStore(LOCAL_STORE_NAME).get(id);
    req.onsuccess = () => resolve(req.result ? req.result.dataUrl : null);
    req.onerror = () => reject(req.error);
  });
}

async function deleteLocalFileData(id) {
  try {
    const idb = await openLocalFileDb();
    await new Promise((resolve, reject) => {
      const tx = idb.transaction(LOCAL_STORE_NAME, "readwrite");
      tx.objectStore(LOCAL_STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore local cleanup failure
  }
}

// ============================================================================
// BASE64 CONVERSION & AUTOMATIC IMAGE COMPRESSION FOR FIRESTORE
// ============================================================================

function readFileAsDataUrl(file, onProgress) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (event) => {
      if (event.lengthComputable && typeof onProgress === "function") {
        const pct = Math.min(70, Math.round((event.loaded / event.total) * 70));
        onProgress(pct);
      }
    };
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read the selected file."));
    reader.readAsDataURL(file);
  });
}

/**
 * Compresses large images on canvas so they fit cleanly as Base64 inside Firestore (< 1 MB).
 */
function compressImageDataUrl(dataUrl, maxDimension = 1600, quality = 0.8) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width >= height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      let compressed = canvas.toDataURL("image/jpeg", quality);
      if (compressed.length > FIRESTORE_SAFE_BASE64_LIMIT) {
        compressed = canvas.toDataURL("image/jpeg", 0.6);
      }
      resolve(compressed);
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// ============================================================================
// FIRESTORE RESOURCE QUERIES & MUTATIONS
// ============================================================================

export async function fetchApprovedResources() {
  if (!isFirebaseConfigured() || !db) {
    return [];
  }

  try {
    const q = query(collection(db, "RESOURCES"), where("status", "==", "approved"));
    const snapshot = await getDocs(q);
    const items = [];
    snapshot.forEach((docSnap) => {
      items.push({ id: docSnap.id, ...docSnap.data() });
    });
    items.sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
    return items;
  } catch (error) {
    throw new Error(mapFirebaseError(error));
  }
}

export async function fetchMyUploads(uid) {
  if (!isFirebaseConfigured() || !db || !uid) {
    return [];
  }

  try {
    const q = query(collection(db, "RESOURCES"), where("uploadedBy", "==", uid));
    const snapshot = await getDocs(q);
    const items = [];
    snapshot.forEach((docSnap) => {
      items.push({ id: docSnap.id, ...docSnap.data() });
    });
    items.sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
    return items;
  } catch (error) {
    throw new Error(mapFirebaseError(error));
  }
}

/**
 * Converts uploaded PDF or Image to Base64 and saves directly to Firestore (with local IndexedDB fallback for >620KB PDFs).
 * No Firebase Storage required — uploads finish instantly.
 */
export async function uploadResource({
  title,
  subject,
  semester,
  category,
  description,
  file,
  user,
  profile,
  onProgress
}) {
  if (!isFirebaseConfigured() || !db) {
    throw new Error("Firebase is not configured yet. Please check js/firebase-config.js.");
  }
  if (!user) {
    throw new Error("Please log in before uploading study materials.");
  }
  if (!file) {
    throw new Error("Please select a PDF or image file to upload.");
  }

  const lowerName = file.name.toLowerCase();
  const isPdf = file.type === "application/pdf" || lowerName.endsWith(".pdf");
  const isImage =
    file.type.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif)$/i.test(lowerName);

  if (!isPdf && !isImage) {
    throw new Error("Please upload a PDF (.pdf) or an image (.png, .jpg, .jpeg, .webp).");
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error("File size exceeds the 10 MB limit. Please upload a smaller file.");
  }

  if (typeof onProgress === "function") onProgress(15);

  let dataUrl = await readFileAsDataUrl(file, onProgress);

  if (isImage && dataUrl.length > FIRESTORE_SAFE_BASE64_LIMIT) {
    dataUrl = await compressImageDataUrl(dataUrl);
  }

  if (typeof onProgress === "function") onProgress(85);

  const newDocRef = doc(collection(db, "RESOURCES"));
  const resourceId = newDocRef.id;

  let storedUrl = dataUrl;
  let fileStorageType = "firestore";

  // If a large PDF exceeds Firestore's ~1 MB doc limit, save Base64 in local IndexedDB
  if (dataUrl.length > FIRESTORE_SAFE_BASE64_LIMIT) {
    await saveLocalFileData(resourceId, dataUrl);
    storedUrl = `local://${resourceId}`;
    fileStorageType = "local";
  }

  const uploaderName =
    (profile && profile.fullName) || user.displayName || user.email || "Student";

  const resourcePayload = {
    resourceId,
    title: title.trim(),
    subject: subject.trim(),
    semester: String(semester),
    category,
    description: description.trim(),
    fileURL: storedUrl,
    fileName: file.name,
    fileType: file.type || (isPdf ? "application/pdf" : "image/jpeg"),
    fileStorageType,
    fileSize: file.size,
    uploadedBy: user.uid,
    uploaderName,
    status: "pending",
    createdAt: serverTimestamp()
  };

  try {
    await setDoc(newDocRef, resourcePayload);
    if (typeof onProgress === "function") onProgress(100);
    return resourcePayload;
  } catch (error) {
    if (fileStorageType === "local") {
      await deleteLocalFileData(resourceId);
    }
    throw new Error(mapFirebaseError(error));
  }
}

export async function updateResourceDetails(resourceId, updates) {
  if (!isFirebaseConfigured() || !db) {
    throw new Error("Firebase is not configured.");
  }

  try {
    const resourceRef = doc(db, "RESOURCES", resourceId);
    await updateDoc(resourceRef, {
      title: updates.title.trim(),
      subject: updates.subject.trim(),
      semester: String(updates.semester),
      category: updates.category,
      description: updates.description.trim(),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    throw new Error(mapFirebaseError(error));
  }
}

/**
 * Deletes a resource document from Firestore and cleans up any local IndexedDB copy.
 */
export async function deleteResourceAndFile(resource) {
  if (!isFirebaseConfigured() || !db) {
    throw new Error("Firebase is not configured.");
  }

  const resourceId = resource.resourceId || resource.id;

  try {
    await deleteDoc(doc(db, "RESOURCES", resourceId));
    if (resource.fileStorageType === "local" || (resource.fileURL || "").startsWith("local://")) {
      await deleteLocalFileData(resourceId);
    }
  } catch (error) {
    throw new Error(mapFirebaseError(error));
  }
}

export function filterResources(resources, { search = "", subject = "", semester = "", category = "" }) {
  const queryText = search.trim().toLowerCase();

  return resources.filter((item) => {
    const matchesSearch =
      !queryText ||
      (item.title || "").toLowerCase().includes(queryText) ||
      (item.subject || "").toLowerCase().includes(queryText) ||
      (item.description || "").toLowerCase().includes(queryText) ||
      (item.uploaderName || "").toLowerCase().includes(queryText);

    const matchesSubject =
      !subject ||
      (item.subject || "").toLowerCase() === subject.toLowerCase();

    const matchesSemester =
      !semester || String(item.semester) === String(semester);

    const matchesCategory =
      !category || item.category === category;

    return matchesSearch && matchesSubject && matchesSemester && matchesCategory;
  });
}

/**
 * Downloads a Base64 Data URL (stored in Firestore) or local IndexedDB file.
 */
export async function downloadPdfFile(fileURL, fileName = "study-material") {
  if (!fileURL) {
    showToast("File data is unavailable for this resource.", "error");
    return;
  }

  try {
    let resolvedUrl = fileURL;

    if (fileURL.startsWith("local://")) {
      const localId = fileURL.replace("local://", "");
      const localData = await getLocalFileData(localId);
      if (!localData) {
        showToast("This large file is stored locally on the uploader's browser and is not available on this device.", "error");
        return;
      }
      resolvedUrl = localData;
    }

    const link = document.createElement("a");
    link.href = resolvedUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();

    showToast(`Downloading ${fileName}`, "success");
  } catch {
    showToast("Could not download this file.", "error");
  }
}
