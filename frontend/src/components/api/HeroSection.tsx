// src/components/api/HeroSection.tsx
import { ArrowRight, Code, Shield, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function HeroSection() {
  return (
    <section className="relative overflow-hidden py-20 lg:py-32 bg-gradient-to-b from-primary/5 to-background">
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Texto */}
          <div className="space-y-6">
            <Badge variant="outline" className="text-primary border-primary/50">
              <Zap className="h-3 w-3 mr-1" />
              API v1.0 Disponível
            </Badge>
            
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight">
              Acesse o maior banco de dados de{' '}
              <span className="text-primary">produtos de beleza</span> do Brasil
            </h1>
            
            <p className="text-lg text-muted-foreground max-w-xl">
              Integre catálogo de Natura, Avon, Boticário e mais. 
              Lookup por barcode, analytics agregados e webhooks em tempo real. 
              100% LGPD-compliant.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 pt-2">
              <Button size="lg" className="gap-2">
                Começar Grátis <ArrowRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="lg" asChild>
                <a href="/api/docs">Ver Documentação</a>
              </Button>
            </div>
            
            <div className="flex items-center gap-6 pt-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-green-500" />
                <span>LGPD Compliant</span>
              </div>
              <div className="flex items-center gap-2">
                <Code className="h-4 w-4 text-blue-500" />
                <span>REST + Webhooks</span>
              </div>
            </div>
          </div>
          
          {/* Código de Exemplo */}
          <div className="relative">
            <div className="absolute -inset-4 bg-gradient-to-r from-primary/20 to-purple-500/20 rounded-2xl blur-xl" />
            <div className="relative bg-card border border-border rounded-xl p-6 shadow-xl">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="ml-2 text-xs text-muted-foreground">curl</span>
              </div>
              <pre className="text-sm overflow-x-auto">
                <code className="text-foreground">
{`# Buscar produto por barcode
curl -X GET "https://api.minhaamora.com.br/api/v1/products/lookup/?barcode=7891234567890" \\
  -H "Authorization: Bearer pk_live_••••••••"

# Resposta
{
  "found": true,
  "source": "local",
  "product": {
    "id": 1245,
    "name": "Perfume Kaiak Masculino",
    "brand": "Natura",
    "official_price": 89.90,
    "bar_code": "7891234567890"
  }
}`}
                </code>
              </pre>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}