// src/components/PostAuthConsentModal.tsx - VERSÃO FINAL CORRIGIDA
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useConsentCheck } from "@/hooks/useConsentCheck";
import { ConsentManager } from "./ConsentManager";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import type { Purpose } from "@/hooks/useConsent";
// src/components/PostAuthConsentModal.tsx - Modal verdadeiramente não bloqueante
export function PostAuthConsentModal() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const { showModal, setShowModal, loading, handleConsentComplete } = useConsentCheck();

  // ✅ Rotas ONDE O MODAL NUNCA APARECE
  const neverShowModalRoutes = ['/auth', '/lp', '/', '/admin-panel'];
  const isNeverShowRoute = neverShowModalRoutes.includes(location.pathname) || 
                          location.pathname.startsWith('/vitrine') ||
                          location.pathname.startsWith('/api');

  // ✅ Guards
  if (!isAuthenticated || !showModal || isNeverShowRoute) {
    return null;
  }

  console.log("🔐 PostAuthConsentModal: Rendering (non-blocking)");
  
  return (
    // ✅ modal={false} + Dialog não bloqueia interações
    <Dialog 
      open={true} 
      onOpenChange={(open) => {
        if (!open) setShowModal(false);
      }}
      modal={false} // ← CRÍTICO: Não bloqueia
    >
      <DialogContent 
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        style={{ zIndex: 1050 }}
        // ✅ Permitir TODAS as interações
        onInteractOutside={() => {}}
        onEscapeKeyDown={() => {}}
        // ✅ Permitir fechar clicando no X
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>🔒 Preferências de Privacidade (LGPD)</DialogTitle>
          <DialogDescription>
            Para usar o sistema, precisamos do seu consentimento conforme a Lei Geral de Proteção de Dados.
            <br /><br />
            <span className="text-sm text-muted-foreground">
              💡 Você pode fechar esta janela e usar o sistema. O consentimento pode ser registrado depois em Configurações.
            </span>
          </DialogDescription>
        </DialogHeader>
        
        <ConsentManager 
          onComplete={async (purposes: Purpose[]): Promise<boolean> => {
            console.log("📝 onComplete called");
            const success = await handleConsentComplete(purposes);
            console.log("✅ onComplete returned:", success);
            if (success) {
              setShowModal(false);
            }
            return success; // ← CRÍTICO: Retornar boolean
          }}
          loading={loading}
        />
      </DialogContent>
    </Dialog>
  );
}