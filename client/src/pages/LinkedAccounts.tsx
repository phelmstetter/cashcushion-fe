import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { usePlaidLink } from 'react-plaid-link';
import { auth, getAccounts, saveLinkedAccounts, saveLinkedAccountsForItem, deleteAccountsByIds, type Account, type PlaidAccountData } from '@/lib/firebase';
import { apiFetch } from '@/lib/queryClient';

export default function LinkedAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingItemId, setRemovingItemId] = useState<string | null>(null);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [, navigate] = useLocation();

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
      const res = await apiFetch('POST', '/api/plaid/create-link-token', { userId: user.uid });
      const data = await res.json();
      if (data.link_token) {
        setLinkToken(data.link_token);
      } else {
        setError(data.error || 'Failed to start bank connection. Please try again.');
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

  const onPlaidSuccess = useCallback(async (publicToken: string) => {
    const user = auth.currentUser;
    if (!user) return;

    setLinking(true);
    try {
      if (updatingItemId) {
        const res = await apiFetch('POST', '/api/plaid/refresh-accounts', { itemId: updatingItemId });
        const data: PlaidFlowResponse = await res.json();
        if (data.accounts) {
          await saveLinkedAccountsForItem(
            user.uid,
            data.accounts,
            data.item_id,
            data.institution_id,
            data.institution_name
          );
          await loadAccounts();
        }
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
    } catch (err) {
      console.error('Failed to complete Plaid flow:', err);
    } finally {
      setLinking(false);
      setLinkToken(null);
      setUpdatingItemId(null);
    }
  }, [loadAccounts, updatingItemId]);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: (publicToken) => onPlaidSuccess(publicToken),
    onExit: () => { setLinkToken(null); setUpdatingItemId(null); },
  });

  useEffect(() => {
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
      const res = await apiFetch('POST', '/api/plaid/create-update-link-token', { itemId, userId: user.uid });
      const data = await res.json();
      if (data.link_token) {
        setLinkToken(data.link_token);
      } else {
        setError(data.error || 'Failed to start account update. Please try again.');
        setUpdatingItemId(null);
      }
    } catch (err: any) {
      console.error('Failed to fetch update link token:', err);
      setError(err?.message || 'Failed to start account update. Please try again.');
      setUpdatingItemId(null);
    }
  }, []);

  const handleRemoveBank = useCallback(async (itemId: string, accountDocIds: string[]) => {
    const user = auth.currentUser;
    if (!user || !itemId) return;
    setRemovingItemId(itemId);
    setError(null);
    let serverCleanedUp = false;
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

    try {
      if (!serverCleanedUp) {
        // Server didn't clean up — delete account docs from the client.
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
    const instId = acct.plaid_institution_id || 'unknown';
    if (!grouped[instId]) {
      grouped[instId] = {
        name: acct.plaid_institution_name || acct.name || 'Unknown Institution',
        itemId: acct.plaid_item_id || null,
        accounts: []
      };
    }
    grouped[instId].accounts.push(acct);
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
                  {updatingItemId === group.itemId ? 'Loading...' : 'Add/Remove Accounts'}
                </button>
                <button
                  data-testid={`button-remove-bank-${instId}`}
                  onClick={() => group.itemId && handleRemoveBank(group.itemId, group.accounts.map((a) => a.id))}
                  disabled={!group.itemId || (removingItemId !== null && removingItemId === group.itemId)}
                  title={!group.itemId ? 'Re-link this bank to enable removal' : undefined}
                  style={{
                    fontSize: '13px',
                    color: (!group.itemId || (removingItemId !== null && removingItemId === group.itemId)) ? '#999' : '#c44',
                    background: 'none',
                    border: `1px solid ${(!group.itemId || (removingItemId !== null && removingItemId === group.itemId)) ? '#ddd' : '#e0c0c0'}`,
                    borderRadius: '6px',
                    padding: '6px 12px',
                    cursor: (!group.itemId || (removingItemId !== null && removingItemId === group.itemId)) ? 'not-allowed' : 'pointer'
                  }}
                  onMouseEnter={(e) => { if (group.itemId && !(removingItemId !== null && removingItemId === group.itemId)) e.currentTarget.style.backgroundColor = '#fef5f5'; }}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  {(removingItemId !== null && removingItemId === group.itemId) ? 'Removing...' : 'Remove Bank'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
