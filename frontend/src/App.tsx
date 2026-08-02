// src/App.tsx - VERSÃO SEM ERRORBOUNDARY (para debug)
import { Toaster } from "./components/ui/toaster";
import { TooltipProvider } from "./components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";

// ✅ Providers - ORDEM CRÍTICA:
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { PlanProvider } from "./hooks/usePlan";
import { FeatureGatesProvider } from "./hooks/useFeatureGates";
import { ConsentProvider } from "./hooks/useConsent";
import { ThemeProvider } from "./hooks/useTheme";

// Components
import ProtectedRoute from "./components/ProtectedRoute";
import ImpersonationBanner from "./components/ImpersonationBanner";
import { TrialBanner } from "./components/TrailBanner";
import { PromotionBanner } from "./components/PromotionBanner";
import { MaintenanceBanner } from "./components/MaintenanceBanner";
// ✅ ErrorBoundary REMOVIDO
import { CookieConsentBanner } from "./components/CookieConsentBanner";
import { PostAuthConsentModal } from "./components/PostAuthConsentModal";

// Pages - Public
import LandingPage from "./pages/LandingPage";
import Auth from "./pages/Auth";
import Storefront from "./pages/Storefront";
import NotFound from "./pages/NotFound";

// Pages - API / Dev
import ApiLanding from "./pages/ApiLanding";
import ApiDevAuth from "./pages/ApiDevAuth";
import ApiDocs from "./pages/ApiDocs";
import ApiPricing from "./pages/ApiPricing";
import ApiDashboard from "./pages/ApiDashboard";

// Pages - Protected (App Core)
import Index from "./pages/Index";
import ProductList from "./pages/ProductList";
import ProductForm from "./pages/ProductForm";
import AddProduct from "./pages/AddProduct";
import WithdrawProduct from "./pages/WithdrawProduct";
import StockWizard from "./pages/StockWizard";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import MovementHistory from "./pages/MovementHistory";
import CRM from "./pages/CRM";
import AdminPanel from "./pages/AdminPanel";
import Profile from "./pages/Profile";
import Plans from "./pages/Plans";
import { useEffect, useState } from "react";

import PrivacyPage from "./pages/PrivacyPage";
import TermsPage from "./pages/TermsPage";

// ✅ QueryClient FORA do componente (evita recriação a cada render)
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 1000 * 60 * 5, // 5 minutos
    },
  },
});

// ✅ Layout Wrapper para Rotas Protegidas
// Nota: o <SessionHeader /> global foi REMOVIDO daqui. A sessão de cadastro
// pertence ao fluxo do AddProduct (que já tem indicador próprio de "Sessão
// Ativa" e o resumo ao finalizar), e não ao app inteiro.
const ProtectedLayout = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-background flex flex-col">
    {/* Aviso de sessão de suporte. Some sozinho fora do modo — e é o único
        caminho de volta para a conta do administrador. */}
    <ImpersonationBanner />
    {/* Contagem regressiva do teste. Some sozinha fora do período. */}
    <TrialBanner />
    {/* Aviso de manutenção — vem antes da promoção de propósito: um alerta
        de possível instabilidade é mais importante que uma oferta. */}
    <MaintenanceBanner />
    {/* Promoção ativa pra esta loja — segmento amplo ou selecionada
        especificamente pelo admin. Sem isto, nenhuma promoção criada no
        admin-panel jamais chegava até a consultora. */}
    <PromotionBanner />
    <main className="flex-1">{children}</main>
  </div>
);

