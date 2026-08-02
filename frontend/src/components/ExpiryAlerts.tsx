// components/ExpiryAlerts.tsx - NOVO componente

import { useState, useEffect } from 'react';
import { AlertTriangle, Clock, Package } from 'lucide-react';
import { getToken } from '../services/api';

interface ExpiryAlertsProps {
  onProductSelect?: (productId: string) => void;
}

export default function ExpiryAlerts({ onProductSelect }: ExpiryAlertsProps) {
  const [alerts, setAlerts] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAlerts();
  }, []);

  const fetchAlerts = async () => {
    try {
      const response = await fetch('/api/expiry-alerts/', {
        headers: {
          'Authorization': `Bearer ${getToken()}`
        }
      });
      const data = await response.json();
      setAlerts(data);
    } catch (error) {
      console.error('Erro ao carregar alertas:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Carregando alertas...</div>;
  if (!alerts) return null;

  const { summary, priority_products } = alerts;

  return (
    <div className="space-y-4">
      {/* Resumo dos alertas */}
      {(summary.total_expired > 0 || summary.total_critical > 0) && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <h3 className="font-semibold text-red-800">Atenção: Produtos Próximos ao Vencimento</h3>
          </div>
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-red-600 font-bold">{summary.total_expired}</span> vencidos
            </div>
            <div>
              <span className="text-orange-600 font-bold">{summary.total_critical}</span> críticos
            </div>
          </div>
          
          {summary.value_at_risk > 0 && (
            <p className="text-xs text-red-700 mt-2">
              Valor em risco: <strong>R$ {summary.value_at_risk.toFixed(2)}</strong>
            </p>
          )}
        </div>
      )}

      {/* Lista de produtos prioritários */}
      {priority_products.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <h4 className="font-semibold text-orange-800 mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Priorize estas vendas:
          </h4>
          
          <div className="space-y-2">
            {priority_products.slice(0, 3).map((product: any) => (
              <button
                key={product.product_id}
                onClick={() => onProductSelect?.(product.product_id)}
                className="w-full text-left p-3 bg-white rounded border hover:bg-orange-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{product.product_name}</p>
                    <p className="text-xs text-gray-600">
                      {product.quantity_at_risk} unidades • 
                      {product.days_left === 0 ? ' Vence hoje!' : ` ${product.days_left} dias`}
                    </p>
                  </div>
                  <div className={`px-2 py-1 rounded text-xs font-medium ${
                    product.urgency === 'critical' 
                      ? 'bg-red-100 text-red-800' 
                      : 'bg-orange-100 text-orange-800'
                  }`}>
                    {product.urgency === 'critical' ? 'URGENTE' : 'ATENÇÃO'}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}