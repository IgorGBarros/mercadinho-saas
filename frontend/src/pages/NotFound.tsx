// pages/NotFound.tsx — VERSÃO REFATORADA COM TEMA DINÂMICO
import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Home, ArrowLeft } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-soft px-4">
      <div className="text-center max-w-sm space-y-6">
        {/* Número 404 */}
        <h1 className="text-8xl font-bold text-brand">404</h1>

        {/* Mensagem */}
        <div className="space-y-2">
          <p className="text-xl font-semibold text-foreground">
            Página não encontrada
          </p>
          <p className="text-sm text-muted-foreground">
            A página <code className="text-brand font-mono text-xs">{location.pathname}</code> não existe ou foi movida.
          </p>
        </div>

        {/* Botões de ação */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>
          <a
            href="/"
            className="flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand/25 hover:opacity-90 transition-all"
          >
            <Home className="h-4 w-4" />
            Ir para o Início
          </a>
        </div>
      </div>
    </div>
  );
};

export default NotFound;