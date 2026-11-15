declare module 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js' {
  export function initializeApp(config: Record<string, unknown>): any;
}

declare module 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js' {
  export function getAuth(app?: any): any;
  export function createUserWithEmailAndPassword(auth: any, email: string, password: string): Promise<any>;
  export function signInWithEmailAndPassword(auth: any, email: string, password: string): Promise<any>;
  export function signOut(auth: any): Promise<void>;
  export function updateProfile(user: any, profile: { displayName?: string | null; photoURL?: string | null }): Promise<void>;
  export function onAuthStateChanged(auth: any, callback: (user: any) => void): () => void;
}

declare module 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js' {
  export function getFirestore(app?: any): any;
  export function collection(db: any, path: string, ...pathSegments: string[]): any;
  export function doc(db: any, path: string, ...pathSegments: string[]): any;
  export function setDoc(ref: any, data: Record<string, unknown>): Promise<void>;
  export function addDoc(ref: any, data: Record<string, unknown>): Promise<any>;
  export function getDoc(ref: any): Promise<any>;
  export function getDocs(queryRef: any): Promise<any>;
  export function updateDoc(ref: any, data: Record<string, unknown>): Promise<void>;
  export function deleteDoc(ref: any): Promise<void>;
  export function query(ref: any, ...constraints: any[]): any;
  export function where(field: string, op: string, value: unknown): any;
  export function orderBy(field: string, direction?: 'asc' | 'desc'): any;
  export function serverTimestamp(): any;
}
