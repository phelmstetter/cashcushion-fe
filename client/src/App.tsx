import { useState, useEffect } from 'react';
import { Switch, Route, Redirect } from "wouter";
import { type User, onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import Landing from "@/pages/Landing";
import ProtectedRoute from "@/components/ProtectedRoute";
import NotFound from "@/pages/not-found";

function Router({ user, loading }: { user: User | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="container">
        <div className="card">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login">
        {!user ? <Login /> : <Redirect to="/home" />}
      </Route>
      <Route path="/home">
        <ProtectedRoute user={user}>
          <Home />
        </ProtectedRoute>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router user={user} loading={loading} />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
