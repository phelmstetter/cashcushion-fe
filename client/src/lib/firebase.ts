import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeAppCheck, ReCaptchaV3Provider, getToken } from 'firebase/app-check';
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
  deleteDoc,
  writeBatch
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_API_KEY,
  authDomain: import.meta.env.VITE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_APP_ID
};

// Debug tokens must only be supplied through a local, uncommitted .env.local.
// Production builds never enable the App Check debug bypass.
if (import.meta.env.DEV && import.meta.env.VITE_APP_CHECK_DEBUG_TOKEN) {
  (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APP_CHECK_DEBUG_TOKEN;
}

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

// App Check uses reCAPTCHA v3 in production. Set VITE_RECAPTCHA_SITE_KEY in
// the deployment environment; see SECURITY.md for safe local debug setup.
export const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider(
    import.meta.env.VITE_RECAPTCHA_SITE_KEY ?? 'debug-placeholder'
  ),
  isTokenAutoRefreshEnabled: true,
});

export async function getAppCheckToken(): Promise<string | null> {
  try {
    const result = await getToken(appCheck, false);
    return result.token;
  } catch {
    return null;
  }
}

export interface UserData {
  user_id: string;
  email: string;
  profile_pic: string;
  plaid_sync_error?: boolean;
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
  account_id: string;
  mask: string;
  name: string;
  official_name?: string;
  subtype?: string;
  type?: string;
  available_balance?: number | null;
  current_balance?: number | null;
  plaid_institution_id?: string | null;
  plaid_institution_name?: string | null;
  plaid_item_id?: string | null;
}

type CacheEntry<T> = { value: T; expiresAt: number };
const accountsCache = new Map<string, CacheEntry<Account[]>>();
const forecastsCache = new Map<string, CacheEntry<Forecast[]>>();
const transactionsCache = new Map<string, CacheEntry<TransactionsResult>>();
const CACHE_TTL_MS = 60_000;
const TRANSACTION_CACHE_LIMIT = 40;

function readCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheValue<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T): T {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

/**
 * Removes locally cached dashboard reads after a mutation. The cache is
 * intentionally short-lived, but explicit invalidation keeps mutations
 * immediately truthful while avoiding refetches during normal navigation.
 */
export function invalidateDashboardCache(userId: string, scopes: Array<'accounts' | 'forecasts' | 'transactions'> = ['accounts', 'forecasts', 'transactions']): void {
  if (scopes.includes('accounts')) accountsCache.delete(userId);
  if (scopes.includes('forecasts')) forecastsCache.delete(userId);
  if (scopes.includes('transactions')) {
    Array.from(transactionsCache.keys()).forEach((key) => {
      if (key.startsWith(`${userId}:`)) transactionsCache.delete(key);
    });
  }
}

export async function getAccounts(userId: string): Promise<Account[]> {
  const cached = readCached(accountsCache, userId);
  if (cached) return cached;
  const accountsRef = collection(db, 'accounts');
  const q = query(accountsRef, where('user_id', '==', userId));
  const [querySnapshot, removedIds] = await Promise.all([
    getDocs(q),
    getRemovedAccountIds(userId),
  ]);
  const accountsById = new Map<string, Account>();
  querySnapshot.forEach((d) => {
    const data = d.data();
    const acct: Account = {
      id: d.id,
      account_id: data.account_id || '',
      mask: data.mask || '',
      name: data.name || data.official_name || '',
      official_name: data.official_name,
      subtype: data.subtype,
      type: data.type,
      available_balance: data.available_balance ?? null,
      current_balance: data.current_balance ?? null,
      plaid_institution_id: data.plaid_institution_id || null,
      plaid_institution_name: data.plaid_institution_name || null,
      plaid_item_id: data.plaid_item_id || null,
    };
    // Skip accounts the user has explicitly removed.
    if (removedIds.has(acct.account_id)) return;
    const existing = accountsById.get(acct.account_id);
    if (!existing) {
      accountsById.set(acct.account_id, acct);
    } else {
      // Keep the doc with the higher current_balance (fall back to available_balance)
      const existingScore = existing.current_balance ?? existing.available_balance ?? 0;
      const newScore = acct.current_balance ?? acct.available_balance ?? 0;
      if (newScore > existingScore) {
        accountsById.set(acct.account_id, acct);
      }
    }
  });
  const accounts = Array.from(accountsById.values());
  return cacheValue(accountsCache, userId, accounts.sort((a, b) => a.name.localeCompare(b.name)));
}

async function getRemovedAccountIds(userId: string): Promise<Set<string>> {
  const snap = await getDocs(
    query(collection(db, 'removed_accounts'), where('user_id', '==', userId))
  );
  const ids = new Set<string>();
  snap.forEach((d) => ids.add(d.data().account_id as string));
  return ids;
}

export interface PlaidAccountData {
  account_id: string;
  name: string;
  official_name: string | null;
  mask: string;
  type: string;
  subtype: string | null;
  available_balance: number | null;
  current_balance: number | null;
}

export interface Transaction {
  id: string;
  amount: number;
  date: string;
  counterparty_name: string;
  merchant_name?: string;
  merchant_entity_id?: string;
  logo_url?: string;
  account_id?: string;
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
  const cacheKey = `${userId}:${cursor?.date ?? 'first'}:${cursor?.id ?? 'page'}:${pageSize}`;
  const cached = readCached(transactionsCache, cacheKey);
  if (cached) return cached;
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
      orderBy('__name__', 'desc'),
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
      merchant_entity_id: data.merchant_entity_id || null,
      logo_url: data.logo_url,
      account_id: data.account_id
    });
  });
  
  const lastTransaction = transactions[transactions.length - 1];
  const hasMore = querySnapshot.docs.length === pageSize;
  
  const result = {
    transactions, 
    lastDate: lastTransaction?.date || null,
    lastId: lastTransaction?.id || null,
    hasMore 
  };
  cacheValue(transactionsCache, cacheKey, result);
  if (transactionsCache.size > TRANSACTION_CACHE_LIMIT) {
    const oldestKey = transactionsCache.keys().next().value;
    if (oldestKey) transactionsCache.delete(oldestKey);
  }
  return result;
}

