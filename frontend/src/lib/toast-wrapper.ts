// src/lib/toast-wrapper.ts - Wrapper simples e seguro
import type { ToastProps as ShadcnToastProps } from "@/components/ui/toast";

export type ToastProps = {
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: "default" | "destructive";
  duration?: number;
  action?: React.ReactNode;
  [key: string]: any;
};

// ✅ Função que dispara evento para o Toaster ouvir
export const toast = (props: ToastProps) => {
  if (typeof window === "undefined") return;
  
  const event = new CustomEvent("app-toast", {
    detail: {
      id: Math.random().toString(36).substring(2),
      title: props.title,
      description: props.description,
      variant: props.variant,
      action: props.action,
      duration: props.duration || 5000,
    },
  });
  
  window.dispatchEvent(event);
  
  // Log em dev para debug
  if (import.meta.env.DEV) {
    console.log("🔔", props.title || props.description);
  }
};

// ✅ Hook que retorna a função toast (API consistente)
export const useToast = () => toast;

// ✅ Exportar tipos para compatibilidade
export type { ShadcnToastProps };