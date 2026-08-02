// hooks/useSystemConfig.tsx
// Feature flags globais + status de manutenção, num hook reutilizável —
// mesma ideia do useTrial. Antes, "ai_enabled"/"storefront_enabled"/
// "ocr_enabled" eram só um localStorage que nada consumia; isto é o que
// dá "função" de verdade pra essas flags: qualquer tela pode perguntar
// "essa funcionalidade está ligada globalmente?" e receber uma resposta
// real, vinda do banco.
import { useState, useEffect } from "react";
import { systemConfigApi, SystemConfigStatus } from "../lib/api";

export function useSystemConfig() {
  const [config, setConfig] = useState<SystemConfigStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    systemConfigApi
      .get()
      .then(setConfig)
      .catch(() => { /* falha ao buscar não deve travar a tela — os consumidores tratam null como "liberado" */ })
      .finally(() => setLoading(false));
  }, []);

  return {
    config,
    loading,
    // Enquanto carrega (ou se a chamada falhar), assume liberado — uma
    // flag global não deve travar a funcionalidade por causa de uma rede
    // lenta num momento pontual.
    aiEnabled: config?.ai_enabled ?? true,
    storefrontEnabled: config?.storefront_enabled ?? true,
    ocrEnabled: config?.ocr_enabled ?? true,
  };
}
