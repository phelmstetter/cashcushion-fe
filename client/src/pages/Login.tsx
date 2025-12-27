import { useState } from "react";
import { useLocation } from "wouter";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth, saveUserToFirestore } from "@/lib/firebase";

const Login = () => {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [, setLocation] = useLocation();

  const handleGoogleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, provider);
      
      await saveUserToFirestore({
        uid: result.user.uid,
        email: result.user.email,
        photoURL: result.user.photoURL
      });
      
      setLocation("/home");
    } catch (error: any) {
      setError(error.message);
    } finally {
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
