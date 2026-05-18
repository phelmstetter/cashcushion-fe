import { useState, useEffect } from "react";
import { type User, GoogleAuthProvider, signInWithRedirect, getRedirectResult } from "firebase/auth";
import { auth, saveUserToFirestore } from "@/lib/firebase";

const Login = () => {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Helper to handle the user data saving logic to keep code DRY
  const processUser = async (user: User) => {
    if (user) {
      await saveUserToFirestore({
        uid: user.uid,
        email: user.email,
        photoURL: user.photoURL,
      });
    }
  };

  // Listens for the callback after the user finishes signing in via the redirect page
  useEffect(() => {
    setLoading(true);
    getRedirectResult(auth)
      .then(async (result) => {
        if (result?.user) {
          await processUser(result.user);
        }
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // Universal sign-in handler that Safari never blocks
  const handleGoogleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    setError("");
    setLoading(true);

    try {
      // Swapped out signInWithPopup for signInWithRedirect to ensure strict Safari/iOS compatibility
      await signInWithRedirect(auth, provider);
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      setError(e.message ?? "Sign-in failed. Please try again.");
      setLoading(false); // Only stop loading if the initial redirect trigger fails
    }
  };

  return (
    <div className="container" data-testid="page-login">
      <div className="card">
        <div className="auth-container">
          <h2>Welcome</h2>
          <p>Sign in to continue</p>
          <div className="button-group">
            <button
              className="auth-button google"
              onClick={handleGoogleSignIn}
              disabled={loading}
              data-testid="button-google-signin"
            >
              {loading ? "Signing in..." : "Sign in with Google"}
            </button>
          </div>
          {error && <p className="error-message" data-testid="text-error">{error}</p>}
        </div>
      </div>
    </div>
  );
};

export default Login;