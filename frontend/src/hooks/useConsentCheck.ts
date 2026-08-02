// src/hooks/useConsentCheck.ts
// Reescrito para eliminar a condição de corrida que fazia o modal de
// consentimento reabrir a cada navegação:
//
// ANTES: a checagem rodava UMA vez, dentro de um setTimeout(100), guardada
// por `if (consentLoading) return`. Só que `loading` começa em `false`
// (a busca ainda nem tinha começado), então a checagem frequentemente rodava
// com consents=[] — concluía "não tem consentimento válido" e abria o modal,
// mesmo com 30+ registros no banco. E como era one-shot (hasCheckedRef),
// nunca se corrigia quando os dados chegavam.
//
// AGORA: a checagem é reativa — só roda depois que a primeira busca de
// consentimentos COMPLETOU (flag `initialized` do useConsent), e re-executa
// sempre que a lista muda. Se um consentimento válido aparece, o modal
// fecha sozinho. Se a pessoa fechar sem aceitar ("Agora não"), guardamos
// isso por usuário no localStorage e não incomodamos de novo — ela pode
// gerenciar depois em Configurações.
import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "./useAuth";
import { useConsent, LGPD_VERSION, type Purpose, ESSENTIAL_PURPOSES } from "./useConsent";

export interface ConsentCheckData {
  showModal: boolean;
  setShowModal: (show: boolean) => void;
  loading: boolean;
  hasChecked: boolean;
  handleConsentComplete: (purposes: Purpose[]) => Promise<boolean>;
  hasValidConsent: () => boolean;
}

const dismissKey = (userId: number | string) => `consent_modal_dismissed_${userId}`;

export function useConsentCheck(): ConsentCheckData {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const {
    consents,
    essentialPurposes: contextEssentials,
    recordConsent,
    loading: consentLoading,
    initialized,
    refresh,
  } = useConsent();

  const [showModal, setShowModalState] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);
  const consentRegisteredRef = useRef(false);

  // ✅ Normaliza purposes de um registro (array ou string JSON vinda do backend)
  const parsePurposes = (raw: unknown): string[] => {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return raw
          .replace(/[\[\]"]/g, "")
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean);
      }
    }
    return [];
  };

  const hasValidConsent = useCallback((): boolean => {
    if (!isAuthenticated || !user?.id) return false;
    const essentials =
      contextEssentials.length > 0 ? contextEssentials : [...ESSENTIAL_PURPOSES];
    return consents.some((c) => {
      const purposes = parsePurposes(c.purposes);
      return (
        c.is_active &&
        c.version === LGPD_VERSION &&
        essentials.every((p) => purposes.includes(p))
      );
    });
  }, [isAuthenticated, user?.id, consents, contextEssentials]);

  // ✅ setShowModal exposto: fechar sem aceitar registra a dispensa por
  // usuário, para não reabrir a cada navegação nesta e nas próximas sessões.
  const setShowModal = useCallback(
    (show: boolean) => {
      setShowModalState(show);
      if (!show && user?.id && !consentRegisteredRef.current) {
        try {
          localStorage.setItem(dismissKey(user.id), String(Date.now()));
        } catch {
          /* localStorage indisponível: sem persistência, mas sem quebrar */
        }
      }
    },
    [user?.id]
  );

  // ✅ Checagem reativa — roda quando os dados REAIS estão prontos e
  // re-roda quando eles mudam.
  useEffect(() => {
    if (authLoading || !isAuthenticated || !user?.id) return;
    if (!initialized || consentLoading) return; // espera a 1ª busca completar

    const valid = hasValidConsent();
    setHasChecked(true);

    if (import.meta.env.DEV) {
      console.log("🔍 LGPD Check (reactive):", {
        valid,
        consentsCount: consents.length,
      });
    }

    if (valid) {
      // Consentimento válido: garante modal fechado
      setShowModalState(false);
      return;
    }

    // Sem consentimento válido: só mostra se a pessoa nunca dispensou
    let dismissed = false;
    try {
      dismissed = Boolean(localStorage.getItem(dismissKey(user.id)));
    } catch {
      dismissed = false;
    }

    if (!dismissed && !consentRegisteredRef.current) {
      setShowModalState(true);
    }
  }, [
    authLoading,
    isAuthenticated,
    user?.id,
    initialized,
    consentLoading,
    consents,
    hasValidConsent,
  ]);

  // ✅ Limpa estado ao deslogar
  useEffect(() => {
    if (!isAuthenticated) {
      setShowModalState(false);
      setHasChecked(false);
      consentRegisteredRef.current = false;
    }
  }, [isAuthenticated]);

  const handleConsentComplete = useCallback(
    async (purposes: Purpose[]): Promise<boolean> => {
      // "Agora não" chega aqui como lista vazia: não grava nada,
      // só fecha (a dispensa é registrada pelo setShowModal(false)).
      if (!purposes || purposes.length === 0) {
        setShowModal(false);
        return true;
      }

      const purposesToRecord = [
        ...new Set<Purpose>([...purposes, ...ESSENTIAL_PURPOSES]),
      ];

      try {
        const success = await recordConsent(purposesToRecord);
        if (success) {
          consentRegisteredRef.current = true;
          try {
            if (user?.id) localStorage.removeItem(dismissKey(user.id));
          } catch {
            /* noop */
          }
          await refresh();
          setShowModalState(false);
          return true;
        }
        return false;
      } catch (error) {
        console.error("❌ handleConsentComplete error:", error);
        return false;
      }
    },
    [recordConsent, refresh, setShowModal, user?.id]
  );

  return {
    showModal,
    setShowModal,
    loading: consentLoading,
    hasChecked,
    handleConsentComplete,
    hasValidConsent,
  };
}