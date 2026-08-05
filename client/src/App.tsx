import { useState, useEffect } from 'react';
import { Switch, Route, Redirect } from "wouter";
import { type User, onAuthStateChanged, getRedirectResult } from 'firebase/auth';
import { auth, saveUserToFirestore } from '@/lib/firebase';
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import Landing from "@/pages/Landing";
import ProtectedRoute from "@/components/ProtectedRoute";
import LinkedAccounts from "@/pages/LinkedAccounts";
import Build from "@/pages/Build";
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
      <Route path="/linked-accounts">
        <ProtectedRoute user={user}>
          <LinkedAccounts />
        </ProtectedRoute>
      </Route>
      <Route path="/build" component={Build} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let settled = false;

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      // Settle the UI immediately — never block on the profile write.
      setUser(currentUser);
      setLoading(false);
      settled = true;

      // Kick off the best-effort profile save in the background.
      // A Firestore failure (permissions hiccup, network blip, stalled retry)
      // is logged for diagnosis but cannot affect the loading gate.
      if (currentUser) {
        saveUserToFirestore({
          uid: currentUser.uid,
          email: currentUser.email,
          photoURL: currentUser.photoURL,
        }).catch((err) => {
          console.error('Failed to save user profile to Firestore:', err);
        });
      }
    });

    // Process any pending signInWithRedirect result. If onAuthStateChanged
    // already settled (cached session), this is a no-op. If it hasn't settled
    // yet (fresh session after redirect), the result resolves the pending auth
    // and triggers onAuthStateChanged with the authenticated user.
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user && !settled) {
          // Settle the UI immediately, then write the profile in the background.
          setUser(result.user);
          setLoading(false);

          saveUserToFirestore({
            uid: result.user.uid,
            email: result.user.email,
            photoURL: result.user.photoURL,
          }).catch((err) => {
            console.error('Failed to save user profile to Firestore:', err);
          });
        }
      })
      .catch((err) => {
        console.error('Redirect result error:', err);
        if (!settled) setLoading(false);
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
