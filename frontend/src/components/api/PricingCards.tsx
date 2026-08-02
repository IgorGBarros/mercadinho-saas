// src/components/api/PricingCards.tsx
import { Check, Star, Shield } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const plans = [
  {
    name: 'Starter',
    price: 'Grátis',
    period: '',
    description: 'Para testes e projetos pequenos',
    features: [
      '1.000 requisições/mês',
      '20 req/min rate limit',
      'Catálogo básico de produtos',
      'Lookup por barcode',
      'Suporte por e-mail',
      'Dados públicos apenas',
    ],
    cta: 'Começar Grátis',
    popular: false,
    highlight: false,
  },
  {
    name: 'Pro',
    price: 'R$ 199',
    period: '/mês',
    description: 'Para aplicações em produção',
    features: [
      '50.000 requisições/mês',
      '100 req/min rate limit',
      '✅ Tudo do Starter',
      'Preços atualizados em tempo real',
      'Webhooks para notificações',
      'Analytics básico',
      'Suporte prioritário',
    ],
    cta: 'Assinar Pro',
    popular: true,
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: 'Sob consulta',
    period: '',
    description: 'Para grandes volumes e necessidades customizadas',
    features: [
      'Requisições ilimitadas',
      '500+ req/min (configurável)',
      '✅ Tudo do Pro',
      'Analytics avançado (dados anonimizados)',
      'Webhooks com retry e DLQ',
      'SLA 99.99% garantido',
      'Suporte dedicado 24/7',
      'Endpoints customizados',
      'Conformidade LGPD avançada',
    ],
    cta: 'Falar com Vendas',
    popular: false,
    highlight: false,
  },
];

export default function PricingCards() {
  return (
    <div className="text-center">
      <Badge variant="outline" className="mb-4">💰 Planos</Badge>
      <h2 className="text-3xl md:text-4xl font-bold mb-4">
        Escolha o plano ideal para seu projeto
      </h2>
      <p className="text-muted-foreground max-w-2xl mx-auto mb-12">
        Todos os planos incluem criptografia ponta-a-ponta, conformidade LGPD e monitoramento 24/7.
      </p>

      <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
        {plans.map((plan) => (
          <Card 
            key={plan.name} 
            className={`relative ${plan.highlight ? 'border-primary shadow-lg shadow-primary/10' : ''}`}
          >
            {plan.popular && (
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground">
                <Star className="h-3 w-3 mr-1" /> Mais Popular
              </Badge>
            )}
            
            <CardHeader>
              <CardTitle className="text-xl">{plan.name}</CardTitle>
              <CardDescription>{plan.description}</CardDescription>
              <div className="mt-4">
                <span className="text-4xl font-bold">{plan.price}</span>
                <span className="text-muted-foreground">{plan.period}</span>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-3 text-left">
              {plan.features.map((feature, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>{feature}</span>
                </div>
              ))}
            </CardContent>
            
            <CardFooter>
              <Button 
                className={`w-full ${plan.highlight ? 'bg-primary hover:bg-primary/90' : ''}`}
                variant={plan.highlight ? 'default' : 'outline'}
              >
                {plan.cta}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      <div className="mt-12 p-6 bg-amber-50 border border-amber-200 rounded-lg max-w-3xl mx-auto">
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-amber-600 mt-0.5" />
          <div className="text-left">
            <p className="font-medium text-amber-800">Conformidade LGPD em todos os planos</p>
            <p className="text-sm text-amber-700 mt-1">
              Todos os dados comercializados são agregados e anonimizados. 
              Consentimento registrado, direito ao esquecimento garantido, 
              e relatórios de auditoria disponíveis para planos Pro+.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}