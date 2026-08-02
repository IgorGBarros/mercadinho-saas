// src/components/api/SwaggerEmbed.tsx
import { useEffect, useRef } from 'react';

interface SwaggerEmbedProps {
  url: string; // URL do schema OpenAPI, ex: "https://api.minhaamora.com.br/api/v1/schema/"
}

export default function SwaggerEmbed({ url }: SwaggerEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Carregar CSS do Swagger UI
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/swagger-ui-dist@5/swagger-ui.css';
    document.head.appendChild(link);

    // Carregar JS do Swagger UI
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js';
    script.onload = () => {
      if (window.SwaggerUIBundle && containerRef.current) {
        window.SwaggerUIBundle({
          url,
          dom_id: `#${containerRef.current.id}`,
          deepLinking: true,
          presets: [window.SwaggerUIBundle.presets.apis],
          layout: 'BaseLayout',
          requestInterceptor: (req: any) => {
            // Adicionar API Key do localStorage se existir
            const apiKey = localStorage.getItem('api_key_demo');
            if (apiKey) {
              req.headers['Authorization'] = `Bearer ${apiKey}`;
            }
            return req;
          },
        });
      }
    };
    document.body.appendChild(script);

    return () => {
      document.head.removeChild(link);
      if (script.parentNode) document.body.removeChild(script);
    };
  }, [url]);

  return (
    <div 
      ref={containerRef} 
      id="swagger-ui" 
      className="swagger-container min-h-[600px]"
    />
  );
}

// Tipagem global para Swagger UI
declare global {
  interface Window {
    SwaggerUIBundle: any;
  }
}