// src/components/ConsentBlockingOverlay.tsx
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useConsentCheck } from "@/hooks/useConsentCheck";
import { useEffect } from "react";

export function ConsentBlockingOverlay() {
  const { isAuthenticated } = useAuth();
  const location = useLocation(); // ✅ Para verificar rota
  const {  hasChecked } = useConsentCheck();
  
  useEffect(() => {
    // ✅ Só bloquear se: auth + deve bloquear + já verificou + NÃO está em /auth
    if (isAuthenticated  && hasChecked && location.pathname !== '/auth') {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      
      const handleKey = (e: KeyboardEvent) => {
        if (!["Tab", "Shift", "Control", "Alt", "Meta"].includes(e.key)) {
          e.preventDefault();
          e.stopPropagation();
        }
      };
      
      document.addEventListener("keydown", handleKey, { capture: true });
      
      return () => {
        document.body.style.overflow = originalOverflow;
        document.removeEventListener("keydown", handleKey, { capture: true });
      };
    }
  }, [isAuthenticated, hasChecked, location.pathname]);
  
  // ✅ Só renderizar overlay se todas as condições forem verdadeiras
  if (!isAuthenticated  || !hasChecked || location.pathname === '/auth') {
    return null;
  }
  
  // ✅ Overlay com z-index MENOR que o modal (9999 < 10000)
  return (
    <div 
      className="fixed inset-0 bg-black/20 backdrop-blur-[1px] pointer-events-auto"
      style={{ zIndex: 9999 }}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
      aria-hidden="true"
    />
  );
}