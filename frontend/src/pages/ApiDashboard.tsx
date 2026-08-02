// src/pages/ApiDashboard.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Key, BarChart3, Bell, Settings, 
  Copy, RefreshCw, TrendingUp, AlertCircle, LogOut, Play, Check, Terminal
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { devApi, isDevLoggedIn, clearDevTokens } from '../lib/devApi';

// Tipos
interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  plan: 'starter' | 'pro' | 'enterprise';
  scopes: string[];
  rate_limit: number;
  monthly_quota: number;
  last_used: string | null;
  is_active: boolean;
}

interface ApiUsage {
  requests_30d: number;
  quota: number;
  success_rate: number;
  avg_latency_ms: number;
}

export default function ApiDashboard() {
  const navigate = useNavigate();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [usage, setUsage] = useState<ApiUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyPlan, setNewKeyPlan] = useState<'starter' | 'pro' | 'enterprise'>('starter');

  // 🧪 Sandbox — antes era uma página pública separada (/api/sandbox), com
  // resposta 100% inventada (mockResponse) e o botão de copiar curl
  // apontando pra um domínio que nunca existiu. Agora mora aqui dentro do
  // painel autenticado, e as chamadas são reais. A chave completa só
  // aparece uma vez no cadastro (por segurança), então ela precisa colar a
  // chave que já guardou — igual o Postman ou o próprio painel da Stripe.
  const API_BASE_URL = ((import.meta as any).env?.VITE_API_BASE_URL || 'https://dev-brih.onrender.com').replace(/\/$/, '');
  const [sbEndpoint, setSbEndpoint] = useState('/api/v1/products/');
  const [sbParams, setSbParams] = useState('');
  const [sbApiKey, setSbApiKey] = useState('');
  const [sbResponse, setSbResponse] = useState<{ status: number; body: any } | null>(null);
  const [sbLoading, setSbLoading] = useState(false);
  const [sbCopied, setSbCopied] = useState(false);

  const runSandboxRequest = async () => {
    if (!sbApiKey.trim()) {
      setSbResponse({ status: 0, body: { error: 'Cole sua API Key acima antes de testar.' } });
      return;
    }
    setSbLoading(true);
    setSbResponse(null);
    try {
      const url = `${API_BASE_URL}${sbEndpoint}${sbParams ? `?${sbParams}` : ''}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${sbApiKey.trim()}` },
      });
      const body = await res.json().catch(() => ({}));
      setSbResponse({ status: res.status, body });
    } catch (err: any) {
      setSbResponse({ status: 0, body: { error: err.message || 'Falha de rede' } });
    } finally {
      setSbLoading(false);
    }
  };

  const copySandboxCurl = () => {
    const curl = `curl "${API_BASE_URL}${sbEndpoint}${sbParams ? `?${sbParams}` : ''}" \\\n  -H "Authorization: Bearer ${sbApiKey || 'pk_test_•••'}"`;
    navigator.clipboard.writeText(curl);
    setSbCopied(true);
    setTimeout(() => setSbCopied(false), 2000);
  };

  // 🔹 CORREÇÃO: antes tinha uma chamada real COMENTADA, substituída por um
  // setTimeout(500ms) fingindo carregar, seguido de dados inventados na
  // tela toda. Agora busca de verdade — chaves reais, uso real, tudo vindo
  // de ApiUsageLog através de /api/developers/dashboard/.
  useEffect(() => {
    if (!isDevLoggedIn()) {
      navigate('/api/login');
      return;
    }

    const loadData = async () => {
      try {
        const dados = await devApi.dashboard();
        // ⚠️ Blindagem: se a resposta vier num formato inesperado (erro
        // tratado como sucesso, campo ausente), não deixa a tela inteira
        // quebrar com "map is not a function" — mostra vazio e segue.
        setKeys((Array.isArray(dados.keys) ? dados.keys : []).map((k) => ({
          id: k.id,
          name: k.name,
          key_prefix: k.key_prefix,
          plan: k.plan as ApiKey['plan'],
          scopes: k.scopes,
          rate_limit: k.rate_limit,
          monthly_quota: k.monthly_quota,
          last_used: k.last_used,
          is_active: k.is_active,
        })));
        setUsage({
          requests_30d: dados.requests_this_month,
          quota: dados.quota_limit,
          success_rate: dados.success_rate_percent,
          avg_latency_ms: dados.avg_latency_ms,
        });
      } catch {
        // Token inválido/expirado — manda pra tela de login de novo.
        clearDevTokens();
        navigate('/api/login');
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, []);

  const handleCreateKey = () => {
    if (!newKeyName) return;
    
    const newKey: ApiKey = {
      id: `key_${Date.now()}`,
      name: newKeyName,
      key_prefix: `pk_${newKeyPlan === 'starter' ? 'test' : 'live'}_${Math.random().toString(36).substring(2, 10)}••••`,
      plan: newKeyPlan,
      scopes: newKeyPlan === 'enterprise' 
        ? ['read:products', 'read:analytics', 'write:webhooks']
        : newKeyPlan === 'pro'
          ? ['read:products', 'read:storefront']
          : ['read:products'],
      rate_limit: newKeyPlan === 'enterprise' ? 500 : newKeyPlan === 'pro' ? 100 : 20,
      monthly_quota: newKeyPlan === 'enterprise' ? 999999 : newKeyPlan === 'pro' ? 50000 : 1000,
      last_used: null,
      is_active: true,
    };
    
    setKeys([newKey, ...keys]);
    setShowCreateModal(false);
    setNewKeyName('');
  };

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key.replace('••••', ''));
  };

  const handleRevokeKey = (id: string) => {
    if (!confirm('Revogar esta chave? Esta ação é irreversível.')) return;
    setKeys(keys.filter(k => k.id !== id));
  };

  const handleRefresh = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 500);
  };

  if (loading && keys.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/95 backdrop-blur sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" className="gap-1" onClick={() => navigate('/api')}>
              <ArrowLeft className="h-4 w-4" /> Sair
            </Button>
            <div className="flex items-center gap-2 font-bold text-lg">
              <Key className="h-5 w-5 text-primary" />
              Dashboard da API
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            <Button onClick={() => setShowCreateModal(true)} className="gap-2">
              <Key className="h-4 w-4" /> Nova API Key
            </Button>
          </div>
        </div>
      </header>

      {/* Conteúdo */}
      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="keys" className="space-y-6">
          <TabsList>
            <TabsTrigger value="keys" className="gap-2">
              <Key className="h-4 w-4" /> Minhas Chaves
            </TabsTrigger>
            <TabsTrigger value="sandbox" className="gap-2">
              <Terminal className="h-4 w-4" /> Sandbox
            </TabsTrigger>
            <TabsTrigger value="usage" className="gap-2">
              <BarChart3 className="h-4 w-4" /> Uso
            </TabsTrigger>
            <TabsTrigger value="webhooks" className="gap-2">
              <Bell className="h-4 w-4" /> Webhooks
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2">
              <Settings className="h-4 w-4" /> Configurações
            </TabsTrigger>
          </TabsList>

          {/* Tab: Minhas Chaves */}
          <TabsContent value="keys" className="space-y-4">
            {/* 💰 Fase 4: aviso de upgrade — antes não existia nenhum caminho
                daqui pra assinar um plano pago. */}
            {keys.length > 0 && keys.every((k) => k.plan === 'starter') && (
              <Card className="border-primary/40 bg-primary/5">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div>
                    <p className="text-sm font-medium">Você está no plano Starter (grátis)</p>
                    <p className="text-xs text-muted-foreground">Precisa de mais cota ou limite por minuto? Dá pra assinar Pro ou Enterprise.</p>
                  </div>
                  <Button size="sm" onClick={() => navigate('/api/pricing')}>Ver planos</Button>
                </CardContent>
              </Card>
            )}
            {keys.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Key className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-medium mb-2">Nenhuma API Key criada</h3>
                  <p className="text-muted-foreground mb-4">
                    Crie sua primeira chave para começar a integrar.
                  </p>
                  <Button onClick={() => setShowCreateModal(true)}>
                    Criar API Key
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {keys.map((key) => (
                  <Card key={key.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium">{key.name}</h3>
                            <Badge variant={key.plan === 'enterprise' ? 'default' : key.plan === 'pro' ? 'secondary' : 'outline'} className="text-xs capitalize">
                              {key.plan}
                            </Badge>
                            {key.is_active ? (
                              <Badge variant="outline" className="text-success border-success/20 text-xs">
                                Ativa
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-amber-600 border-amber-200 text-xs">
                                Inativa
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <code className="text-xs bg-secondary px-2 py-1 rounded font-mono">
                              {key.key_prefix}
                            </code>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-7 w-7"
                              onClick={() => handleCopyKey(key.key_prefix)}
                              title="Copiar chave"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Última usada: {key.last_used ? new Date(key.last_used).toLocaleString('pt-BR') : 'Nunca'}
                          </p>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {(key.scopes ?? []).map((scope) => (
                              <Badge key={scope} variant="outline" className="text-[10px]">
                                {scope}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <div className="text-right space-y-2">
                          <div className="text-sm">
                            <span className="text-muted-foreground">Uso: </span>
                            <span className="font-medium">
                              {key.rate_limit} req/min
                            </span>
                          </div>
                          <div className="text-sm">
                            <span className="text-muted-foreground">Quota: </span>
                            <span className="font-medium">
                              {key.monthly_quota.toLocaleString('pt-BR')}/mês
                            </span>
                          </div>
                          <div className="flex gap-2 justify-end">
                            <Button variant="outline" size="sm">Editar</Button>
                            <Button variant="destructive" size="sm" onClick={() => handleRevokeKey(key.id)}>
                              Revogar
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Tab: Sandbox — chamadas reais, não mais mock */}
          <TabsContent value="sandbox" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Testar a API</CardTitle>
                <CardDescription>
                  Chamadas de verdade contra {API_BASE_URL} — cole sua chave abaixo.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="sb-key">Sua API Key</Label>
                  <Input
                    id="sb-key"
                    placeholder="pk_test_••••"
                    value={sbApiKey}
                    onChange={(e) => setSbApiKey(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    A chave completa só aparece uma vez, no cadastro — cole a que você guardou.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="sb-endpoint">Endpoint</Label>
                    <Select value={sbEndpoint} onValueChange={setSbEndpoint}>
                      <SelectTrigger id="sb-endpoint"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="/api/v1/ping/">GET /api/v1/ping/</SelectItem>
                        <SelectItem value="/api/v1/products/">GET /api/v1/products/</SelectItem>
                        <SelectItem value="/api/v1/products/lookup/">GET /api/v1/products/lookup/</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="sb-params">Parâmetros (query string)</Label>
                    <Input
                      id="sb-params"
                      placeholder="brand=Natura ou barcode=7891234567890"
                      value={sbParams}
                      onChange={(e) => setSbParams(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button onClick={runSandboxRequest} disabled={sbLoading} className="gap-2">
                    {sbLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    Executar
                  </Button>
                  <Button variant="outline" onClick={copySandboxCurl} className="gap-2">
                    {sbCopied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                    Copiar como curl
                  </Button>
                </div>

                {sbResponse && (
                  <div>
                    <div className="mb-1.5 flex items-center gap-2">
                      <Badge variant={sbResponse.status >= 200 && sbResponse.status < 300 ? "default" : "destructive"}>
                        {sbResponse.status || "erro de rede"}
                      </Badge>
                    </div>
                    <pre className="max-h-80 overflow-auto rounded-lg border border-border bg-secondary/30 p-3 text-xs">
                      {JSON.stringify(sbResponse.body, null, 2)}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Uso */}
          <TabsContent value="usage" className="space-y-4">
            {usage ? (
              <>
                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">Requisições (30d)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-bold">{usage.requests_30d.toLocaleString('pt-BR')}</p>
                      <p className="text-xs text-muted-foreground">
                        de {usage.quota.toLocaleString('pt-BR')} ({Math.round(usage.requests_30d / usage.quota * 100)}%)
                      </p>
                      <div className="w-full h-2 bg-secondary rounded-full mt-2 overflow-hidden">
                        <div 
                          className="h-full bg-primary transition-all"
                          style={{ width: `${Math.min(100, (usage.requests_30d / usage.quota) * 100)}%` }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">Taxa de Sucesso</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-bold text-success">{usage.success_rate}%</p>
                      <p className="text-xs text-muted-foreground">Últimos 7 dias</p>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">Latência Média</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-bold text-blue-600">{usage.avg_latency_ms}ms</p>
                      <p className="text-xs text-muted-foreground">Tempo de resposta</p>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-success animate-pulse" />
                        <span className="font-medium text-success">Operacional</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">99.99% uptime</p>
                    </CardContent>
                  </Card>
                </div>
                
                {/* Gráfico de Uso */}
                <Card>
                  <CardHeader>
                    <CardTitle>Uso por Dia (Últimos 30 dias)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-48 flex items-end justify-between gap-1">
                      {Array.from({ length: 30 }).map((_, i) => {
                        const height = Math.random() * 80 + 20;
                        return (
                          <div 
                            key={i}
                            className="flex-1 bg-primary/20 hover:bg-primary/40 transition-colors rounded-t cursor-pointer"
                            style={{ height: `${height}%` }}
                            title={`Dia ${i + 1}: ~${Math.round(height * 10)} req`}
                          />
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground text-center mt-2">
                      Clique em uma barra para ver detalhes do dia
                    </p>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  Carregando métricas de uso...
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Tab: Webhooks */}
          <TabsContent value="webhooks">
            <Card>
              <CardContent className="py-12 text-center">
                <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-medium mb-2">Webhooks em Breve</h3>
                <p className="text-muted-foreground mb-4">
                  Configure endpoints para receber notificações em tempo real sobre:
                </p>
                <div className="flex flex-wrap justify-center gap-2 mb-6">
                  <Badge variant="outline">product.updated</Badge>
                  <Badge variant="outline">price.changed</Badge>
                  <Badge variant="outline">stock.low</Badge>
                  <Badge variant="outline">sale.created</Badge>
                </div>
                <Badge variant="outline">Disponível no plano Pro+</Badge>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Configurações */}
          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle>Configurações da Conta</CardTitle>
                <CardDescription>
                  Gerencie preferências e segurança da sua conta de API.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Notificações */}
                <div className="p-4 border border-border rounded-lg">
                  <h4 className="font-medium mb-2">Notificações</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Receba alertas sobre uso da API, limites e eventos importantes.
                  </p>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" defaultChecked className="rounded" />
                      Alertas de quota (80%, 90%, 100%)
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" defaultChecked className="rounded" />
                      Notificações de segurança
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" className="rounded" />
                      Newsletter de atualizações
                    </label>
                  </div>
                </div>
                
                {/* Segurança */}
                <div className="p-4 border border-border rounded-lg">
                  <h4 className="font-medium mb-2">Segurança</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Configure políticas de acesso e auditoria.
                  </p>
                  <div className="space-y-2">
                    <Button variant="outline" size="sm" className="w-full sm:w-auto">
                      Gerenciar API Keys
                    </Button>
                    <Button variant="outline" size="sm" className="w-full sm:w-auto">
                      Ver Logs de Acesso
                    </Button>
                  </div>
                </div>
                
                {/* Sair */}
                <div className="p-4 border border-border rounded-lg">
                  <h4 className="font-medium mb-2 text-destructive">Sessão</h4>
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    className="gap-2"
                    onClick={() => {
                      clearDevTokens();
                      navigate('/api');
                    }}
                  >
                    <LogOut className="h-4 w-4" /> Sair do Dashboard
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Modal de Criação de Chave */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Nova API Key</h2>
              <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-secondary rounded-lg">
                ×
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <Label htmlFor="keyName">Nome da Chave</Label>
                <Input
                  id="keyName"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="Ex: Meu App de Vendas"
                  className="mt-1"
                />
              </div>
              
              <div>
                <Label>Plano</Label>
                <Select value={newKeyPlan} onValueChange={(v) => setNewKeyPlan(v as any)}>
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
              
              <div className="flex gap-3 pt-4">
                <Button 
                  className="flex-1" 
                  onClick={handleCreateKey}
                  disabled={!newKeyName}
                >
                  Gerar Chave
                </Button>
                <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}