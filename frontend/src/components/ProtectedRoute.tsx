// src/components/ProtectedRoute.tsx - Atualizar guards
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export default function ProtectedRoute({ 
  children, 
  requireAdmin = false 
}: ProtectedRouteProps) {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  
  // ✅ Rotas que NÃO requerem autenticação
  // ⚠️ CORREÇÃO: '/admin-panel' estava aqui por engano (parece ter vindo de
  // uma cópia da lista neverShowModalRoutes, que é sobre outra coisa — não
  // mostrar o modal de consentimento). Com '/admin-panel' como rota pública,
  // o early-return abaixo disparava ANTES da checagem de requireAdmin, então
  // qualquer pessoa — logada ou não, admin ou não — conseguia acessar o
  // painel admin e disparar as chamadas de API dele.
  const publicRoutes = ['/auth', '/lp', '/'];
  const isPublicRoute = publicRoutes.includes(location.pathname);
  
  // ✅ Permitir rotas públicas SEMPRE
  if (isPublicRoute) {
    return <>{children}</>;
  }
  
  // ✅ Loading de autenticação
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }
  
  // ✅ Não autenticado → redirect para login
  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }
  
  // ✅ Requer admin mas usuário não é staff
  if (requireAdmin && !user.is_staff) {
    return <Navigate to="/" replace />;
  }
  
  // ✅ LGPD: NÃO bloquear - modal é discreto
  return <>{children}</>;
}