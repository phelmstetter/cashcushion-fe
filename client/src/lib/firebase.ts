import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_API_KEY,
  authDomain: import.meta.env.VITE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_APP_ID
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

export interface UserData {
  user_id: string;
  email: string;
  profile_pic: string;
  plaid_sync_error: boolean;
}

export async function saveUserToFirestore(user: {
  uid: string;
  email: string | null;
  photoURL: string | null;
}): Promise<void> {
  const userRef = doc(db, 'firestore-users', user.uid);
  
  const existingDoc = await getDoc(userRef);
  
  if (!existingDoc.exists()) {
    const userData: UserData = {
      user_id: user.uid,
      email: user.email || '',
      profile_pic: user.photoURL || '',
      plaid_sync_error: false
    };
    
    await setDoc(userRef, userData);
  } else {
    await setDoc(userRef, {
      email: user.email || '',
      profile_pic: user.photoURL || ''
    }, { merge: true });
  }
}

export async function getUserFromFirestore(userId: string): Promise<UserData | null> {
  const userRef = doc(db, 'firestore-users', userId);
  const docSnap = await getDoc(userRef);
  
  if (docSnap.exists()) {
    return docSnap.data() as UserData;
  }
  
  return null;
}
