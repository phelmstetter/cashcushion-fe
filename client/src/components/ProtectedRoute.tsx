import { Redirect } from 'wouter';
import { type User } from 'firebase/auth';
import type { ReactNode } from 'react';

interface ProtectedRouteProps {
  user: User | null;
  children: ReactNode;
}

const ProtectedRoute = ({ user, children }: ProtectedRouteProps) => {
  if (!user) {
    return <Redirect to="/login" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
