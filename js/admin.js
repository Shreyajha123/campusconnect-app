// ============================================================================
// CAMPUSCONNECT — ADMIN MODERATION & ANALYTICS SERVICE
// ============================================================================

import {
  collection,
  doc,
  getDocs,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { db, isFirebaseConfigured } from "./firebase-config.js";
import { deleteResourceAndFile } from "./resources.js";
import { getTimestampMillis, mapFirebaseError } from "./ui.js";

/**
 * Fetches all student & admin records and all resources for the Admin Dashboard.
 */
export async function fetchAdminOverview() {
  if (!isFirebaseConfigured() || !db) {
    return { users: [], resources: [] };
  }

  try {
    const [usersSnap, resourcesSnap] = await Promise.all([
      getDocs(collection(db, "USERS")),
      getDocs(collection(db, "RESOURCES"))
    ]);

    const users = [];
    usersSnap.forEach((docSnap) => {
      users.push({ id: docSnap.id, ...docSnap.data() });
    });
    users.sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));

    const resources = [];
    resourcesSnap.forEach((docSnap) => {
      resources.push({ id: docSnap.id, ...docSnap.data() });
    });
    resources.sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));

    return { users, resources };
  } catch (error) {
    throw new Error(mapFirebaseError(error));
  }
}

/**
 * Approves or rejects an uploaded resource (Admin only).
 */
export async function setResourceStatus(resourceId, newStatus) {
  if (!isFirebaseConfigured() || !db) {
    throw new Error("Firebase is not configured.");
  }

  if (!["approved", "rejected", "pending"].includes(newStatus)) {
    throw new Error("Invalid status.");
  }

  try {
    await updateDoc(doc(db, "RESOURCES", resourceId), {
      status: newStatus,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    throw new Error(mapFirebaseError(error));
  }
}

/**
 * Deletes an inappropriate resource from both Firestore and Firebase Storage (Admin only).
 */
export async function adminDeleteResource(resource) {
  return deleteResourceAndFile(resource);
}
