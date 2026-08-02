// src/pages/ApiSandbox.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Copy, Check, Server, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function ApiSandbox() {
  const navigate = useNavigate();
  const [endpoint, setEndpoint] = useState('/api/v1/products/');
  const [method, setMethod] = useState('GET');
  const [params, setParams] = useState('');
  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [apiKey, setApiKey] = useState(localStorage.getItem('api_key_demo') || '');

  const endpoints = [
    { value: '/api/v1/products/', label: 'GET /products/', desc: 'Listar catálogo' },
    { value: '/api/v1/products/lookup/', label: 'GET /products/lookup/', desc: 'Buscar por barcode' },
    { value: '/api/v1/public/storefront/demo/', label: 'GET /public/storefront/{slug}/', desc: 'Vitrine pública' },
    { value: '/api/v1/analytics/products/', label: 'GET /analytics/products/', desc: 'Analytics (Enterprise)' },
  ];

  const handleRun = async () => {
    setLoading(true);
    setResponse(null);
    
    try {
      // Simular delay de rede
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Mock responses baseadas no endpoint
      let mockResponse: any;
      
      if (endpoint.includes('lookup')) {
        mockResponse = {
          found: true,
          source: 'local',
          product: {
            id: 1245,
            name: 'Perfume Kaiak Masculino',
            brand: 'Natura',
            category: 'Perfumaria',
            official_price: 89.90,
            bar_code: '7891234567890',
            image_url: 'https://example.com/kaiak.jpg',
          },
        };
      } else if (endpoint.includes('storefront')) {
        mockResponse = [
          {
            id: 'item_1',
            product_name: 'Perfume Kaiak',
            brand: 'Natura',
            sale_price: 89.90,
            total_quantity: 5,
            image_url: 'https://example.com/kaiak.jpg',
          },
          {
            id: 'item_2',
            product_name: 'Luna Eau de Parfum',
            brand: 'Natura',
            sale_price: 129.90,
            total_quantity: 3,
            image_url: 'https://example.com/luna.jpg',
          },
        ];
      } else if (endpoint.includes('analytics')) {
        mockResponse = {
          total_products: 8420,
          top_brands: [
            { brand: 'Natura', count: 3240, avg_price: 45.90 },
            { brand: 'Avon', count: 2180, avg_price: 32.50 },
          ],
          price_ranges: { '0-10': 120, '10-50': 680, '50-100': 380, '100+': 70 },
          lgpd_compliant: true,
        };
      } else {
        mockResponse = {
          count: 2,
          next: null,
          previous: null,
          results: [
            {
              id: 1,
              name: 'Perfume Kaiak Masculino',
              brand: 'Natura',
              category: 'Perfumaria',
              official_price: 89.90,
              bar_code: '7891234567890',
            },
            {
              id: 2,
              name: 'Luna Eau de Parfum',
              brand: 'Natura',
              category: 'Perfumaria',
              official_price: 129.90,
              bar_code: '7891234567891',
            },
          ],
        };
      }
      
      setResponse(mockResponse);
      
      // Salvar API key no localStorage se fornecida
      if (apiKey) {
        localStorage.setItem('api_key_demo', apiKey);
      }
      
    } catch (err: any) {
      setResponse({ error: err.message || 'Erro ao executar requisição' });
    } finally {
      setLoading(false);
    }
  };

  const copyResponse = () => {
    if (response) {
      navigator.clipboard.writeText(JSON.stringify(response, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const copyCurl = () => {
    const curl = `curl -X ${method} "${import.meta.env.VITE_API_COMMERCIAL_URL || 'https://api.minhaamora.com.br'}${endpoint}${params ? '?' + params : ''}" \\
  -H "Authorization: Bearer ${apiKey || 'pk_live_••••'}" \\
  -H "Content-Type: application/json"`;
    
    navigator.clipboard.writeText(curl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/95 backdrop-blur sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" className="gap-1" onClick={() => navigate('/api')}>
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
            <div className="flex items-center gap-2 font-bold text-lg">
              <Server className="h-5 w-5 text-primary" />
              Minha Amora API
            </div>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <button onClick={() => navigate('/api')} className="hover:text-primary">Início</button>
            <button onClick={() => navigate('/api/docs')} className="hover:text-primary">Documentação</button>
            <span className="text-primary font-medium">Sandbox</span>
          </nav>
        </div>
      </header>

      {/* Conteúdo */}
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Sandbox Interativo</h1>
          <p className="text-muted-foreground">
            Teste endpoints da API em um ambiente seguro. Nenhuma requisição real é feita.
          </p>
          <Badge variant="outline" className="mt-2">🧪 Ambiente de Teste</Badge>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Formulário de Request */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Configurar Request</CardTitle>
                <CardDescription>
                  Selecione o endpoint e parâmetros para testar
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* API Key */}
                <div>
                  <Label htmlFor="apiKey">API Key (opcional)</Label>
                  <Input
                    id="apiKey"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="pk_live_••••••••"
                    className="mt-1 font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Deixe em branco para testar endpoints públicos
                  </p>
                </div>

                {/* Método e Endpoint */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Método</Label>
                    <Select value={method} onValueChange={setMethod}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GET">GET</SelectItem>
                        <SelectItem value="POST">POST</SelectItem>
                        <SelectItem value="PUT">PUT</SelectItem>
                        <SelectItem value="DELETE">DELETE</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Endpoint</Label>
                    <Select value={endpoint} onValueChange={setEndpoint}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {endpoints.map((ep) => (
                          <SelectItem key={ep.value} value={ep.value}>
                            <div>
                              <div className="font-mono text-xs">{ep.label}</div>
                              <div className="text-xs text-muted-foreground">{ep.desc}</div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                {/* Parâmetros */}
                <div>
                  <Label>Parâmetros de Query (opcional)</Label>
                  <Input
                    value={params}
                    onChange={(e) => setParams(e.target.value)}
                    placeholder="brand=Natura&category=Perfumaria"
                    className="mt-1 font-mono text-sm"
                  />
                </div>
                
                {/* Body para POST/PUT */}
                {(method === 'POST' || method === 'PUT') && (
                  <div>
                    <Label>Body (JSON)</Label>
                    <textarea
                      placeholder='{"barcode": "7891234567890"}'
                      className="w-full min-h-[100px] p-3 border border-input rounded-lg font-mono text-sm mt-1"
                    />
                  </div>
                )}
                
                <Button 
                  className="w-full gap-2" 
                  onClick={handleRun}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Executando...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" /> Executar Request
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Dicas */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-blue-800 mb-1">💡 Dicas do Sandbox</p>
                    <ul className="space-y-1 text-blue-700">
                      <li>• Use <code className="bg-blue-100 px-1 rounded">barcode=7891234567890</code> para testar lookup</li>
                      <li>• Use <code className="bg-blue-100 px-1 rounded">slug=demo</code> para vitrine de exemplo</li>
                      <li>• Headers de autenticação são adicionados automaticamente</li>
                      <li>• Clique em "Copiar cURL" para usar no terminal</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Resposta */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Resposta</CardTitle>
                {response && (
                  <Button variant="ghost" size="sm" onClick={copyResponse} className="gap-1">
                    {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                    {copied ? 'Copiado!' : 'Copiar JSON'}
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {response ? (
                  <div className="relative">
                    <pre className="bg-secondary/30 rounded p-3 overflow-x-auto text-sm font-mono max-h-96">
                      {JSON.stringify(response, null, 2)}
                    </pre>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="absolute top-2 right-2 gap-1"
                      onClick={copyCurl}
                    >
                      <Copy className="h-3 w-3" /> Copiar cURL
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Server className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>Configure e execute um request para ver a resposta aqui</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Status Codes */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Códigos de Status Comuns</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center p-2 bg-green-50 rounded">
                    <span className="text-green-700 font-mono font-bold">200 OK</span>
                    <span className="text-muted-foreground">Requisição bem-sucedida</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-amber-50 rounded">
                    <span className="text-amber-700 font-mono font-bold">401 Unauthorized</span>
                    <span className="text-muted-foreground">API Key inválida ou ausente</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-red-50 rounded">
                    <span className="text-red-700 font-mono font-bold">404 Not Found</span>
                    <span className="text-muted-foreground">Recurso não encontrado</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-red-50 rounded">
                    <span className="text-red-700 font-mono font-bold">429 Too Many Requests</span>
                    <span className="text-muted-foreground">Limite de requisições excedido</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-blue-50 rounded">
                    <span className="text-blue-700 font-mono font-bold">500 Internal Error</span>
                    <span className="text-muted-foreground">Erro no servidor</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}