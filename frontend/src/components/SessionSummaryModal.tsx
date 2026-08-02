import { useState } from 'react';
import { motion } from 'framer-motion';
import { Package, X, CreditCard } from 'lucide-react';
import { formatMoney } from '../lib/api';

interface SessionSummaryModalProps {
  summary: {
    session_id: number;
    products_count: number;
    total_estimated_cost: number;
  };
  onClose: () => void;
  onConfirmInvestment?: (data: any) => void;
}

export function SessionSummaryModal({ summary, onClose, onConfirmInvestment }: SessionSummaryModalProps) {
  const [showInvestmentForm, setShowInvestmentForm] = useState(false);

  const handleRegisterInvestment = () => {
    if (onConfirmInvestment) {
      onConfirmInvestment(summary);
    } else {
      setShowInvestmentForm(true);
    }
  };

  if (showInvestmentForm) {
    return (
      <InvestmentModal 
        estimatedCost={summary.total_estimated_cost}
        sessionId={summary.session_id}
        onClose={() => setShowInvestmentForm(false)}
        onSuccess={() => {
          setShowInvestmentForm(false);
          onClose();
        }}
      />
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-card rounded-xl p-6 max-w-md w-full shadow-2xl"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Package className="text-blue-600" size={20} />
            <h3 className="text-lg font-bold text-foreground">Resumo da Sessão</h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-secondary rounded-full"
          >
            <X size={20} className="text-muted-foreground" />
          </button>
        </div>

        <div className="space-y-3 mb-6">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-blue-700">Produtos cadastrados</span>
              <span className="font-bold text-blue-900">{summary.products_count}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-blue-700">Valor estimado</span>
              <span className="font-bold text-blue-900">{formatMoney(summary.total_estimated_cost)}</span>
            </div>
          </div>
          
          <p className="text-sm text-foreground">
            💡 Registre quanto você investiu para ter controle do seu lucro real.
          </p>
        </div>

        <div className="flex gap-3">
          <button 
            onClick={onClose}
            className="flex-1 border border-border rounded-lg py-3 text-foreground font-medium hover:bg-secondary transition-colors"
          >
            Depois
          </button>
          <button 
            onClick={handleRegisterInvestment}
            className="flex-1 bg-blue-600 text-white rounded-lg py-3 font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
          >
            <CreditCard size={16} />
            Registrar Investimento
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Componente InvestmentModal integrado
interface InvestmentModalProps {
  estimatedCost: number;
  sessionId: number;
  onClose: () => void;
  onSuccess: () => void;
}

function InvestmentModal({ estimatedCost, sessionId, onClose, onSuccess }: InvestmentModalProps) {
  const [paymentMethod, setPaymentMethod] = useState('credit_card');
  const [totalPaid, setTotalPaid] = useState(estimatedCost);
  const [installments, setInstallments] = useState(1);
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/session-summary/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          payment_method: paymentMethod,
          total_paid: totalPaid,
          installments: paymentMethod === 'credit_card' ? installments : 1
        })
      });

      if (response.ok) {
        onSuccess();
      } else {
        throw new Error('Erro ao registrar investimento');
      }
    } catch (error) {
      console.error('Erro:', error);
      alert('Erro ao registrar investimento');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-card rounded-xl p-6 max-w-md w-full shadow-2xl"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-foreground">💳 Registrar Investimento</h3>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-secondary rounded-full"
          >
            <X size={20} className="text-muted-foreground" />
          </button>
        </div>
        
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Como você pagou esses produtos?
            </label>
            <select 
              value={paymentMethod} 
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="credit_card">💳 Cartão de Crédito</option>
              <option value="pix">📱 PIX</option>
              <option value="cash">💵 Dinheiro</option>
              <option value="mixed">🔄 Misto</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Valor total pago
            </label>
            <input 
              type="number" 
              step="0.01"
              value={totalPaid} 
              onChange={(e) => setTotalPaid(parseFloat(e.target.value) || 0)}
              className="w-full border border-border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="0,00"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Sugestão baseada nos custos: {formatMoney(estimatedCost)}
            </p>
          </div>
          
          {paymentMethod === 'credit_card' && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Quantas parcelas?
              </label>
              <input 
                type="number" 
                min="1"
                max="12"
                value={installments} 
                onChange={(e) => setInstallments(parseInt(e.target.value) || 1)}
                className="w-full border border-border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          )}
        </div>
        
        <div className="flex gap-3">
          <button 
            onClick={onClose}
            disabled={loading}
            className="flex-1 border border-border rounded-lg py-3 text-foreground font-medium hover:bg-secondary transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button 
            onClick={handleConfirm}
            disabled={loading || !totalPaid}
            className="flex-1 bg-success text-white rounded-lg py-3 font-medium hover:bg-success transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>✅ Confirmar</>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}