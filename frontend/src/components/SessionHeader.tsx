// src/components/SessionHeader.tsx
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Package, Clock, Check, AlertCircle } from 'lucide-react';
import { sessionApi } from '../lib/api'; // Importa do seu lib/api.ts consolidado
import { SessionSummaryModal } from './SessionSummaryModal';
import { useToast } from '../components/ui/use-toast';// ✅ Importar useToast original para evitar dependência circular

export function SessionHeader() {
  const [session, setSession] = useState<any>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Verifica sessão ao montar o componente
  useEffect(() => {
    checkSessionStatus();
    
    // Opcional: Polling a cada 30s para atualizar tempo/produtos se necessário
    const interval = setInterval(checkSessionStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const checkSessionStatus = async () => {
    try {
      const status = await sessionApi.getStatus();
      if (status.has_session) {
        setSession(status);
      } else {
        setSession(null);
      }
    } catch (error) {
      console.error('Erro ao verificar sessão:', error);
    }
  };

  const handleFinishSession = async () => {
    if (!confirm('Deseja finalizar o cadastro desta sessão?')) return;
    
    setLoading(true);
    try {
      // 1. Finaliza a sessão no backend
      const finishResult = await sessionApi.finishSession();
      
      // 2. Busca o resumo detalhado (investimento total, etc)
      // Nota: Ajuste conforme sua API retorna os dados. 
      // Se finishSession já retornar o resumo, use finishResult.summary
      let summary = finishResult.summary || {};
      
      // Fallback: Se a API não retornar resumo imediato, buscamos ou calculamos localmente
      if (!summary.products_count && session?.products_count) {
         summary = {
            products_count: session.products_count,
            total_estimated_cost: session.total_estimated_cost || 0,
            duration_minutes: Math.round(session.duration_minutes || 0),
            session_id: session.session_id
         };
      }

      setSession(null); // Limpa header
      
      // 3. Mostra modal se houver produtos cadastrados
      if (summary.products_count > 0) {
        setSummaryData(summary);
        setShowSummary(true);
      } else {
        toast({
          title: "Sessão finalizada",
          description: "Nenhum produto foi cadastrado nesta sessão.",
        });
      }
      
    } catch (error: any) {
      console.error('Erro ao finalizar sessão:', error);
      toast({
        title: "Erro",
        description: error.message || "Não foi possível finalizar a sessão.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Não renderiza nada se não houver sessão ativa
  if (!session) return null;

  return (
    <>
      <motion.div 
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        className="bg-brand text-white px-4 py-2 shadow-md flex items-center justify-between z-50 relative"
      >
        <div className="flex items-center gap-3 max-w-7xl mx-auto w-full">
          <div className="flex items-center gap-2 bg-white/10 px-3 py-1 rounded-full">
            <Package size={16} className="text-white" />
            <span className="text-sm font-semibold">
              Sessão Ativa: {session.products_count} {session.products_count === 1 ? 'produto' : 'produtos'}
            </span>
          </div>
          
          <div className="hidden sm:flex items-center gap-1 text-white/80 text-xs">
            <Clock size={12} />
            <span>{Math.floor(session.duration_minutes || 0)} min decorridos</span>
          </div>

          <div className="flex-1" />

          <button 
            onClick={handleFinishSession}
            disabled={loading}
            className="bg-white text-brand hover:bg-gray-100 px-4 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors shadow-sm disabled:opacity-70"
          >
            {loading ? (
              <span className="animate-spin h-4 w-4 border-2 border-brand border-t-transparent rounded-full" />
            ) : (
              <Check size={16} />
            )}
            Finalizar Cadastro
          </button>
        </div>
      </motion.div>

      {/* Modal de Resumo Financeiro */}
      <AnimatePresence>
        {showSummary && summaryData && (
          <SessionSummaryModal 
            summary={summaryData}
            onClose={() => {
              setShowSummary(false);
              setSummaryData(null);
              // Opcional: Recarregar página ou inventário após fechar
              window.location.reload(); 
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}