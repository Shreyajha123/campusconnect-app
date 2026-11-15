// ============================================================================
// CAMPUSCONNECT — FIREBASE CONFIGURATION (AUTH & FIRESTORE ONLY)
// ============================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyBtuYDQ1ryw1UHoSEkPBbgJhBouZ29ignU",
  authDomain: "campusconnect-c0423.firebaseapp.com",
  projectId: "campusconnect-c0423",
  storageBucket: "campusconnect-c0423.firebasestorage.app",
  messagingSenderId: "918319489667",
  appId: "1:918319489667:web:d5a7590d342e86abde31b6"
};

export const ADMIN_EMAIL = "eng25cs0761@dsu.edu.in";

/**
 * Checks whether the firebaseConfig object contains real project credentials.
 */
export function isFirebaseConfigured() {
  return Boolean(
    firebaseConfig.apiKey &&
    !firebaseConfig.apiKey.startsWith("YOUR_") &&
    firebaseConfig.projectId &&
    !firebaseConfig.projectId.startsWith("YOUR_") &&
    firebaseConfig.appId &&
    !firebaseConfig.appId.startsWith("YOUR_")
  );
}

let app = null;
let auth = null;
let db = null;
let initError = null;

if (isFirebaseConfigured()) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (err) {
    initError = err instanceof Error ? err.message : String(err);
    console.error("Firebase initialization failed:", err);
  }
}

export { app, auth, db, initError };
