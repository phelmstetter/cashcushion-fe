import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { usePlaidLink } from 'react-plaid-link';
import { auth, getAccounts, saveLinkedAccounts, deleteAccountsByIds, markAccountsRemoved, type Account, type PlaidAccountData } from '@/lib/firebase';
import { apiFetch } from '@/lib/queryClient';

// Many US banks require an OAuth login step in Plaid Link: the user gets
// redirected to their bank's real login page and back via a full page
// navigation, which wipes React state entirely. To resume the flow we persist
// the in-flight link token (and which item, if any, is being updated) in
// sessionStorage before handing off, and restore it on load if the URL comes
// back with Plaid's `oauth_state_id` marker.
const OAUTH_LINK_TOKEN_KEY = 'plaid_oauth_link_token';
const OAUTH_UPDATING_ITEM_KEY = 'plaid_oauth_updating_item_id';

function getRedirectUri() {
  return `${window.location.origin}/linked-accounts`;
}

function isOAuthRedirect() {
  return new URLSearchParams(window.location.search).has('oauth_state_id');
}

// Surfaces Plaid's own error taxonomy (e.g. INVALID_FIELD for an
// unregistered redirect_uri) instead of a generic message, so failures are
// diagnosable from the UI alone.
function formatPlaidError(data: any, fallback: string): string {
  if (data?.plaid_error_code) {
    return `${fallback} (${data.plaid_error_code}${data.plaid_error_message ? `: ${data.plaid_error_message}` : ''})`;
  }
  return data?.error || fallback;
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
  const [receivedRedirectUri, setReceivedRedirectUri] = useState<string | undefined>(undefined);
  const [, navigate] = useLocation();

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
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const fetchLinkToken = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) {
      setError('Not signed in. Please sign in and try again.');
      return;
    }
    setError(null);
    try {
      const res = await apiFetch('POST', '/api/plaid/create-link-token', { userId: user.uid, redirectUri: getRedirectUri() });
      const data = await res.json();
      if (data.link_token) {
        sessionStorage.setItem(OAUTH_LINK_TOKEN_KEY, data.link_token);
        sessionStorage.removeItem(OAUTH_UPDATING_ITEM_KEY);
        setLinkToken(data.link_token);
      } else {
        setError(formatPlaidError(data, 'Failed to start bank connection. Please try again.'));
      }
    } catch (err: any) {
      console.error('Failed to fetch link token:', err);
      setError(err?.message || 'Failed to start bank connection. Please try again.');
    }
  }, []);

  interface PlaidFlowResponse {
    accounts: PlaidAccountData[];
    item_id: string;
    institution_id: string | null;
    institution_name: string | null;
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
        const res = await apiFetch('POST', '/api/plaid/exchange-token', { publicToken, userId: user.uid });
        const data: PlaidFlowResponse = await res.json();
        if (data.accounts) {
          await saveLinkedAccounts(
            user.uid,
            data.accounts,
            data.item_id,
            data.institution_id,
            data.institution_name
          );
          await loadAccounts();
        }
      }
    } catch (err: any) {
      console.error('Failed to complete Plaid flow:', err);
      setError(err?.message || 'Failed to save the account changes. Please try again.');
    } finally {
      setLinking(false);
      setLinkToken(null);
      setUpdatingItemId(null);
      clearOAuthState();
    }
  }, [loadAccounts, updatingItemId]);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    receivedRedirectUri,
    onSuccess: (publicToken) => onPlaidSuccess(publicToken),
    onExit: (err) => {
      if (err) {
        console.error('Plaid Link exited with error:', err);
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
      const res = await apiFetch('POST', '/api/plaid/create-update-link-token', { itemId, userId: user.uid, redirectUri: getRedirectUri() });
      const data = await res.json();
      if (data.link_token) {
        sessionStorage.setItem(OAUTH_LINK_TOKEN_KEY, data.link_token);
        sessionStorage.setItem(OAUTH_UPDATING_ITEM_KEY, itemId);
        setLinkToken(data.link_token);
      } else {
        setError(formatPlaidError(data, 'Failed to start account update. Please try again.'));
        setUpdatingItemId(null);
      }
    } catch (err: any) {
      console.error('Failed to fetch update link token:', err);
      setError(err?.message || 'Failed to start account update. Please try again.');
      setUpdatingItemId(null);
    }
  }, []);

  const handleRemoveBank = useCallback(async (itemId: string | null, accountsToRemove: Account[]) => {
    const user = auth.currentUser;
    if (!user) return;
    const accountDocIds = accountsToRemove.map((a) => a.id);
    const plaidAccountIds = accountsToRemove.map((a) => a.account_id).filter(Boolean);
    // Use a stable key for tracking removal state: itemId if present, else a
    // sentinel derived from the first doc ID so multiple legacy groups don't collide.
    const removalKey = itemId ?? `legacy_${accountDocIds[0] ?? 'unknown'}`;
    setRemovingItemId(removalKey);
    setError(null);

    // Write tombstones BEFORE any deletion so the account_ids are protected
    // from the moment removal begins — a concurrent sync or re-link can never
    // re-create them even if a later step partially fails.
    try {
      if (plaidAccountIds.length > 0) {
        await markAccountsRemoved(user.uid, plaidAccountIds);
      }
    } catch (err: any) {
      console.error('Failed to write removal tombstones:', err);
      setError(err?.message || 'Failed to remove bank account. Please try again.');
      setRemovingItemId(null);
      return;
    }

    let serverCleanedUp = false;
    if (itemId) {
      try {
        // Server revokes Plaid access token and deletes plaid_items + accounts via firebase-admin.
        await apiFetch('POST', '/api/plaid/remove-item', { itemId, userId: user.uid });
        serverCleanedUp = true;
      } catch (err: any) {
        const is404 = err?.message?.startsWith('404');
        if (!is404) {
          // Unknown server error — don't touch local data, state may be inconsistent.
          console.error('Failed to remove bank:', err);
          setError(err?.message || 'Failed to remove bank account. Please try again.');
          setRemovingItemId(null);
          return;
        }
        // 404 means plaid_items was never written (linked before gateway was active).
        // Server skipped cleanup — fall through to client-side delete below.
        console.warn('plaid_items not found for item — proceeding with local account cleanup only.');
      }
    }
    // No itemId: legacy account with no stored Plaid item — delete locally only.

    try {
      if (!serverCleanedUp) {
        // Server didn't clean up (or there was no item to clean up) — delete account docs from the client.
        await deleteAccountsByIds(accountDocIds);
      }
      // Server already deleted everything — just refresh the UI.
      await loadAccounts();
    } catch (err: any) {
      console.error('Failed to complete local account cleanup:', err);
      setError(err?.message || 'Failed to remove bank account. Please try again.');
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
          </div>
        )}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
            Loading accounts...
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
            No linked accounts found.
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
                {(() => {
                  const removalKey = group.itemId ?? `legacy_${group.accounts[0]?.id ?? 'unknown'}`;
                  const isRemoving = removingItemId === removalKey;
                  const isConfirming = confirmRemoveKey === removalKey;
                  if (isConfirming) {
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span
                          data-testid={`text-confirm-remove-${instId}`}
                          style={{ fontSize: '13px', color: '#b91c1c' }}
                        >
                          Remove all accounts for {group.name}?
                        </span>
                        <button
                          data-testid={`button-confirm-remove-${instId}`}
                          onClick={() => {
                            setConfirmRemoveKey(null);
                            handleRemoveBank(group.itemId, group.accounts);
                          }}
                          style={{
                            fontSize: '13px',
                            color: 'white',
                            backgroundColor: '#c44',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '6px 12px',
                            cursor: 'pointer'
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
            </div>
          ))
        )}
      </div>
    </div>
  );
}
