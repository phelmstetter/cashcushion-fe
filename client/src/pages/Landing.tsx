import { Link } from 'wouter';

const Landing = () => {
  return (
    <div className="container" data-testid="page-landing">
      <div className="card">
        <div className="auth-container">
          <h1>Welcome to Cash Cushion</h1>
          <p>Your personal finance tracker.</p>
          <Link href="/login" className="auth-button" data-testid="link-get-started">
            Get Started
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Landing;
