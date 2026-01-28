import { useState, useEffect, useRef, useCallback } from "react";
import { signOut } from "firebase/auth";
import { auth, getTransactions, Transaction } from "@/lib/firebase";
import { useLocation } from "wouter";

const Home = () => {
  const [, setLocation] = useLocation();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const cursorRef = useRef<{ date: string; id: string } | null>(null);
  const loadingRef = useRef(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const handleSignOut = async () => {
    await signOut(auth);
    setLocation("/login");
  };

  const loadInitialTransactions = async () => {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      setInitialLoading(false);
      return;
    }
    
    try {
      const result = await getTransactions(userId, null);
      setTransactions(result.transactions);
      if (result.lastDate && result.lastId) {
        cursorRef.current = { date: result.lastDate, id: result.lastId };
      }
      setHasMore(result.hasMore);
    } catch (error) {
      console.error("Error loading initial transactions:", error);
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
        if (result.lastDate && result.lastId) {
          cursorRef.current = { date: result.lastDate, id: result.lastId };
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
    loadInitialTransactions();
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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ margin: 0 }}>CashCushion ({transactions.length})</h1>
        <button onClick={handleSignOut}>Sign Out</button>
      </div>

      {initialLoading ? (
        <p>Loading...</p>
      ) : transactions.length === 0 ? (
        <p>No transactions found</p>
      ) : (
        <>
          {transactions.map((transaction) => {
            const { display: amountDisplay, isPositive } = formatAmount(transaction.amount);
            const displayName = transaction.merchant_name || transaction.counterparty_name;
            
            return (
              <div key={transaction.id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px',
                marginBottom: '8px',
                backgroundColor: '#fff',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}>
                {transaction.logo_url ? (
                  <img 
                    src={transaction.logo_url} 
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
                    {formatDate(transaction.date)}
                  </div>
                </div>
              </div>
            );
          })}
          
          <div ref={sentinelRef} style={{ textAlign: 'center', padding: '20px' }}>
            {loading && <p>Loading...</p>}
            {!hasMore && <p style={{ color: '#666' }}>No more transactions</p>}
          </div>
        </>
      )}
    </div>
  );
};

export default Home;
