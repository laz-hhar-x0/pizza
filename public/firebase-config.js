
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD97MNuDkCFI9uZu_PyAnuQG34x_ppTTUk",
  authDomain: "marrio-6c689.firebaseapp.com",
  projectId: "marrio-6c689",
  storageBucket: "marrio-6c689.firebasestorage.app",
  messagingSenderId: "8980716688",
  appId: "1:8980716688:web:0ac830a53d4ec17a2a8c15",
  measurementId: "G-4GTK035B30"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);