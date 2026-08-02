// components/MaintenanceBanner.tsx
//
// "A consultora entra pelo auth e recebe uma notificação de manutenção,
// que pode afetar a estabilidade e funcionalidade" — antes, ativar
// manutenção no admin-panel só mexia no localStorage do PRÓPRIO ADMIN.
// Nenhuma consultora, em lugar nenhum, jamais saberia que o sistema
// estava em manutenção.
//
// É um AVISO, não um bloqueio: ela continua usando o app normalmente. Uma
// trava total (impedir login) é uma decisão bem mais arriscada — se
// alguém esquecer ligado, tranca todo mundo fora, inclusive quem paga.
import { useState, useEffect } from "react";
import { X, Wrench } from "lucide-react";
import { systemConfigApi } from "../lib/api";

// Some ao fechar, mas só PARA ESTA SESSÃO (sem localStorage) — se ela
// recarregar a página ou logar de novo amanhã e a manutenção ainda
// estiver ativa, o aviso reaparece. Diferente de uma promoção, vale a
// pena lembrar de novo a cada entrada.
export function MaintenanceBanner() {
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [dispensado, setDispensado] = useState(false);

  useEffect(() => {
    systemConfigApi
      .get()
      .then((cfg) => {
        if (cfg.maintenance_mode) setMensagem(cfg.maintenance_message);
      })
      .catch(() => { /* sem status ainda ou erro de rede — não é motivo pra alarmar ninguém */ });
  }, []);

  if (!mensagem || dispensado) return null;

  return (
    <div className="flex items-center justify-between gap-3 bg-amber-500 px-4 py-2.5 text-sm text-white">
      <div className="flex min-w-0 items-center gap-2">
        <Wrench className="h-4 w-4 shrink-0" />
        <p className="truncate">
          <strong>Sistema em manutenção.</strong> <span className="opacity-95">{mensagem}</span>
        </p>
      </div>
      <button
        onClick={() => setDispensado(true)}
        className="shrink-0 rounded-full p-1 hover:bg-black/10"
        title="Dispensar por agora"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