export interface Forecast {
  id?: string;
  user_id: string;
  name: string;
  merchant_entity_id?: string | null;
  date: string;
  amount: number;
  created_at: string;
  matched_transaction_id?: string | null;
  series_id?: string | null;
  account_id?: string | null;
  logo_url?: string | null;
  forecast_type?: 'single' | 'monthly' | 'every_x_days' | null;
  forecast_interval?: number | null;
  auto_extend?: boolean;
}

export async function saveForecast(forecast: Forecast): Promise<string> {
  const forecastsRef = collection(db, 'forecasts');
  const docRef = await addDoc(forecastsRef, forecast);
  return docRef.id;
}

async function commitInBatches(
  writes: Array<(batch: ReturnType<typeof writeBatch>) => void>
): Promise<void> {
  const MAX_BATCH_WRITES = 450;
  for (let start = 0; start < writes.length; start += MAX_BATCH_WRITES) {
    const batch = writeBatch(db);
    writes.slice(start, start + MAX_BATCH_WRITES).forEach((write) => write(batch));
    await batch.commit();
  }
}

export async function saveSeriesForecasts(
  baseForecast: Omit<Forecast, 'id' | 'date'>,
  startDate: string,
  monthCount: number
): Promise<string> {
  const seriesId = crypto.randomUUID ? crypto.randomUUID() : `series_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const forecastsRef = collection(db, 'forecasts');

  const writes: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];
  for (let i = 0; i < monthCount; i++) {
    const d = new Date(startDate + 'T00:00:00');
    d.setMonth(d.getMonth() + i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');

    const forecastRef = doc(forecastsRef);
    writes.push((batch) => batch.set(forecastRef, {
      ...baseForecast,
      date: `${yyyy}-${mm}-${dd}`,
      series_id: seriesId
    }));
  }
  await commitInBatches(writes);

  return seriesId;
}

export async function saveDayIntervalForecasts(
  baseForecast: Omit<Forecast, 'id' | 'date'>,
  startDate: string,
  dayInterval: number,
  count: number
): Promise<string> {
  const seriesId = crypto.randomUUID ? crypto.randomUUID() : `series_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const forecastsRef = collection(db, 'forecasts');

  const writes: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(startDate + 'T00:00:00');
    d.setDate(d.getDate() + (dayInterval * i));
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');

    const forecastRef = doc(forecastsRef);
    writes.push((batch) => batch.set(forecastRef, {
      ...baseForecast,
      date: `${yyyy}-${mm}-${dd}`,
      series_id: seriesId
    }));
  }
  await commitInBatches(writes);

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
  const writes = snapshot.docs.map((snapshotDoc) => (
    (batch: ReturnType<typeof writeBatch>) => batch.update(snapshotDoc.ref, updates)
  ));
  await commitInBatches(writes);
}

export async function getForecasts(userId: string): Promise<Forecast[]> {
  const cached = readCached(forecastsCache, userId);
  if (cached) return cached;
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
      name: data.name,
      merchant_entity_id: data.merchant_entity_id,
      date: data.date,
      amount: data.amount,
      created_at: data.created_at,
      matched_transaction_id: data.matched_transaction_id || null,
      series_id: data.series_id || null,
      account_id: data.account_id || null,
      logo_url: data.logo_url || null,
      forecast_type: data.forecast_type || 'single',
      forecast_interval: data.forecast_interval ?? null,
      auto_extend: Boolean(data.auto_extend)
    });
  });
  return cacheValue(forecastsCache, userId, forecasts);
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
  const writes = snapshot.docs.map((snapshotDoc) => (
    (batch: ReturnType<typeof writeBatch>) => batch.delete(snapshotDoc.ref)
  ));
  await commitInBatches(writes);
}

export async function reconcileForecast(forecastId: string, transactionId: string, userId: string): Promise<void> {
  const forecastRef = doc(db, 'forecasts', forecastId);
  await updateDoc(forecastRef, {
    matched_transaction_id: transactionId
  });
  invalidateDashboardCache(userId, ['forecasts']);
}

export async function unreconcileForecast(forecastId: string, userId: string): Promise<void> {
  const forecastRef = doc(db, 'forecasts', forecastId);
  await updateDoc(forecastRef, {
    matched_transaction_id: null
  });
  invalidateDashboardCache(userId, ['forecasts']);
}
