// src/pages/ApiPricing.tsx
//
// ⚠️ REESCRITO: preço vinha hardcoded ("R$ 199"), o toggle Mensal/Anual não
// tinha onChange nenhum (sempre mostrava mensal), e "Assinar" só fingia
// carregar 1s e mandava pro dashboard sem cobrar nada. Agora busca preço
// real do ApiPlanConfig e o botão chama o checkout de verdade.
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Shield, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '../components/ui/use-toast';
import { devApi, isDevLoggedIn } from '../lib/devApi';

const API_BASE_URL = ((import.meta as any).env?.VITE_API_BASE_URL || 'https://dev-brih.onrender.com').replace(/\/$/, '');

interface PlanoReal {
  plan_type: string;
  display_name: string;
  monthly_price: number;
  yearly_price: number;
  monthly_quota: number;
  rate_limit: number;
}

// Descrições/features são texto fixo por tier — o preço e os limites vêm
// do backend, o texto de marketing não precisa de campo próprio pra isso.
const DESCRICOES: Record<string, { description: string; features: string[]; popular: boolean }> = {
  starter: {
    description: 'Para testes e projetos pequenos',
    features: ['Catálogo básico de produtos', 'Lookup por código de barras', 'Suporte por e-mail', 'Dados públicos apenas'],
    popular: false,
  },
  pro: {
    description: 'Para aplicações em produção',
    features: ['✅ Tudo do Starter', 'Preços atualizados em tempo real', 'Analytics agregado', 'Suporte prioritário'],
    popular: true,
  },
  enterprise: {
    description: 'Para grandes volumes e necessidades customizadas',
    features: ['✅ Tudo do Pro', 'Analytics avançado (dados anonimizados)', 'SLA garantido', 'Suporte dedicado'],
    popular: false,
  },
};

export default function ApiPricing() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [planos, setPlanos] = useState<PlanoReal[]>([]);
  const [carregandoPlanos, setCarregandoPlanos] = useState(true);
  const [anual, setAnual] = useState(false);
  const [assinando, setAssinando] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/developers/plans/`)
      .then((r) => r.json())
      .then(setPlanos)
      .catch(() => { /* mantém a lista vazia — a tela mostra "carregando" indefinidamente é melhor que preço inventado */ })
      .finally(() => setCarregandoPlanos(false));
  }, []);

  const handleSubscribe = async (plano: PlanoReal) => {
    // Starter é grátis e já vem automático no cadastro — não precisa de
    // checkout nenhum, só leva pra criar conta (ou pro painel, se já tiver).
    if (plano.plan_type === 'starter') {
      navigate(isDevLoggedIn() ? '/api/dashboard' : '/api/login');
      return;
    }

    // Sem preço configurado = "fale com vendas", não um checkout quebrado.
    const preco = anual ? plano.yearly_price : plano.monthly_price;
    if (preco <= 0) {
      window.location.href = 'mailto:vendas@minhaamora.com.br?subject=Plano ' + plano.display_name;
      return;
    }

    if (!isDevLoggedIn()) {
      toast({ title: 'Entre ou crie sua conta primeiro', description: 'Você precisa estar logada pra assinar um plano.' });
      navigate('/api/login');
      return;
    }

    setAssinando(plano.plan_type);
    try {
      const res = await devApi.checkout({
        plan_type: plano.plan_type as any,
        billing_cycle: anual ? 'yearly' : 'monthly',
      });
      window.location.href = res.checkout_url;
    } catch (err: any) {
      toast({ title: 'Erro ao gerar checkout', description: err.message || 'Tente novamente.', variant: 'destructive' });
    } finally {
      setAssinando(null);
    }
  };

  const formatarPreco = (plano: PlanoReal) => {
    const preco = anual ? plano.yearly_price : plano.monthly_price;
    if (preco <= 0) return plano.plan_type === 'starter' ? 'Grátis' : 'Sob consulta';
    return `R$ ${preco.toFixed(2).replace('.', ',')}`;
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/95 backdrop-blur sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" className="gap-1" onClick={() => navigate('/api')}>
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <button onClick={() => navigate('/api')} className="hover:text-primary">Início</button>
            <button onClick={() => navigate('/api/docs')} className="hover:text-primary">Documentação</button>
            <span className="text-primary font-medium">Preços</span>
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <Badge variant="outline" className="mb-4">💰 Planos</Badge>
          <h1 className="text-3xl md:text-4xl font-bold mb-4">Escolha o plano ideal para seu projeto</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto mb-8">
            Todos os planos incluem conformidade LGPD e uma chave grátis já no cadastro.
          </p>

          {/* ✅ Toggle funcional agora — antes era só um checkbox sem onChange */}
          <div className="flex items-center justify-center gap-4 mb-8">
            <span className={`text-sm ${!anual ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>Mensal</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={anual}
                onChange={(e) => setAnual(e.target.checked)}
              />
              <div className="w-11 h-6 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
            </label>
            <span className={`text-sm ${anual ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
              Anual <Badge variant="secondary" className="ml-1 text-[10px]">-20%</Badge>
            </span>
          </div>
        </div>

        {carregandoPlanos ? (
          <p className="text-center text-muted-foreground">Carregando planos...</p>
        ) : (
          <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {planos.map((plano) => {
              const info = DESCRICOES[plano.plan_type] ?? { description: '', features: [], popular: false };
              return (
                <Card key={plano.plan_type} className={`relative ${info.popular ? 'border-primary shadow-lg shadow-primary/10' : ''}`}>
                  {info.popular && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground">
                      <Star className="h-3 w-3 mr-1" /> Mais Popular
                    </Badge>
                  )}
                  <CardHeader>
                    <CardTitle className="text-xl">{plano.display_name}</CardTitle>
                    <CardDescription>{info.description}</CardDescription>
                    <div className="mt-4">
                      <span className="text-4xl font-bold">{formatarPreco(plano)}</span>
                      {(anual ? plano.yearly_price : plano.monthly_price) > 0 && (
                        <span className="text-muted-foreground">{anual ? '/ano' : '/mês'}</span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-left">
                    <div className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>{plano.monthly_quota.toLocaleString('pt-BR')} requisições/mês</span>
                    </div>
                    <div className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>{plano.rate_limit} req/min</span>
                    </div>
                    {info.features.map((feature, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </CardContent>
                  <CardFooter>
                    <Button
                      className={`w-full ${info.popular ? 'bg-primary hover:bg-primary/90' : ''}`}
                      variant={info.popular ? 'default' : 'outline'}
                      onClick={() => handleSubscribe(plano)}
                      disabled={assinando === plano.plan_type}
                    >
                      {assinando === plano.plan_type ? (
                        <span className="flex items-center gap-2">
                          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          Gerando checkout...
                        </span>
                      ) : plano.plan_type === 'starter' ? (
                        'Começar Grátis'
                      ) : (anual ? plano.yearly_price : plano.monthly_price) > 0 ? (
                        `Assinar ${plano.display_name}`
                      ) : (
                        'Falar com Vendas'
                      )}
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}

        <div className="mt-12 p-6 bg-amber-50 border border-amber-200 rounded-lg max-w-3xl mx-auto">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-amber-600 mt-0.5" />
            <div className="text-left">
              <p className="font-medium text-amber-800">Conformidade LGPD em todos os planos</p>
              <p className="text-sm text-amber-700 mt-1">
                Dados comercializados são agregados e anonimizados, com consentimento registrado.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}