import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { usePlaidLink } from 'react-plaid-link';
import { auth, getAccounts, saveLinkedAccounts, type Account } from '@/lib/firebase';

export default function LinkedAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
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
    if (!user) return;
    try {
      const res = await fetch('/api/plaid/create-link-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid }),
      });
      const data = await res.json();
      if (data.link_token) {
        setLinkToken(data.link_token);
      }
    } catch (err) {
      console.error('Failed to fetch link token:', err);
    }
  }, []);

  const onPlaidSuccess = useCallback(async (publicToken: string) => {
    const user = auth.currentUser;
    if (!user) return;

    setLinking(true);
    try {
      const res = await fetch('/api/plaid/exchange-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicToken }),
      });
      const data = await res.json();

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
    } catch (err) {
      console.error('Failed to exchange token:', err);
    } finally {
      setLinking(false);
      setLinkToken(null);
    }
  }, [loadAccounts]);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: (publicToken) => onPlaidSuccess(publicToken),
    onExit: () => setLinkToken(null),
  });

  useEffect(() => {
    if (linkToken && ready) {
      open();
    }
  }, [linkToken, ready, open]);

  const handleAddBank = () => {
    fetchLinkToken();
  };

  const grouped: Record<string, { name: string; accounts: Account[] }> = {};
  for (const acct of accounts) {
    const instId = acct.plaid_institution_id || 'unknown';
    if (!grouped[instId]) {
      grouped[instId] = {
        name: acct.plaid_institution_name || acct.name || 'Unknown Institution',
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
            marginBottom: '16px',
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
                  onClick={() => {}}
                  style={{
                    fontSize: '13px',
                    color: '#555',
                    background: 'none',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f5f5f5')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  Add/Remove Accounts
                </button>
                <button
                  data-testid={`button-remove-bank-${instId}`}
                  onClick={() => {}}
                  style={{
                    fontSize: '13px',
                    color: '#c44',
                    background: 'none',
                    border: '1px solid #e0c0c0',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#fef5f5')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  Remove Bank
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
