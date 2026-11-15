// ============================================================================
// CAMPUSCONNECT — FIREBASE AUTHENTICATION & USER PROFILE SERVICE
// ============================================================================

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import {
  auth,
  db,
  ADMIN_EMAIL,
  isFirebaseConfigured
} from "./firebase-config.js";
import { mapFirebaseError } from "./ui.js";

export function isAdminUser(user) {
  if (!user) return false;
  return (user.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

/**
 * Registers a new student with Firebase Auth and saves profile in Firestore USERS collection.
 * Always assigns role: "student" — students can never grant themselves admin access.
 */
export async function registerStudent({ fullName, email, college, semester, password }) {
  if (!isFirebaseConfigured() || !auth || !db) {
    throw new Error("Firebase is not configured yet. Please paste your firebaseConfig in js/firebase-config.js.");
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail === ADMIN_EMAIL.toLowerCase()) {
    throw new Error("The administrator email is reserved. Please register with your student email address.");
  }

  try {
    const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
    const user = credential.user;

    await updateProfile(user, { displayName: fullName.trim() });

    const profileData = {
      uid: user.uid,
      fullName: fullName.trim(),
      email: normalizedEmail,
      college: college.trim(),
      semester: String(semester),
      role: "student",
      createdAt: serverTimestamp()
    };

    await setDoc(doc(db, "USERS", user.uid), profileData);

    return { user, profile: profileData };
  } catch (error) {
    throw new Error(mapFirebaseError(error));
  }
}

/**
 * Signs in a student or administrator with email & password.
 */
export async function loginUser(email, password) {
  if (!isFirebaseConfigured() || !auth) {
    throw new Error("Firebase is not configured yet. Please paste your firebaseConfig in js/firebase-config.js.");
  }

  try {
    const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
    const profile = await fetchUserProfile(credential.user);
    return { user: credential.user, profile };
  } catch (error) {
    throw new Error(mapFirebaseError(error));
  }
}

/**
 * Logs out the current user.
 */
export async function logoutUser() {
  if (!auth) return;
  await signOut(auth);
}

/**
 * Fetches the user's profile from Firestore USERS/{uid}.
 * If the verified admin signs in for the first time (created in Firebase Auth Console),
 * automatically initializes their USERS/{uid} profile with role "admin".
 */
export async function fetchUserProfile(user) {
  if (!user || !db) return null;

  try {
    const userRef = doc(db, "USERS", user.uid);
    const snap = await getDoc(userRef);

    const isAdminEmail = (user.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase();

    if (snap.exists()) {
      const data = snap.data();
      if (isAdminEmail && data.role !== "admin") {
        await updateDoc(userRef, { role: "admin" });
        return { ...data, role: "admin" };
      }
      return data;
    }

    // Bootstrap profile if Admin was created directly via Firebase Console
    if (isAdminEmail) {
      const adminProfile = {
        uid: user.uid,
        fullName: user.displayName || "CampusConnect Admin",
        email: user.email.toLowerCase(),
        college: "CampusConnect Administration",
        semester: "8",
        role: "admin",
        createdAt: serverTimestamp()
      };
      await setDoc(userRef, adminProfile);
      return adminProfile;
    }

    return {
      uid: user.uid,
      fullName: user.displayName || "Student",
      email: user.email || "",
      college: "",
      semester: "1",
      role: "student"
    };
  } catch (error) {
    console.error("Failed to fetch user profile:", error);
    return null;
  }
}

/**
 * Subscribes to Firebase Authentication state changes.
 */
export function subscribeAuthState(callback) {
  if (!isFirebaseConfigured() || !auth) {
    callback(null, null);
    return () => {};
  }

  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      callback(null, null);
      return;
    }
    const profile = await fetchUserProfile(user);
    callback(user, profile);
  });
}
