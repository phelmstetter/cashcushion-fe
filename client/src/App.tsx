import { useState, useEffect, lazy, Suspense } from 'react';
import { Switch, Route, Redirect } from "wouter";
import { type User, onAuthStateChanged } from 'firebase/auth';
import { auth, saveUserToFirestore } from '@/lib/firebase';
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import ProtectedRoute from "@/components/ProtectedRoute";

const Home = lazy(() => import("@/pages/Home"));
const Login = lazy(() => import("@/pages/Login"));
const Landing = lazy(() => import("@/pages/Landing"));
const LinkedAccounts = lazy(() => import("@/pages/LinkedAccounts"));
const Build = lazy(() => import("@/pages/Build"));
const NotFound = lazy(() => import("@/pages/not-found"));

function PageLoading() {
  return (
    <div className="container">
      <div className="card">
        <p>Loading…</p>
      </div>
    </div>
  );
}

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
    <Suspense fallback={<PageLoading />}>
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
    </Suspense>
  );
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      // Settle the UI immediately — never block on the profile write.
      setUser(currentUser);
      setLoading(false);

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
