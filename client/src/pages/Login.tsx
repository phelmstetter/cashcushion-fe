import { useState } from "react";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "@/lib/firebase";

const Login = () => {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    setError("");
    setLoading(true);

    try {
      await signInWithPopup(auth, provider);
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      console.error("Google sign-in failed:", e.code, e.message);

      if (e.code === "auth/popup-blocked") {
        setError("Safari blocked the sign-in window. Allow pop-ups for this site and try again.");
      } else if (e.code === "auth/popup-closed-by-user") {
        setError("The sign-in window was closed before sign-in finished. Please try again.");
      } else {
        setError("We couldn’t sign you in. Please try again.");
      }
      setLoading(false);
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
          {error && <p role="alert" className="error-message" data-testid="text-error">{error}</p>}
        </div>
      </div>
    </div>
  );
};

export default Login;
