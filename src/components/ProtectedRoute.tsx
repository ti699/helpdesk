import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: ('solicitante' | 'agente_ti' | 'agente_manutencao' | 'admin')[];
  requireAssetAccess?: boolean;
}

export function ProtectedRoute({ children, allowedRoles, requireAssetAccess }: ProtectedRouteProps) {
  const { user, role, assetAccess, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    // Redirect based on role
    if (role === 'solicitante') {
      return <Navigate to="/" replace />;
    } else if (role === 'agente_ti' || role === 'agente_manutencao' || role === 'admin') {
      return <Navigate to="/dashboard" replace />;
    }
  }

  if (requireAssetAccess && !assetAccess) {
    return <Navigate to={role === 'solicitante' ? '/' : '/dashboard'} replace />;
  }

  return <>{children}</>;
}
