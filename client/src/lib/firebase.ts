import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  query, 
  orderBy, 
  limit, 
  startAfter, 
  getDocs,
  where,
  QueryDocumentSnapshot,
  DocumentData
} from 'firebase/firestore';

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
  try {
    console.log('Saving user to Firestore:', user.uid);
    const userRef = doc(db, 'users', user.uid);
    
    const userData: UserData = {
      user_id: user.uid,
      email: user.email || '',
      profile_pic: user.photoURL || '',
      plaid_sync_error: false
    };
    
    await setDoc(userRef, userData, { merge: true });
    console.log('User saved successfully to firestore-users');
  } catch (error) {
    console.error('Error saving user to Firestore:', error);
    throw error;
  }
}

export async function getUserFromFirestore(userId: string): Promise<UserData | null> {
  const userRef = doc(db, 'users', userId);
  const docSnap = await getDoc(userRef);
  
  if (docSnap.exists()) {
    return docSnap.data() as UserData;
  }
  
  return null;
}

export interface Transaction {
  id: string;
  amount: number;
  date: string;
  counterparty_name: string;
  merchant_name?: string;
  logo_url?: string;
}

export interface TransactionsResult {
  transactions: Transaction[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

export async function getTransactions(
  userId: string,
  lastDoc?: QueryDocumentSnapshot<DocumentData> | null,
  pageSize: number = 20
): Promise<TransactionsResult> {
  const transactionsRef = collection(db, 'transactions');
  
  let q;
  if (lastDoc) {
    q = query(
      transactionsRef,
      where('user_id', '==', userId),
      orderBy('date', 'asc'),
      startAfter(lastDoc),
      limit(pageSize)
    );
  } else {
    q = query(
      transactionsRef,
      where('user_id', '==', userId),
      orderBy('date', 'asc'),
      limit(pageSize)
    );
  }
  
  const querySnapshot = await getDocs(q);
  const transactions: Transaction[] = [];
  
  querySnapshot.forEach((doc) => {
    const data = doc.data();
    transactions.push({
      id: doc.id,
      amount: data.amount,
      date: data.date,
      counterparty_name: data.counterparty_name || data.name || 'Unknown',
      merchant_name: data.merchant_name,
      logo_url: data.logo_url
    });
  });
  
  const lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1] || null;
  const hasMore = querySnapshot.docs.length === pageSize;
  
  return { transactions, lastDoc: lastVisible, hasMore };
}
