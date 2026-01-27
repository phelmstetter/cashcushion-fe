import { useState, useEffect, useRef } from "react";
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

  return (
    <div>
      <button onClick={handleSignOut}>Sign Out</button>
      <span> Count: {transactions.length} | Has More: {hasMore ? "yes" : "no"} </span>
      {hasMore && (
        <button onClick={loadMoreTransactions} disabled={loading}>
          {loading ? "Loading..." : "Load More"}
        </button>
      )}
      {initialLoading ? (
        <p>Loading...</p>
      ) : (
        <pre>{JSON.stringify(transactions, null, 2)}</pre>
      )}
    </div>
  );
};

export default Home;
