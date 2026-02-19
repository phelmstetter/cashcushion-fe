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
  addDoc,
  updateDoc,
  deleteDoc
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

export interface Account {
  id: string;
  mask: string;
  name: string;
  official_name?: string;
  subtype?: string;
  type?: string;
}

export async function getAccounts(userId: string): Promise<Account[]> {
  const accountsRef = collection(db, 'accounts');
  const q = query(accountsRef, where('user_id', '==', userId));
  const querySnapshot = await getDocs(q);
  const accounts: Account[] = [];
  querySnapshot.forEach((doc) => {
    const data = doc.data();
    accounts.push({
      id: doc.id,
      mask: data.mask || '',
      name: data.name || data.official_name || '',
      official_name: data.official_name,
      subtype: data.subtype,
      type: data.type
    });
  });
  return accounts.sort((a, b) => a.name.localeCompare(b.name));
}

export interface Transaction {
  id: string;
  amount: number;
  date: string;
  counterparty_name: string;
  merchant_name?: string;
  merchant_entity_id?: string;
  logo_url?: string;
  account_mask?: string;
  account_name?: string;
}

export interface TransactionsResult {
  transactions: Transaction[];
  lastDate: string | null;
  lastId: string | null;
  hasMore: boolean;
}

export async function getTransactions(
  userId: string,
  cursor?: { date: string; id: string } | null,
  pageSize: number = 20
): Promise<TransactionsResult> {
  const transactionsRef = collection(db, 'transactions');
  
  let q;
  if (cursor) {
    q = query(
      transactionsRef,
      where('user_id', '==', userId),
      orderBy('date', 'desc'),
      orderBy('__name__', 'desc'),
      startAfter(cursor.date, cursor.id),
      limit(pageSize)
    );
  } else {
    q = query(
      transactionsRef,
      where('user_id', '==', userId),
      orderBy('date', 'desc'),
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
      logo_url: data.logo_url,
      account_mask: data.account_mask,
      account_name: data.account_name
    });
  });
  
  const lastTransaction = transactions[transactions.length - 1];
  const hasMore = querySnapshot.docs.length === pageSize;
  
  return { 
    transactions, 
    lastDate: lastTransaction?.date || null,
    lastId: lastTransaction?.id || null,
    hasMore 
  };
}

export interface Forecast {
  id?: string;
  user_id: string;
  merchant_name: string;
  merchant_entity_id?: string | null;
  date: string;
  amount: number;
  created_at: string;
  matched_transaction_id?: string | null;
  series_id?: string | null;
  account_mask?: string | null;
  account_name?: string | null;
}

export async function saveForecast(forecast: Forecast): Promise<string> {
  const forecastsRef = collection(db, 'forecasts');
  const docRef = await addDoc(forecastsRef, forecast);
  return docRef.id;
}

export async function saveSeriesForecasts(
  baseForecast: Omit<Forecast, 'id' | 'date'>,
  startDate: string,
  monthCount: number
): Promise<string> {
  const seriesId = crypto.randomUUID ? crypto.randomUUID() : `series_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const forecastsRef = collection(db, 'forecasts');

  for (let i = 0; i < monthCount; i++) {
    const d = new Date(startDate + 'T00:00:00');
    d.setMonth(d.getMonth() + i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');

    await addDoc(forecastsRef, {
      ...baseForecast,
      date: `${yyyy}-${mm}-${dd}`,
      series_id: seriesId
    });
  }

  return seriesId;
}

export async function updateForecast(forecastId: string, updates: Partial<Pick<Forecast, 'date' | 'amount'>>): Promise<void> {
  const forecastRef = doc(db, 'forecasts', forecastId);
  await updateDoc(forecastRef, updates);
}

export async function updateSeriesForecasts(
  seriesId: string,
  userId: string,
  updates: { amount?: number }
): Promise<void> {
  const forecastsRef = collection(db, 'forecasts');
  const q = query(
    forecastsRef,
    where('user_id', '==', userId),
    where('series_id', '==', seriesId)
  );
  const snapshot = await getDocs(q);
  const promises: Promise<void>[] = [];
  snapshot.forEach((d) => {
    promises.push(updateDoc(doc(db, 'forecasts', d.id), updates));
  });
  await Promise.all(promises);
}

export async function getForecasts(userId: string): Promise<Forecast[]> {
  const forecastsRef = collection(db, 'forecasts');
  const q = query(
    forecastsRef,
    where('user_id', '==', userId),
    orderBy('date', 'desc')
  );
  const querySnapshot = await getDocs(q);
  const forecasts: Forecast[] = [];
  querySnapshot.forEach((doc) => {
    const data = doc.data();
    forecasts.push({
      id: doc.id,
      user_id: data.user_id,
      merchant_name: data.merchant_name,
      merchant_entity_id: data.merchant_entity_id,
      date: data.date,
      amount: data.amount,
      created_at: data.created_at,
      matched_transaction_id: data.matched_transaction_id || null,
      series_id: data.series_id || null,
      account_mask: data.account_mask || null,
      account_name: data.account_name || null
    });
  });
  return forecasts;
}

export async function deleteForecast(forecastId: string): Promise<void> {
  const forecastRef = doc(db, 'forecasts', forecastId);
  await deleteDoc(forecastRef);
}

export async function deleteSeriesForecasts(seriesId: string, userId: string): Promise<void> {
  const forecastsRef = collection(db, 'forecasts');
  const q = query(
    forecastsRef,
    where('user_id', '==', userId),
    where('series_id', '==', seriesId)
  );
  const snapshot = await getDocs(q);
  const promises: Promise<void>[] = [];
  snapshot.forEach((d) => {
    promises.push(deleteDoc(doc(db, 'forecasts', d.id)));
  });
  await Promise.all(promises);
}

export async function reconcileForecast(forecastId: string, transactionId: string): Promise<void> {
  const forecastRef = doc(db, 'forecasts', forecastId);
  await updateDoc(forecastRef, {
    matched_transaction_id: transactionId
  });
}
