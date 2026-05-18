import { useState } from "react";
import { GoogleAuthProvider, signInWithRedirect } from "firebase/auth";
import { auth } from "@/lib/firebase";

const Login = () => {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    setError("");
    setLoading(true);

    try {
      await signInWithRedirect(auth, provider);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message ?? "Sign-in failed. Please try again.");
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
          {error && <p className="error-message" data-testid="text-error">{error}</p>}
        </div>
      </div>
    </div>
  );
};

export default Login;
