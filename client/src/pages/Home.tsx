import { useState, useEffect, useRef, useCallback } from "react";
import { signOut } from "firebase/auth";
import { auth, getTransactions, Transaction } from "@/lib/firebase";
import { useLocation } from "wouter";
import { QueryDocumentSnapshot, DocumentData } from "firebase/firestore";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Loader2 } from "lucide-react";

const Home = () => {
  const [, setLocation] = useLocation();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const handleSignOut = async () => {
    await signOut(auth);
    setLocation("/login");
  };

  const loadTransactions = useCallback(async (isInitial = false) => {
    if (loading || (!hasMore && !isInitial)) return;
    
    const userId = auth.currentUser?.uid;
    if (!userId) {
      setInitialLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      const result = await getTransactions(userId, isInitial ? null : lastDoc);
      
      if (isInitial) {
        setTransactions(result.transactions);
      } else {
        setTransactions(prev => [...prev, ...result.transactions]);
      }
      
      setLastDoc(result.lastDoc);
      setHasMore(result.hasMore);
    } catch (error) {
      console.error("Error loading transactions:", error);
    } finally {
      setLoading(false);
      if (isInitial) setInitialLoading(false);
    }
  }, [loading, hasMore, lastDoc]);

  useEffect(() => {
    loadTransactions(true);
  }, []);

  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          loadTransactions();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, loading, loadTransactions]);

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
    <div className="min-h-screen bg-background" data-testid="page-home">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="container flex items-center justify-between gap-2 py-3">
          <h1 className="text-xl font-semibold">CashCushion</h1>
          <div className="flex items-center gap-2">
            {auth.currentUser && (
              <span className="text-sm text-muted-foreground hidden sm:inline" data-testid="text-user-email">
                {auth.currentUser.email}
              </span>
            )}
            <Button 
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              data-testid="button-signout"
            >
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-6">
        <h2 className="text-lg font-medium mb-4">Recent Transactions</h2>
        
        {initialLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : transactions.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No transactions found
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {transactions.map((transaction) => {
              const { display: amountDisplay, isPositive } = formatAmount(transaction.amount);
              
              const displayName = transaction.merchant_name || transaction.counterparty_name;
              
              return (
                <Card key={transaction.id} className="hover-elevate" data-testid={`card-transaction-${transaction.id}`}>
                  <CardContent className="flex items-center gap-3 py-3 px-4">
                    <Avatar className="h-10 w-10 shrink-0">
                      {transaction.logo_url ? (
                        <AvatarImage src={transaction.logo_url} alt={displayName} />
                      ) : null}
                      <AvatarFallback className="text-xs">
                        {getInitials(displayName)}
                      </AvatarFallback>
                    </Avatar>
                    
                    <div className="flex-1 min-w-0">
                      <p className="font-medium line-clamp-2" data-testid={`text-counterparty-${transaction.id}`}>
                        {displayName}
                      </p>
                    </div>
                    
                    <div className="text-right shrink-0">
                      <p className={`font-semibold tabular-nums ${isPositive ? 'text-primary' : ''}`} data-testid={`text-amount-${transaction.id}`}>
                        {amountDisplay}
                      </p>
                      <p className="text-sm text-muted-foreground" data-testid={`text-date-${transaction.id}`}>
                        {formatDate(transaction.date)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            
            <div ref={loadMoreRef} className="py-4">
              {loading && (
                <div className="flex justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}
              {!hasMore && transactions.length > 0 && (
                <p className="text-center text-sm text-muted-foreground">
                  No more transactions
                </p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Home;
