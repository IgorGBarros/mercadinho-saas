// src/lib/toast.ts - Wrapper seguro SEM loop de importação
import type { ToastProps as ToastPropsBase } from "@/components/ui/toast";

// ✅ Tipo simplificado para evitar conflitos com Radix UI
export type ToastProps = {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  variant?: "default" | "destructive";
  duration?: number;
  [key: string]: any; // ✅ Permite props extras sem erro de tipo
};

/**
 * Hook seguro para toast - NÃO importa de use-toast para evitar loop
 * Retorna uma função que tenta chamar o toast global ou fallback
 */
export function useSafeToast() {
  // ✅ Função wrapper que NUNCA lança erro
  const safeToast = (props: ToastProps) => {
    try {
      // ✅ Tentar chamar toast global se existir (injetado pelo Toaster)
      if (typeof (window as any).toast === 'function') {
        return (window as any).toast(props);
      }
      
      // ✅ Fallback: tentar dispatch custom event para o Toaster ouvir
      const event = new CustomEvent('toast-request', { detail: props });
      window.dispatchEvent(event);
      
      // ✅ Log seguro como último fallback
      console.log("🔔 Toast:", props.title || props.description);
      
    } catch (error) {
      console.warn("⚠️ Toast error (handled):", error);
    }
  };
  
  return safeToast;
}

export type { ToastPropsBase };