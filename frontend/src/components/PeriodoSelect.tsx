// components/PeriodoSelect.tsx
// Seletor de período usado nos Relatórios e no painel do MEI.
//
// Dropdown em vez de botões: ocupa menos espaço no celular e o período
// escolhido fica sempre visível — com botões, a consultora precisa procurar
// qual está destacado.
//
// Ao escolher "Período personalizado", aparecem dois campos de data com o
// calendário nativo do navegador/celular. Usamos <input type="date"> de
// propósito: no Android e no iPhone ele abre o seletor do próprio sistema,
// que a consultora já sabe usar, sem depender de biblioteca extra.
import { useState } from "react";
import { Calendar, ChevronDown } from "lucide-react";
import type { PeriodoRelatorio, IntervaloDatas } from "../lib/api";

export const OPCOES_PERIODO: { valor: PeriodoRelatorio; rotulo: string }[] = [
  { valor: "30d", rotulo: "Últimos 30 dias" },
  { valor: "60d", rotulo: "Últimos 60 dias" },
  { valor: "90d", rotulo: "Últimos 90 dias" },
  { valor: "ano", rotulo: "Ano todo" },
  { valor: "custom", rotulo: "Período personalizado" },
];

const hojeISO = () => new Date().toISOString().slice(0, 10);
const diasAtrasISO = (d: number) =>
  new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);

interface Props {
  valor: PeriodoRelatorio;
  datas?: IntervaloDatas;
  /** Recebe o período e, quando for "custom", também o intervalo. */
  onChange: (v: PeriodoRelatorio, datas?: IntervaloDatas) => void;
  /** Versão reduzida, para caber ao lado de um título. */
  compacto?: boolean;
}

export default function PeriodoSelect({ valor, datas, onChange, compacto }: Props) {
  // Guarda o rascunho enquanto ela escolhe as duas datas — só avisamos o pai
  // quando as duas estão preenchidas, para não recarregar a tela no meio.
  const [inicio, setInicio] = useState(datas?.start || diasAtrasISO(30));
  const [fim, setFim] = useState(datas?.end || hojeISO());

  const trocarPeriodo = (novo: PeriodoRelatorio) => {
    if (novo === "custom") {
      onChange("custom", { start: inicio, end: fim });
    } else {
      onChange(novo);
    }
  };

  const trocarData = (qual: "inicio" | "fim", v: string) => {
    if (!v) return;
    const novoInicio = qual === "inicio" ? v : inicio;
    const novoFim = qual === "fim" ? v : fim;
    if (qual === "inicio") setInicio(v);
    else setFim(v);
    onChange("custom", { start: novoInicio, end: novoFim });
  };

  const alturaCampo = compacto ? "px-2.5 py-1.5" : "px-3 py-2";
  const tamanhoTexto = compacto ? "text-[11px]" : "text-sm";

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <div className={`relative flex items-center gap-2 rounded-lg border border-border bg-card ${alturaCampo}`}>
        <Calendar className={`shrink-0 text-muted-foreground ${compacto ? "h-3.5 w-3.5" : "h-4 w-4"}`} />
        <select
          value={valor}
          onChange={(e) => trocarPeriodo(e.target.value as PeriodoRelatorio)}
          aria-label="Período do relatório"
          className={`w-full cursor-pointer appearance-none bg-transparent pr-5 font-medium text-foreground outline-none ${tamanhoTexto}`}
        >
          {OPCOES_PERIODO.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>
        <ChevronDown
          className={`pointer-events-none absolute right-2 shrink-0 text-muted-foreground ${
            compacto ? "h-3 w-3" : "h-3.5 w-3.5"
          }`}
        />
      </div>

      {valor === "custom" && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={inicio}
            max={fim}
            onChange={(e) => trocarData("inicio", e.target.value)}
            aria-label="Data inicial"
            className={`rounded-lg border border-border bg-card font-medium text-foreground outline-none focus:border-brand ${alturaCampo} ${tamanhoTexto}`}
          />
          <span className="text-xs text-muted-foreground">até</span>
          <input
            type="date"
            value={fim}
            min={inicio}
            max={hojeISO()}
            onChange={(e) => trocarData("fim", e.target.value)}
            aria-label="Data final"
            className={`rounded-lg border border-border bg-card font-medium text-foreground outline-none focus:border-brand ${alturaCampo} ${tamanhoTexto}`}
          />
        </div>
      )}
    </div>
  );
}