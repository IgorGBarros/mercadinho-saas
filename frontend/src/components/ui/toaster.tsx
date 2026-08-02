// src/components/ui/toaster.tsx
import { useToast as useShadcnToast } from "./use-toast"; // ← Hook original do shadcn (interno)
import { Toast, ToastProvider, ToastViewport } from "./toast";
import { useEffect } from "react";

export function Toaster() {
  // Hook interno do shadcn para gerenciar fila
  const { toast: internalToast, toasts } = useShadcnToast();
  
  // ✅ Ouvir evento global do wrapper simples
  useEffect(() => {
    const handleGlobalToast = (event: Event) => {
      const custom = event as CustomEvent;
      const detail = custom.detail;
      
      // Adicionar à fila do shadcn
      internalToast({
        
        title: detail?.title,
        description: detail?.description,
        variant: detail?.variant,
        action: detail?.action,
        duration: detail?.duration,
      });
    };
    
    window.addEventListener("app-toast", handleGlobalToast);
    return () => window.removeEventListener("app-toast", handleGlobalToast);
  }, [internalToast]);
  
  return (
    <ToastProvider>
      {toasts.map(({ id, title, description, action, ...props }) => (
        <Toast key={id} {...props}>
          <div className="grid gap-1">
            {title && <div className="font-semibold">{title}</div>}
            {description && <div className="text-sm opacity-90">{description}</div>}
          </div>
          {action}
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}