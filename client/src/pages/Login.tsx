import { useState, useEffect } from "react";
import { GoogleAuthProvider, signInWithRedirect, getRedirectResult } from "firebase/auth";
import { auth, saveUserToFirestore } from "@/lib/firebase";

const Login = () => {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    getRedirectResult(auth)
      .then(async (result) => {
        if (result?.user) {
          await saveUserToFirestore({
            uid: result.user.uid,
            email: result.user.email,
            photoURL: result.user.photoURL,
          });
        }
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handleGoogleSignIn = () => {
    const provider = new GoogleAuthProvider();
    setError("");
    signInWithRedirect(auth, provider);
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
