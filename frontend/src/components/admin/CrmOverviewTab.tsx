// components/admin/CrmOverviewTab.tsx
//
// Visão agregada do CRM de cada loja — quantos leads a vitrine capturou,
// taxa de opt-in de WhatsApp, ticket médio e recorrência.
//
// ⚠️ LIMITE FIRME DE LGPD, visível na própria tela: os clientes finais
// capturados na vitrine nunca deram consentimento com o Minha Amora — a
// relação de consentimento deles é com a CONSULTORA. Por isso este painel
// NUNCA mostra nome, telefone, e-mail ou qualquer dado que identifique uma
// pessoa — só contagens e médias por loja. O backend já garante isso (o
// endpoint nem inclui esses campos na resposta); o aviso aqui é para quem
// olhar a tela entender o porquê, não para "esconder" algo que existe.
import { useState, useEffect } from "react";
import { Loader2, Users, ShieldCheck, TrendingUp, Repeat } from "lucide-react";
import { adminHealthApi } from "../../lib/api";

const dinheiro = (v: number) =>
  (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function CrmOverviewTab() {
  const [dados, setDados] = useState<Awaited<ReturnType<typeof adminHealthApi.getCrmOverview>> | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    adminHealthApi
      .getCrmOverview()
      .then(setDados)
      .catch((e: any) => setErro(e?.message || "Não foi possível carregar."))
      .finally(() => setCarregando(false));
  }, []);

  if (carregando) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
      </div>
    );
  }

  if (erro || !dados) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
        {erro || "Sem dados."}
      </div>
    );
  }

  const { totais, lojas } = dados;

  return (
    <div className="space-y-5">
      {/* Aviso de propósito — não é decoração, é o motivo desta tela existir assim */}
      <div className="flex items-start gap-2 rounded-xl border border-brand/20 bg-brand/5 p-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Só números agregados por loja. Nome, telefone e histórico dos
          clientes finais pertencem à relação de cada consultora com a
          cliente dela — a plataforma não tem acesso a esses dados.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 shrink-0 text-brand" />
            <span className="text-xs text-muted-foreground">Lojas com CRM ativo</span>
          </div>
          <p className="mt-1.5 text-lg font-bold text-foreground">{totais.lojas_com_crm_ativo}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 shrink-0 text-brand" />
            <span className="text-xs text-muted-foreground">Leads capturados no total</span>
          </div>
          <p className="mt-1.5 text-lg font-bold text-foreground">{totais.leads_capturados}</p>
        </div>
      </div>

      {lojas.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          Nenhuma loja capturou clientes na vitrine ainda.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Loja</th>
                <th className="px-3 py-3 text-right font-medium">Leads</th>
                <th className="px-3 py-3 text-right font-medium" title="% que aceitou receber WhatsApp">Opt-in</th>
                <th className="px-3 py-3 text-right font-medium" title="Compraram mais de uma vez">Recorrentes</th>
                <th className="px-3 py-3 text-right font-medium">Ticket médio</th>
              </tr>
            </thead>
            <tbody>
              {lojas.map((l) => (
                <tr key={l.store_id} className="border-t border-border hover:bg-secondary/40">
                  <td className="px-4 py-3 font-medium text-foreground">{l.store_name}</td>
                  <td className="px-3 py-3 text-right text-foreground">{l.total_leads}</td>
                  <td className="px-3 py-3 text-right text-muted-foreground">{l.opt_in_rate}%</td>
                  <td className="px-3 py-3 text-right text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Repeat className="h-3 w-3" /> {l.clientes_recorrentes}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right text-muted-foreground">{dinheiro(l.ticket_medio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
