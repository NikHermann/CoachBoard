import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDZiVeu6XwSUX9T7pzEGEyxZZ2W_nitUag",
  authDomain: "coachboarddb.firebaseapp.com",
  projectId: "coachboarddb",
  storageBucket: "coachboarddb.firebasestorage.app",
  messagingSenderId: "186136200081",
  appId: "1:186136200081:web:77b302b70727abb04a5030"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };