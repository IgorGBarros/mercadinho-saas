// src/components/api/ApiKeyModal.tsx
import { useState } from 'react';
import { X, Copy, Check, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateKey: (data: { name: string; plan: string; scopes: string[] }) => Promise<void>;
}

export default function ApiKeyModal({ isOpen, onClose, onCreateKey }: ApiKeyModalProps) {
  const [name, setName] = useState('');
  const [plan, setPlan] = useState('starter');
  const [scopes, setScopes] = useState<string[]>(['read:products']);
  const [showKey, setShowKey] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const availableScopes = [
    { value: 'read:products', label: 'Ler catálogo de produtos' },
    { value: 'read:storefront', label: 'Acessar vitrines públicas' },
    { value: 'read:analytics', label: 'Analytics agregados' },
    { value: 'write:webhooks', label: 'Gerenciar webhooks' },
  ];

  const handleCreate = async () => {
    if (!name) return;
    setLoading(true);
    try {
      const newKey = await onCreateKey({ name, plan, scopes });
      setCreatedKey(`pk_live_${Math.random().toString(36).substring(2, 18)}••••`);
    } catch (err) {
      console.error('Erro ao criar chave:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleScope = (scope: string) => {
    setScopes(prev => 
      prev.includes(scope) 
        ? prev.filter(s => s !== scope)
        : [...prev, scope]
    );
  };

  const copyToClipboard = () => {
    if (createdKey) {
      navigator.clipboard.writeText(createdKey.replace('••••', ''));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-lg">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">
            {createdKey ? 'Chave Criada' : 'Nova API Key'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-secondary rounded-lg">
            <X className="h-4 w-4" />
          </button>
        </div>

        {createdKey ? (
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              ⚠️ Copie a chave agora. Por segurança, ela não será exibida novamente.
            </div>
            <div className="flex gap-2">
              <code className="flex-1 p-2 bg-secondary rounded text-xs font-mono break-all">
                {showKey ? createdKey.replace('••••', '') : createdKey}
              </code>
              <Button variant="outline" size="icon" onClick={() => setShowKey(!showKey)}>
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button variant="outline" size="icon" onClick={copyToClipboard}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <Button className="w-full" onClick={onClose}>Concluir</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Nome da Chave</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Meu App de Vendas"
                className="mt-1"
              />
            </div>
            
            <div>
              <Label>Plano</Label>
              <Select value={plan} onValueChange={setPlan}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="starter">Starter (Grátis)</SelectItem>
                  <SelectItem value="pro">Pro (R$ 199/mês)</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Permissões (Scopes)</Label>
              <div className="space-y-2 mt-2">
                {availableScopes.map((scope) => (
                  <label key={scope.value} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={scopes.includes(scope.value)}
                      onChange={() => toggleScope(scope.value)}
                      className="rounded"
                    />
                    <span>{scope.label}</span>
                    {scope.value === 'read:analytics' && (
                      <Badge variant="outline" className="text-[10px]">Pro+</Badge>
                    )}
                  </label>
                ))}
              </div>
            </div>
            
            <div className="flex gap-3 pt-4">
              <Button 
                className="flex-1" 
                onClick={handleCreate}
                disabled={!name || loading}
              >
                {loading ? 'Criando...' : 'Gerar Chave'}
              </Button>
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}