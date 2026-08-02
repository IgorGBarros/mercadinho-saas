// src/pages/ApiDocs.tsx
//
// ⚠️ CORREÇÃO: apontava pro schema em "https://api.minhaamora.com.br/...",
// um domínio que nunca existiu — não é nenhum dos dois backends reais
// (dev-brih.onrender.com / gestao-estoque-k5vy.onrender.com). O Swagger
// nunca carregava nada de verdade. Também tinha links de SDK (Python/JS/
// PHP) apontando pra href="#" — pacotes que não existem — e guias/status
// pra rotas que nunca foram registradas. Removidos até existirem de fato.
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, Server, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SwaggerEmbed from '@/components/api/SwaggerEmbed';

const API_BASE_URL = ((import.meta as any).env?.VITE_API_BASE_URL || "https://dev-brih.onrender.com")
  .replace(/\/$/, "");

export default function ApiDocs() {
  const navigate = useNavigate();

  // ✅ Schema real, do backend que de fato está no ar — o mesmo endpoint
  // testado end-to-end (retorna 200, com os 3 endpoints reais documentados
  // via @extend_schema em inventory/api_comercial_views.py).
  const API_SCHEMA_URL = `${API_BASE_URL}/api/v1/schema/`;

  return (
    <div className="min-h-screen bg-background">
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
            <span className="text-primary font-medium flex items-center gap-1">
              <BookOpen className="h-4 w-4" /> Documentação
            </span>
            <button onClick={() => navigate('/api/pricing')} className="hover:text-primary">Preços</button>
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Documentação da API</h1>
          <p className="text-muted-foreground">
            Catálogo de produtos e vitrine pública — os endpoints já em produção.
          </p>
        </div>

        <div className="border border-border rounded-xl overflow-hidden">
          <SwaggerEmbed url={API_SCHEMA_URL} />
        </div>

        <div className="mt-8 grid md:grid-cols-2 gap-4">
          <div className="p-4 border border-border rounded-lg">
            <h3 className="font-medium mb-2">🔑 Autenticação</h3>
            <p className="text-sm text-muted-foreground">
              Toda chamada (exceto a vitrine pública) precisa do cabeçalho{" "}
              <code className="text-xs bg-secondary px-1 py-0.5 rounded">Authorization: Bearer pk_test_•••</code>.
              Sua chave aparece uma única vez no cadastro — depois disso, só o prefixo fica visível no painel.
            </p>
          </div>
          <div className="p-4 border border-border rounded-lg">
            <h3 className="font-medium mb-2">❓ Suporte</h3>
            <a href="mailto:suporte@minhaamora.com.br" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary">
              <Mail className="h-3.5 w-3.5" /> suporte@minhaamora.com.br
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}