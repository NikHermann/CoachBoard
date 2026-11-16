import { initializeApp } from "firebase/app";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import {
  isLocalAuthTestMode,
  LOCAL_AUTH_HOST,
  LOCAL_AUTH_PORT,
  LOCAL_AUTH_PROJECT_ID,
  LOCAL_FIRESTORE_HOST,
  LOCAL_FIRESTORE_PORT
} from "./localAuthTestMode.js";

const productionFirebaseConfig = {
  apiKey: "AIzaSyDZiVeu6XwSUX9T7pzEGEyxZZ2W_nitUag",
  authDomain: "coachboarddb.firebaseapp.com",
  projectId: "coachboarddb",
  storageBucket: "coachboarddb.firebasestorage.app",
  messagingSenderId: "186136200081",
  appId: "1:186136200081:web:77b302b70727abb04a5030"
};

const localFirebaseConfig = {
  apiKey: "synthetic-emulator-key",
  authDomain: `${LOCAL_AUTH_PROJECT_ID}.firebaseapp.com`,
  projectId: LOCAL_AUTH_PROJECT_ID,
  storageBucket: `${LOCAL_AUTH_PROJECT_ID}.appspot.com`,
  appId: "synthetic-emulator-app"
};

const firebaseConfig = isLocalAuthTestMode ? localFirebaseConfig : productionFirebaseConfig;

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

if (isLocalAuthTestMode) {
  connectAuthEmulator(auth, `http://${LOCAL_AUTH_HOST}:${LOCAL_AUTH_PORT}`, { disableWarnings: true });
  connectFirestoreEmulator(db, LOCAL_FIRESTORE_HOST, LOCAL_FIRESTORE_PORT);
}

export { db, auth, firebaseConfig, isLocalAuthTestMode };