// ✅ AuthConsentWrapper com delay para não bloquear
function AuthConsentWrapper({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const location = useLocation();
  const [systemLoaded, setSystemLoaded] = useState(false);
  
  // ✅ Rotas onde modal NUNCA aparece
  const neverShowModalRoutes = ['/auth', '/lp', '/', '/admin-panel'];
  const isNeverShowRoute = neverShowModalRoutes.includes(location.pathname) || 
                          location.pathname.startsWith('/vitrine') ||
                          location.pathname.startsWith('/api');
  
  // ✅ Sistema carregou - agora pode mostrar modal se necessário
  useEffect(() => {
    if (isAuthenticated && !authLoading && !isNeverShowRoute) {
      // ✅ Delay para sistema carregar primeiro
      const timer = setTimeout(() => {
        if (import.meta.env.DEV) console.log("✅ System loaded, consent modal can appear if needed");
        setSystemLoaded(true);
      }, 500); // 500ms delay
      
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, authLoading, isNeverShowRoute]);
  
  // ✅ NÃO renderizar nada se:
  if (
    authLoading ||                    // 1. Auth carregando
    !isAuthenticated ||               // 2. Não autenticado
    isNeverShowRoute ||               // 3. Rota proibida
    !systemLoaded                     // 4. Sistema ainda não carregou
  ) {
    return <>{children}</>;
  }
  
  // ✅ Sistema carregado: renderizar modal discreto
  if (import.meta.env.DEV) console.log("✅ AuthConsentWrapper: Rendering modal (system loaded)");
  return (
    <>
      <PostAuthConsentModal />
      {children}
    </>
  );
}

const App = () => {
  return (
    // ✅ ErrorBoundary REMOVIDO - erros agora vão para o console/global handler
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          
          {/* ✅ BrowserRouter DEVE envolver AuthProvider para useNavigate funcionar */}
          <BrowserRouter>
            {/* ✅ 1. Banner de cookies básico (pré-auth, para TODOS os visitantes) */}
            <CookieConsentBanner />
            
            <AuthProvider>
             <ConsentProvider>
              {/* ✅ 2. Wrapper que só renderiza modal discreto APÓS auth em rotas protegidas */}
              <AuthConsentWrapper>
                <PlanProvider>
                  <FeatureGatesProvider>
                    <Routes>
                      {/* ==========================================
                          ROTAS PÚBLICAS (Sem autenticação)
                          ========================================== */}
                      <Route path="/lp" element={<LandingPage />} />
                      <Route path="/auth" element={<Auth />} />
                      <Route path="/privacy" element={<PrivacyPage />} />
                      <Route path="/terms" element={<TermsPage />} />
                      
                      {/* Vitrine Pública da Consultora */}
                      <Route path="/vitrine/:slug" element={<Storefront />} />
                      <Route path="/vitrine" element={<Storefront />} />

                      {/* Rotas de API / Desenvolvedores */}
                      <Route path="/api" element={<ApiLanding />} />
                      <Route path="/api/login" element={<ApiDevAuth />} />
                      <Route path="/api/docs" element={<ApiDocs />} />
                      <Route path="/api/pricing" element={<ApiPricing />} />
                      {/* ⚠️ O sandbox saiu daqui — agora é uma aba dentro do
                          painel autenticado (ApiDashboard), com chamadas
                          reais em vez do mockResponse fixo de antes. Link
                          antigo redireciona em vez de dar 404. */}
                      <Route path="/api/sandbox" element={<Navigate to="/api/dashboard" replace />} />
                      <Route path="/api/dashboard" element={<ApiDashboard />} />

                      {/* ==========================================
                          ROTAS PROTEGIDAS (Requer autenticação)
                          ========================================== */}
                      
                      {/* Home / Dashboard Principal */}
                      <Route path="/" element={
                        <ProtectedRoute>
                          <ProtectedLayout>
                            <Index />
                          </ProtectedLayout>
                        </ProtectedRoute>
                      } />

                      {/* Gestão de Produtos */}
                      <Route path="/products" element={
                        <ProtectedRoute>
                          <ProtectedLayout>
                            <ProductList />
                          </ProtectedLayout>
                        </ProtectedRoute>
                      } />
                      <Route path="/products/new" element={
                        <ProtectedRoute>
                          <ProtectedLayout>
                            <ProductForm />
                          </ProtectedLayout>
                        </ProtectedRoute>
                      } />
                      <Route path="/products/:id/edit" element={
                        <ProtectedRoute>
                          <ProtectedLayout>
                            <ProductForm />
                          </ProtectedLayout>
                        </ProtectedRoute>
                      } />

                      {/* Estoque (Entrada/Saída) */}
                      <Route path="/stock/entry" element={
                        <ProtectedRoute>
                          <ProtectedLayout>
                            <StockWizard />
                          </ProtectedLayout>
                        </ProtectedRoute>
                      } />
                      <Route path="/add" element={
                        <ProtectedRoute>
                          <ProtectedLayout>
                            <AddProduct />
                          </ProtectedLayout>
                        </ProtectedRoute>
                      } />
                      <Route path="/withdraw" element={
                        <ProtectedRoute>
                          <ProtectedLayout>
                            <WithdrawProduct />
                          </ProtectedLayout>
                        </ProtectedRoute>
                      } />

                      {/* Analytics & Histórico */}
                      <Route path="/dashboard" element={
                        <ProtectedRoute>
                          <ProtectedLayout>
                            <Dashboard />
                          </ProtectedLayout>
                        </ProtectedRoute>
                      } />
                      <Route path="/history" element={
                        <ProtectedRoute>
                          <ProtectedLayout>
                            <MovementHistory />
                          </ProtectedLayout>
                        </ProtectedRoute>
                      } />
                      {/* ⚠️ CORREÇÃO: a página CRM.tsx existia pronta mas nunca
                          tinha sido roteada — a consultora não tinha como
                          acessar a lista de clientes capturados na vitrine. */}
                      <Route path="/crm" element={
                        <ProtectedRoute>
                          <ProtectedLayout>
                            <CRM />
                          </ProtectedLayout>
                        </ProtectedRoute>
                      } />

                      {/* Configurações & Perfil */}
                      <Route path="/settings" element={
                        <ProtectedRoute>
                          <ProtectedLayout>
                            <Settings />
                          </ProtectedLayout>
                        </ProtectedRoute>
                      } />
                      <Route path="/profile" element={
                        <ProtectedRoute>
                          <ProtectedLayout>
                            <Profile />
                          </ProtectedLayout>
                        </ProtectedRoute>
                      } />
                      <Route path="/plans" element={
                        <ProtectedRoute>
                          <ProtectedLayout>
                            <Plans />
                          </ProtectedLayout>
                        </ProtectedRoute>
                      } />

                      {/* Admin Panel (requer permissão de staff) */}
                      <Route path="/admin-panel" element={
                        <ProtectedRoute requireAdmin>
                          <ProtectedLayout>
                            <AdminPanel />
                          </ProtectedLayout>
                        </ProtectedRoute>
                      } />

                      {/* Catch-all para 404 */}
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </FeatureGatesProvider>
                </PlanProvider>
              </AuthConsentWrapper>
             </ConsentProvider>
            </AuthProvider>
          </BrowserRouter>
          
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;