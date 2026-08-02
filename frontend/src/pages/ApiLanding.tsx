// src/pages/ApiLanding.tsx (Vite + React Router)
import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  ArrowRight, BookOpen, Server, Code, Shield, Zap 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import HeroSection from '@/components/api/HeroSection';
import FeaturesGrid from '@/components/api/FeaturesGrid';
import PricingCards from '@/components/api/PricingCards';
import CodeExample from '@/components/api/CodeExample';

export default function ApiLanding() {
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => setMounted(true), []);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/95 backdrop-blur sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <button 
            onClick={() => navigate('/')} 
            className="flex items-center gap-2 font-bold text-lg"
          >
            <Server className="h-5 w-5 text-primary" />
            Minha Amora API
          </button>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <a href="#features" className="hover:text-primary transition-colors">Recursos</a>
            <button 
              onClick={() => navigate('/api/docs')}
              className="hover:text-primary transition-colors flex items-center gap-1"
            >
              <BookOpen className="h-4 w-4" /> Docs
            </button>
            <button 
              onClick={() => navigate('/api/pricing')}
              className="hover:text-primary transition-colors"
            >
              Preços
            </button>
            <button 
              onClick={() => navigate('/api/sandbox')}
              className="hover:text-primary transition-colors"
            >
              Sandbox
            </button>
          </nav>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/api/docs')}>
              Documentação
            </Button>
            <Button size="sm" onClick={() => navigate('/api/dashboard')}>
              Dashboard <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <HeroSection />

      {/* Features */}
      <FeaturesGrid />

      {/* Code Examples */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Integre em minutos
            </h2>
            <p className="text-muted-foreground">
              Exemplos prontos para copiar e colar em sua aplicação.
            </p>
          </div>

          <div className="max-w-4xl mx-auto space-y-4">
            <CodeExample 
              language="curl" 
              code={`# Buscar produto por barcode
curl -X GET "https://dev-brih.onrender.com/api/v1/products/lookup/?barcode=7891234567890" \\
  -H "Authorization: Bearer pk_test_••••••••" \\
  -H "Content-Type: application/json"`} 
            />
            <CodeExample 
              language="python" 
              code={`import requests

API_KEY = "pk_test_••••••••"
BASE_URL = "https://dev-brih.onrender.com/api/v1"

headers = {"Authorization": f"Bearer {API_KEY}"}

response = requests.get(
    f"{BASE_URL}/products/lookup/",
    params={"barcode": "7891234567890"},
    headers=headers
)
product = response.json()
print(f"Encontrado: {product['product']['name']}")`} 
            />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 bg-secondary/30">
        <div className="container mx-auto px-4">
          <PricingCards />
        </div>
      </section>

      {/* CTA Final */}
      <section className="py-20 text-center">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold mb-4">Pronto para começar?</h2>
          <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
            Crie sua conta gratuita e receba uma API Key de teste em segundos.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="gap-2" onClick={() => navigate('/api/signup')}>
              Criar Conta Grátis <ArrowRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="lg" onClick={() => navigate('/api/docs')}>
              Ver Documentação
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        <div className="container mx-auto px-4">
          <p>© {new Date().getFullYear()} Minha Amora API. Todos os direitos reservados.</p>
          <div className="flex justify-center gap-4 mt-2">
            <button onClick={() => navigate('/api/terms')} className="hover:text-foreground">Termos</button>
            <button onClick={() => navigate('/api/privacy')} className="hover:text-foreground">Privacidade (LGPD)</button>
            <button onClick={() => navigate('/api/status')} className="hover:text-foreground">Status</button>
            <a href="mailto:suporte@minhaamora.com.br" className="hover:text-foreground">Suporte</a>
          </div>
        </div>
      </footer>
    </div>
  );
}