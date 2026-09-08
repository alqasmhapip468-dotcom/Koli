import { getApp, getApps, initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  getAuth,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithRedirect,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  updatePassword,
  verifyPasswordResetCode,
  confirmPasswordReset,
  type User,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyArSHAUZaxJ660H9pr2-5V4nq8fxmRhb_c",
  authDomain: "souq-7b80f.firebaseapp.com",
  projectId: "souq-7b80f",
  storageBucket: "souq-7b80f.firebasestorage.app",
  messagingSenderId: "136094601941",
  appId: "1:136094601941:web:a96613b17ab91823b8885c",
  measurementId: "G-GWC3TRSTR5",
};

const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const googleProvider = new GoogleAuthProvider();
export { confirmPasswordReset, createUserWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithRedirect, signOut, updatePassword, verifyPasswordResetCode };
export type { User };
