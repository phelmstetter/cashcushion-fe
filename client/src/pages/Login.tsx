import { useState } from "react";
import { useLocation } from "wouter";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "@/lib/firebase";

const Login = () => {
  const [error, setError] = useState("");
  const [, setLocation] = useLocation();

  const handleGoogleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      setLocation("/home");
    } catch (error: any) {
      setError(error.message);
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
              data-testid="button-google-signin"
            >
              Sign in with Google
            </button>
          </div>
          {error && <p className="error-message" data-testid="text-error">{error}</p>}
        </div>
      </div>
    </div>
  );
};

export default Login;
