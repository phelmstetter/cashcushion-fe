import { useState, useEffect, useRef } from "react";
import { signOut } from "firebase/auth";
import { auth, getTransactions, getForecasts, saveForecast, Transaction, Forecast } from "@/lib/firebase";
import { useLocation } from "wouter";

interface DisplayItem {
  id: string;
  amount: number;
  date: string;
  counterparty_name: string;
  merchant_name?: string;
  merchant_entity_id?: string;
  logo_url?: string;
  isForecast: boolean;
}

const Home = () => {
  const [, setLocation] = useLocation();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const cursorRef = useRef<{ date: string } | null>(null);
  const loadingRef = useRef(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [forecastForm, setForecastForm] = useState({
    amount: '',
    date: '',
    counterparty_name: '',
    merchant_name: '',
    merchant_entity_id: '',
    logo_url: ''
  });
  const [saving, setSaving] = useState(false);

  const handleSignOut = async () => {
    await signOut(auth);
    setLocation("/login");
  };

  const loadInitialData = async () => {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      setInitialLoading(false);
      return;
    }
    
    try {
      const [transResult, forecastsResult] = await Promise.all([
        getTransactions(userId, null),
        getForecasts(userId)
      ]);
      
      setTransactions(transResult.transactions);
      setForecasts(forecastsResult);
      if (transResult.lastDate) {
        cursorRef.current = { date: transResult.lastDate };
      }
      setHasMore(transResult.hasMore);
    } catch (error) {
      console.error("Error loading initial data:", error);
    } finally {
      setInitialLoading(false);
    }
  };

  const loadMoreTransactions = async () => {
    if (loadingRef.current || !hasMore) return;
    
    const userId = auth.currentUser?.uid;
    if (!userId) return;
    
    loadingRef.current = true;
    setLoading(true);
    try {
      const result = await getTransactions(userId, cursorRef.current);
      
      if (result.transactions.length > 0) {
        setTransactions(prev => [...prev, ...result.transactions]);
        if (result.lastDate) {
          cursorRef.current = { date: result.lastDate };
        }
        setHasMore(result.hasMore);
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.error("Error loading more:", error);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingRef.current) {
          loadMoreTransactions();
        }
      },
      { threshold: 0.1 }
    );

    if (sentinelRef.current) {
      observerRef.current.observe(sentinelRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, transactions.length]);

  const openForecastModal = (transaction: Transaction) => {
    setForecastForm({
      amount: String(Math.abs(transaction.amount)),
      date: transaction.date,
      counterparty_name: transaction.counterparty_name,
      merchant_name: transaction.merchant_name || '',
      merchant_entity_id: transaction.merchant_entity_id || '',
      logo_url: transaction.logo_url || ''
    });
    setModalOpen(true);
  };

  const handleSaveForecast = async () => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;
    
    const parsedAmount = parseFloat(forecastForm.amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      alert('Please enter a valid positive amount');
      return;
    }
    if (!forecastForm.date) {
      alert('Please enter a date');
      return;
    }
    if (!forecastForm.counterparty_name.trim()) {
      alert('Please enter a name');
      return;
    }
    
    setSaving(true);
    try {
      const forecast: Omit<Forecast, 'id'> = {
        user_id: userId,
        amount: parsedAmount * -1,
        date: forecastForm.date,
        counterparty_name: forecastForm.counterparty_name.trim(),
        merchant_name: forecastForm.merchant_name.trim() || undefined,
        merchant_entity_id: forecastForm.merchant_entity_id || undefined,
        logo_url: forecastForm.logo_url || undefined
      };
      
      await saveForecast(forecast);
      const updatedForecasts = await getForecasts(userId);
      setForecasts(updatedForecasts);
      setModalOpen(false);
    } catch (error) {
      console.error("Error saving forecast:", error);
    } finally {
      setSaving(false);
    }
  };

  const formatAmount = (amount: number) => {
    const flippedAmount = -amount;
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(Math.abs(flippedAmount));
    
    return {
      display: flippedAmount >= 0 ? `+${formatted}` : formatted,
      isPositive: flippedAmount >= 0
    };
  };

  const formatDate = (dateString: string, isForecast: boolean) => {
    const date = new Date(dateString);
    const formatted = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    return isForecast ? `${formatted} E` : formatted;
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const allItems: DisplayItem[] = [
    ...transactions.map(t => ({ ...t, isForecast: false })),
    ...forecasts.map(f => ({ ...f, id: f.id!, isForecast: true }))
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ margin: 0 }}>CashCushion ({allItems.length})</h1>
        <button onClick={handleSignOut}>Sign Out</button>
      </div>

      {initialLoading ? (
        <p>Loading...</p>
      ) : allItems.length === 0 ? (
        <p>No transactions found</p>
      ) : (
        <>
          {allItems.map((item) => {
            const { display: amountDisplay, isPositive } = formatAmount(item.amount);
            const displayName = item.merchant_name || item.counterparty_name;
            
            return (
              <div key={`${item.isForecast ? 'f' : 't'}-${item.id}`} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px',
                marginBottom: '8px',
                backgroundColor: item.isForecast ? '#e8f4e8' : '#fff',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}>
                {item.logo_url ? (
                  <img 
                    src={item.logo_url} 
                    alt={displayName}
                    style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    backgroundColor: '#e0e0e0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                    fontWeight: 'bold'
                  }}>
                    {getInitials(displayName)}
                  </div>
                )}
                
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ 
                    fontWeight: 500,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                  }}>{displayName}</div>
                </div>
                
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 600, color: isPositive ? 'green' : 'inherit' }}>
                    {amountDisplay}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    {formatDate(item.date, item.isForecast)}
                  </div>
                </div>

                {!item.isForecast && (
                  <button 
                    onClick={() => openForecastModal(item as Transaction)}
                    style={{ padding: '4px 8px', fontSize: '12px' }}
                  >
                    +F
                  </button>
                )}
              </div>
            );
          })}
          
          <div ref={sentinelRef} style={{ textAlign: 'center', padding: '20px' }}>
            {loading && <p>Loading...</p>}
            {!hasMore && <p style={{ color: '#666' }}>No more transactions</p>}
          </div>
        </>
      )}

      {modalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: '#fff',
            padding: '20px',
            borderRadius: '8px',
            width: '90%',
            maxWidth: '400px'
          }}>
            <h2 style={{ marginTop: 0 }}>Create Forecast</h2>
            
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '4px' }}>Amount</label>
              <input
                type="number"
                value={forecastForm.amount}
                onChange={(e) => setForecastForm(f => ({ ...f, amount: e.target.value }))}
                style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
              />
            </div>
            
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '4px' }}>Date</label>
              <input
                type="date"
                value={forecastForm.date}
                onChange={(e) => setForecastForm(f => ({ ...f, date: e.target.value }))}
                style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
              />
            </div>
            
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '4px' }}>Name</label>
              <input
                type="text"
                value={forecastForm.merchant_name || forecastForm.counterparty_name}
                onChange={(e) => setForecastForm(f => ({ 
                  ...f, 
                  merchant_name: e.target.value,
                  counterparty_name: e.target.value 
                }))}
                style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
              />
            </div>
            
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setModalOpen(false)}>Cancel</button>
              <button onClick={handleSaveForecast} disabled={saving}>
                {saving ? 'Saving...' : 'Save Forecast'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;
