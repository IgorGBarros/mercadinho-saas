// src/components/api/FeaturesGrid.tsx
import { Code, Database, Shield, Zap, BarChart3, Bell } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

const features = [
  {
    icon: <Database className="h-6 w-6 text-primary" />,
    title: 'Catálogo Global',
    description: 'Acesso a milhares de produtos de Natura, Avon, Boticário, Eudora e mais, com preços oficiais atualizados e códigos de barras validados.',
  },
  {
    icon: <Zap className="h-6 w-6 text-amber-500" />,
    title: 'Lookup Inteligente',
    description: 'Busca híbrida por barcode: consulta local → scraper em tempo real → fuzzy match. Encontre produtos mesmo com dados incompletos.',
  },
  {
    icon: <Shield className="h-6 w-6 text-green-500" />,
    title: 'LGPD Compliant',
    description: 'Todos os dados comercializados são agregados e anonimizados. Consentimento registrado, direito ao esquecimento garantido.',
  },
  {
    icon: <Code className="h-6 w-6 text-blue-500" />,
    title: 'API Keys Seguras',
    description: 'Chaves com scopes granulares, rotação automática, monitoramento de uso em tempo real e rate limiting por plano.',
  },
  {
    icon: <Bell className="h-6 w-6 text-purple-500" />,
    title: 'Webhooks em Tempo Real',
    description: 'Receba notificações instantâneas sobre mudanças de preço, atualizações de estoque e lançamento de novos produtos.',
  },
  {
    icon: <BarChart3 className="h-6 w-6 text-emerald-500" />,
    title: 'Analytics Agregados',
    description: 'Insights sobre tendências de mercado, marcas mais populares e comportamento de consumo — tudo anonimizado (Enterprise).',
  },
];

export default function FeaturesGrid() {
  return (
    <section className="py-20 bg-secondary/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Tudo que você precisa para integrar dados de beleza
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            API RESTful com autenticação segura, documentação completa e suporte dedicado.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            <Card key={i} className="hover:shadow-lg transition-shadow border-border/50">
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  {feature.icon}
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm leading-relaxed">
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}