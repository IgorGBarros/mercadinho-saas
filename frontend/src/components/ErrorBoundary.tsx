// src/components/ErrorBoundary.tsx
import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // ✅ NÃO chamar toast aqui - pode causar loop infinito
    console.error("🚨 ErrorBoundary caught:", {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
    
    // Log para serviço de monitoramento (opcional)
    // reportErrorToService(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // ✅ Renderizar fallback seguro sem toast
      if (this.props.fallback) {
        return this.props.fallback;
      }
      
      return (
        <div className="p-6 text-center">
          <h2 className="text-lg font-semibold">⚠️ Algo deu errado</h2>
          <p className="text-sm text-muted-foreground mt-2">
            {import.meta.env.DEV 
              ? this.state.error?.message 
              : "Tente recarregar a página"}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-brand text-white rounded hover:bg-brand/90"
          >
            Recarregar
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}