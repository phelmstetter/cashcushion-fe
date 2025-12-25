import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useLocation } from "wouter";

const Home = () => {
  const [, setLocation] = useLocation();

  const handleSignOut = async () => {
    await signOut(auth);
    setLocation("/login");
  };

  return (
    <div className="container" data-testid="page-home">
      <div className="card">
        <div className="auth-container">
          <h2>Welcome Home</h2>
          {auth.currentUser && (
            <p data-testid="text-user-email">
              You are logged in as {auth.currentUser.email}
            </p>
          )}
          <button 
            className="auth-button sign-in" 
            onClick={handleSignOut}
            data-testid="button-signout"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
};

export default Home;
