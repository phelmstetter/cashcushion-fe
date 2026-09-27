import { auth } from './firebase';
import { createReconciliationApi } from './reconciliation';

export const reconciliationApi = createReconciliationApi({
  getIdToken: async () => auth.currentUser ? auth.currentUser.getIdToken() : null,
  getUrl: () => import.meta.env.VITE_MANUAL_RECONCILIATION_API_URL,
  send: (input, init) => fetch(input, init),
});