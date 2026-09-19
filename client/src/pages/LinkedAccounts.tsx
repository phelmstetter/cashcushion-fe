import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { usePlaidLink } from 'react-plaid-link';
import { auth, getAccounts, type Account } from '@/lib/firebase';
import { apiFetch } from '@/lib/queryClient';

// Many US banks require an OAuth login step in Plaid Link: the user gets
// redirected to their bank's real login page and back via a full page
// navigation, which wipes React state entirely. To resume the flow we persist
// the in-flight link token (and which item, if any, is being updated) in
// sessionStorage before handing off, and restore it on load if the URL comes
// back with Plaid's `oauth_state_id` marker.
const OAUTH_LINK_TOKEN_KEY = 'plaid_oauth_link_token';
const OAUTH_UPDATING_ITEM_KEY = 'plaid_oauth_updating_item_id';

function getRedirectUri(): string | undefined {
  const uri = new URL('/linked-accounts', window.location.origin);
  // OAuth redirects require HTTPS. Omit the optional redirect for local HTTP
  // development instead of sending an unapproved client value to the server.
  return uri.protocol === 'https:' ? uri.toString() : undefined;
}

function isOAuthRedirect() {
  return new URLSearchParams(window.location.search).has('oauth_state_id');
}

export default function LinkedAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingItemId, setRemovingItemId] = useState<string | null>(null);
  const [confirmRemoveKey, setConfirmRemoveKey] = useState<string | null>(null);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [syncingItemId, setSyncingItemId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<{ itemId: string; ok: boolean; message: string } | null>(null);
  const [receivedRedirectUri, setReceivedRedirectUri] = useState<string | undefined>(undefined);
  const [, navigate] = useLocation();
  const customerError = (err: unknown, fallback: string) => {
    const message = err instanceof Error ? err.message.replace(/^\d{3}:\s*/, '') : '';
    return message && message.length <= 200 ? message : fallback;
  };

  // Resume an in-flight Link session after returning from a bank's OAuth
  // login redirect. Runs once on mount, before the normal "fetch a fresh
  // link token" flows would otherwise kick in.
  useEffect(() => {
    if (!isOAuthRedirect()) return;
    const savedToken = sessionStorage.getItem(OAUTH_LINK_TOKEN_KEY);
    if (!savedToken) return;
    const savedUpdatingItemId = sessionStorage.getItem(OAUTH_UPDATING_ITEM_KEY);
    setLinking(true);
    setUpdatingItemId(savedUpdatingItemId || null);
    setReceivedRedirectUri(window.location.href);
    setLinkToken(savedToken);
  }, []);

  const loadAccounts = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      const accts = await getAccounts(user.uid);
      setAccounts(accts);
      setError(null);
    } catch (err) {
      setError(customerError(err, 'We couldn’t load your linked accounts. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    if (!syncStatus) return;
    const timer = setTimeout(() => setSyncStatus(null), 5000);
    return () => clearTimeout(timer);
  }, [syncStatus]);

  const fetchLinkToken = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) {
      setError('Not signed in. Please sign in and try again.');
      return;
    }
    setError(null);
    try {
      const res = await apiFetch('POST', '/api/plaid/create-link-token', { redirectUri: getRedirectUri() });
      const data = await res.json();
      if (data.link_token) {
        sessionStorage.setItem(OAUTH_LINK_TOKEN_KEY, data.link_token);
        sessionStorage.removeItem(OAUTH_UPDATING_ITEM_KEY);
        setLinkToken(data.link_token);
      } else {
        setError(data?.error || 'We couldn’t start your bank connection. Please try again.');
      }
    } catch (err: any) {
      console.error('Failed to fetch link token:', err);
      setError(customerError(err, 'We couldn’t start your bank connection. Please try again.'));
    }
  }, []);

  interface PlaidFlowResponse {
    ok?: boolean;
    item_id: string;
    error?: string;
  }

  // Clears the persisted OAuth hand-off state and strips Plaid's
  // `oauth_state_id` marker from the URL so refreshing the page doesn't try
  // to resume a finished (or abandoned) Link session.
  const clearOAuthState = () => {
    sessionStorage.removeItem(OAUTH_LINK_TOKEN_KEY);
    sessionStorage.removeItem(OAUTH_UPDATING_ITEM_KEY);
    setReceivedRedirectUri(undefined);
    if (isOAuthRedirect()) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  const onPlaidSuccess = useCallback(async (publicToken: string) => {
    const user = auth.currentUser;
    if (!user) return;

    setLinking(true);
    try {
      if (updatingItemId) {
        // Server handles full reconciliation: deletes stale accounts/transactions/forecasts
        // and upserts fresh accounts — just reload the local list.
        await apiFetch('POST', '/api/plaid/refresh-accounts', { itemId: updatingItemId });
        await loadAccounts();
      } else {
        const res = await apiFetch('POST', '/api/plaid/exchange-token', { publicToken });
        const data: PlaidFlowResponse = await res.json();
        if (data.ok) {
          await loadAccounts();
        } else {
          setError(data.error || 'We couldn’t save your bank connection. Please try again.');
        }
      }
    } catch (err: any) {
      console.error('Failed to complete Plaid flow:', err);
      setError(customerError(err, 'We couldn’t save the account changes. Please try again.'));
    } finally {
      setLinking(false);
      setLinkToken(null);
      setUpdatingItemId(null);
      clearOAuthState();
    }
  }, [loadAccounts, updatingItemId]);

  // react-plaid-link only skips initializing Link when token, publicKey, AND
  // receivedRedirectUri are all unset — a leftover receivedRedirectUri from a
  // prior OAuth attempt is enough to make it initialize Link with a null/
  // undefined token, which Plaid's own SDK rejects with a cryptic
  // "string did not match the expected pattern" error. Only pass
  // receivedRedirectUri through once we actually have a real link token.
  const { open, ready } = usePlaidLink({
    token: linkToken,
    receivedRedirectUri: linkToken ? receivedRedirectUri : undefined,
    onSuccess: (publicToken) => onPlaidSuccess(publicToken),
    onExit: (err) => {
      if (err) {
        // Plaid Link diagnostics stay with the provider/server logs rather
        // than being written into a customer browser console.
        console.info('Plaid Link exited before the bank connection completed.');
        setError('Bank connection was cancelled or failed. Please try again.');
      }
      setLinking(false);
      setLinkToken(null);
      setUpdatingItemId(null);
      clearOAuthState();
    },
  });

  useEffect(() => {
    // In the OAuth-redirect-return case, Link must reopen as soon as it's
    // ready — there's no user click to hang the `open()` call off of.
    if (linkToken && ready) {
      open();
    }
  }, [linkToken, ready, open]);

  const handleAddBank = () => {
    setError(null);
    fetchLinkToken();
  };

  const fetchUpdateLinkToken = useCallback(async (itemId: string) => {
    const user = auth.currentUser;
    if (!user) return;
    setError(null);
    setUpdatingItemId(itemId);
    try {
      const res = await apiFetch('POST', '/api/plaid/create-update-link-token', { itemId, redirectUri: getRedirectUri() });
      const data = await res.json();
      if (data.link_token) {
        sessionStorage.setItem(OAUTH_LINK_TOKEN_KEY, data.link_token);
        sessionStorage.setItem(OAUTH_UPDATING_ITEM_KEY, itemId);
        setLinkToken(data.link_token);
      } else {
        setError(data?.error || 'We couldn’t start the account update. Please try again.');
        setUpdatingItemId(null);
      }
    } catch (err: any) {
      console.error('Failed to fetch update link token:', err);
      setError(customerError(err, 'We couldn’t start the account update. Please try again.'));
      setUpdatingItemId(null);
    }
  }, []);

  const handleSyncItem = useCallback(async (itemId: string) => {
    const user = auth.currentUser;
    if (!user) return;
    setSyncingItemId(itemId);
    setSyncStatus(null);
    try {
      await apiFetch('POST', '/api/plaid/sync-item', { itemId });
      setSyncStatus({ itemId, ok: true, message: 'Sync requested. Your newest transactions will appear shortly.' });
    } catch (err: any) {
      console.error('Failed to request sync:', err);
      setSyncStatus({ itemId, ok: false, message: customerError(err, 'We couldn’t request a bank sync. Please try again.') });
    } finally {
      setSyncingItemId(null);
    }
  }, []);

  const handleRemoveBank = useCallback(async (itemId: string | null, accountsToRemove: Account[]) => {
    const user = auth.currentUser;
    if (!user) return;
    const plaidAccountIds = accountsToRemove.map((a) => a.account_id).filter(Boolean);
    // Use a stable key for tracking removal state: itemId if present, else a
    // sentinel derived from the first doc ID so multiple legacy groups don't collide.
    const removalKey = itemId ?? `legacy_${accountsToRemove[0]?.id ?? 'unknown'}`;
    setRemovingItemId(removalKey);
    setError(null);

    try {
      // The server creates tombstones, revokes the item when present, and
      // removes only the current user's bank-managed records.
      await apiFetch('POST', '/api/plaid/remove-item', { itemId, accountIds: plaidAccountIds });
      await loadAccounts();
      setConfirmRemoveKey(null);
    } catch (err: any) {
      console.error('Failed to complete local account cleanup:', err);
      setError(customerError(err, 'We couldn’t remove this bank connection. Please try again.'));
    } finally {
      setRemovingItemId(null);
    }
  }, [loadAccounts]);

  const grouped: Record<string, { name: string; itemId: string | null; accounts: Account[] }> = {};
  for (const acct of accounts) {
    // Group by plaid_item_id when available so that legacy accounts (no item ID)
    // and actively-linked accounts at the same institution are never merged into
    // the same group. Legacy accounts share a per-institution bucket so they
    // appear as one card per institution rather than one card per account.
    const groupKey = acct.plaid_item_id || `legacy_${acct.plaid_institution_id || 'unknown'}`;
    if (!grouped[groupKey]) {
      grouped[groupKey] = {
        name: acct.plaid_institution_name || acct.name || 'Unknown Institution',
        itemId: acct.plaid_item_id || null,
        accounts: []
      };
    }
    grouped[groupKey].accounts.push(acct);
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        backgroundColor: 'white',
        borderBottom: '1px solid #e0e0e0',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <button
          data-testid="button-back"
          aria-label="Back to dashboard"
          onClick={() => navigate('/home')}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '20px',
            color: '#333',
            padding: '4px 8px',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          ←
        </button>
        <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#333' }}>
          Linked Accounts
        </h1>
      </div>

      <div style={{ padding: '16px', maxWidth: '600px', margin: '0 auto' }}>
        <button
          data-testid="button-add-bank-account"
          onClick={handleAddBank}
          disabled={linking}
          style={{
            display: 'block',
            width: '100%',
            padding: '12px',
            marginBottom: error ? '8px' : '16px',
            fontSize: '15px',
            fontWeight: 600,
            color: 'white',
            backgroundColor: linking ? '#888' : '#333',
            border: 'none',
            borderRadius: '8px',
            cursor: linking ? 'not-allowed' : 'pointer'
          }}
          onMouseEnter={(e) => { if (!linking) e.currentTarget.style.backgroundColor = '#444'; }}
          onMouseLeave={(e) => { if (!linking) e.currentTarget.style.backgroundColor = '#333'; }}
        >
          {linking ? 'Linking...' : '+ Add Bank Account'}
        </button>
        {error && (
          <div
            data-testid="text-link-error"
            role="alert"
            style={{
              marginBottom: '16px',
              padding: '10px 14px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              fontSize: '14px',
              color: '#b91c1c'
            }}
          >
            {error}
            <button
              onClick={loadAccounts}
              style={{ display: 'block', marginTop: '8px', padding: '5px 9px', border: '1px solid #b91c1c', borderRadius: '4px', background: 'white', color: '#b91c1c', cursor: 'pointer' }}
            >
              Retry
            </button>
          </div>
        )}
        {loading ? (
          <div aria-busy="true" style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
            Loading your linked accounts…
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
            No linked accounts found. Add a bank account to see balances and transactions here.
          </div>
        ) : (
          Object.entries(grouped).map(([instId, group]) => (
            <div
              key={instId}
              data-testid={`card-institution-${instId}`}
              style={{
                backgroundColor: 'white',
                borderRadius: '8px',
                border: '1px solid #e0e0e0',
                marginBottom: '16px',
                overflow: 'hidden'
              }}
            >
              <div style={{
                padding: '14px 16px',
                borderBottom: '1px solid #eee',
                fontSize: '16px',
                fontWeight: 600,
                color: '#333'
              }}>
                {group.name}
              </div>
              {group.accounts.map((acct) => (
                <div
                  key={acct.id}
                  data-testid={`row-account-${acct.account_id}`}
                  style={{
                    padding: '12px 16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: '1px solid #f0f0f0'
                  }}
                >
                  <div style={{ fontSize: '14px', color: '#333', fontWeight: 500 }}>
                    {acct.name} {acct.mask}
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: '#333' }}>
                    {acct.available_balance != null
                      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(acct.available_balance)
                      : '—'}
                  </div>
                </div>
              ))}
              <div style={{
                padding: '10px 16px',
                display: 'flex',
                gap: '12px',
                flexWrap: 'wrap',
                borderTop: '1px solid #eee'
              }}>
                <button
                  data-testid={`button-add-remove-accounts-${instId}`}
                  onClick={() => group.itemId && fetchUpdateLinkToken(group.itemId)}
                  disabled={!group.itemId || updatingItemId === group.itemId || linking}
                  title={!group.itemId ? 'Re-link this bank to manage accounts' : undefined}
                  style={{
                    fontSize: '13px',
                    color: (!group.itemId || updatingItemId === group.itemId || linking) ? '#999' : '#555',
                    background: 'none',
                    border: `1px solid ${(!group.itemId || updatingItemId === group.itemId || linking) ? '#e0e0e0' : '#ddd'}`,
                    borderRadius: '6px',
                    padding: '6px 12px',
                    cursor: (!group.itemId || updatingItemId === group.itemId || linking) ? 'not-allowed' : 'pointer'
                  }}
                  onMouseEnter={(e) => { if (group.itemId && updatingItemId !== group.itemId && !linking) e.currentTarget.style.backgroundColor = '#f5f5f5'; }}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  {updatingItemId !== null && updatingItemId === group.itemId ? 'Loading...' : 'Add/Remove Accounts'}
                </button>
                <button
                  data-testid={`button-sync-${instId}`}
                  onClick={() => group.itemId && handleSyncItem(group.itemId)}
                  disabled={!group.itemId || syncingItemId === group.itemId}
                  title={!group.itemId ? 'Re-link this bank to sync' : undefined}
                  style={{
                    fontSize: '13px',
                    color: (!group.itemId || syncingItemId === group.itemId) ? '#999' : '#555',
                    background: 'none',
                    border: `1px solid ${(!group.itemId || syncingItemId === group.itemId) ? '#e0e0e0' : '#ddd'}`,
                    borderRadius: '6px',
                    padding: '6px 12px',
                    cursor: (!group.itemId || syncingItemId === group.itemId) ? 'not-allowed' : 'pointer'
                  }}
                  onMouseEnter={(e) => { if (group.itemId && syncingItemId !== group.itemId) e.currentTarget.style.backgroundColor = '#f5f5f5'; }}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  {syncingItemId === group.itemId ? 'Syncing...' : 'Sync'}
                </button>
                {(() => {
                  const removalKey = group.itemId ?? `legacy_${group.accounts[0]?.id ?? 'unknown'}`;
                  const isRemoving = removingItemId === removalKey;
                  const isConfirming = confirmRemoveKey === removalKey;
                  if (isConfirming) {
                    return (
                      <div role="alertdialog" aria-label={`Confirm removal of ${group.name}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span
                          data-testid={`text-confirm-remove-${instId}`}
                          style={{ fontSize: '13px', color: '#b91c1c' }}
                        >
                          Remove {group.accounts.length} account{group.accounts.length === 1 ? '' : 's'} from {group.name}? Bank-managed transactions and forecasts for these accounts will also be removed.
                        </span>
                        <button
                          data-testid={`button-confirm-remove-${instId}`}
                          onClick={() => {
                            handleRemoveBank(group.itemId, group.accounts);
                          }}
                          disabled={isRemoving}
                          style={{
                            fontSize: '13px',
                            color: 'white',
                            backgroundColor: '#c44',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '6px 12px',
                            cursor: isRemoving ? 'not-allowed' : 'pointer'
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#a33'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#c44'; }}
                        >
                          Remove
                        </button>
                        <button
                          data-testid={`button-cancel-remove-${instId}`}
                          onClick={() => setConfirmRemoveKey(null)}
                          style={{
                            fontSize: '13px',
                            color: '#555',
                            background: 'none',
                            border: '1px solid #ddd',
                            borderRadius: '6px',
                            padding: '6px 12px',
                            cursor: 'pointer'
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f5f5f5'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                          Cancel
                        </button>
                      </div>
                    );
                  }
                  return (
                    <button
                      data-testid={`button-remove-bank-${instId}`}
                      onClick={() => {
                        if (!isRemoving) {
                          setConfirmRemoveKey(removalKey);
                        }
                      }}
                      disabled={isRemoving}
                      style={{
                        fontSize: '13px',
                        color: isRemoving ? '#999' : '#c44',
                        background: 'none',
                        border: `1px solid ${isRemoving ? '#ddd' : '#e0c0c0'}`,
                        borderRadius: '6px',
                        padding: '6px 12px',
                        cursor: isRemoving ? 'not-allowed' : 'pointer'
                      }}
                      onMouseEnter={(e) => { if (!isRemoving) e.currentTarget.style.backgroundColor = '#fef5f5'; }}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      {isRemoving ? 'Removing...' : 'Remove Bank'}
                    </button>
                  );
                })()}
              </div>
              {syncStatus && syncStatus.itemId === group.itemId && (
                <div
                  data-testid={`text-sync-status-${instId}`}
                  style={{
                    padding: '8px 16px',
                    fontSize: '13px',
                    color: syncStatus.ok ? '#2a7a3a' : '#b91c1c',
                    borderTop: '1px solid #eee'
                  }}
                >
                  {syncStatus.message}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
