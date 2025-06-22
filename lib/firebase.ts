import { initializeApp } from "firebase/app"
import { getAuth } from "firebase/auth"
import { getDatabase } from "firebase/database"
import { getStorage } from "firebase/storage"
import { getAnalytics, isSupported } from "firebase/analytics"

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAw5j4m56D5XGPbGJwIVqMxddamxWjteDY",
  authDomain: "web-chat-77ed2.firebaseapp.com",
  projectId: "web-chat-77ed2",
  storageBucket: "web-chat-77ed2.firebasestorage.app",
  messagingSenderId: "363343369249",
  appId: "1:363343369249:web:9351e35a54d2b9e1183f60",
  measurementId: "G-FM5LKJ9ENY",
  databaseURL: "https://web-chat-77ed2-default-rtdb.firebaseio.com", // Add your database URL here
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)

// Initialize Firebase services
export const auth = getAuth(app)
export const database = getDatabase(app)
export const storage = getStorage(app)

// Initialize Analytics conditionally (it might not be supported in all environments)
export const initializeAnalytics = async () => {
  if (await isSupported()) {
    return getAnalytics(app)
  }
  return null
}

export default app
