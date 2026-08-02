// pages/MovementHistory.tsx — VERSÃO REFATORADA COM TEMA DINÂMICO
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, ArrowUpCircle, ArrowDownCircle, Search, Package,
  ChevronDown, ChevronUp, Calendar, Calculator, Download, Loader2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { movementsApi, formatMoney, movementsReportApi } from "../lib/api";
import { btn } from "../lib/ui";
import { useAuth } from "../hooks/useAuth";

const TYPE_LABELS: Record<string, { label: string; emoji: string }> = {
  VENDA: { label: "Venda", emoji: "💰" },
  USO_PROPRIO: { label: "Uso Próprio", emoji: "👤" },
  PRESENTE: { label: "Presente", emoji: "🎁" },
  BRINDE: { label: "Brinde", emoji: "🤝" },
  PERDA: { label: "Perda", emoji: "⚠️" },
  AJUSTE: { label: "Ajuste", emoji: "⚖️" },
  ENTRADA: { label: "Entrada", emoji: "📦" },
};

export default function MovementHistory() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [movements, setMovements] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "entrada" | "saida">("all");
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | number | null>(null);
  const [baixandoRel, setBaixandoRel] = useState(false);

  useEffect(() => {
    if (!user) return;
    movementsApi
      .list()
      .then((data: any[]) => {
        const normalizedData = data.map((m) => {
          const rawType = (m.transaction_type || m.movement_type || "").toUpperCase();
          const uiType = rawType === "ENTRADA" ? "entrada" : "saida";
          return {
            ...m,
            raw_type: rawType,
            ui_type: uiType,
            product_name: m.product?.name || m.product_name || "Produto Desconhecido",
            barcode: m.product?.bar_code || m.barcode || "",
          };
        });
        setMovements(normalizedData);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [user]);

  // ── Meses disponíveis ──
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    movements.forEach((m) => {
      const d = new Date(m.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.add(key);
    });
    return Array.from(months).sort().reverse();
  }, [movements]);

  const formatMonthLabel = (YYYYMM: string) => {
    const [y, m] = YYYYMM.split("-");
    const date = new Date(parseInt(y), parseInt(m) - 1);
    return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  };

  // ── Filtro combinado ──
  const filtered = movements.filter((m) => {
    const matchSearch =
      m.product_name.toLowerCase().includes(search.toLowerCase()) ||
      m.barcode.includes(search);
    const matchFilter = filter === "all" || m.ui_type === filter;
    const d = new Date(m.created_at);
    const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const matchMonth = selectedMonth === "all" || mKey === selectedMonth;
    return matchSearch && matchFilter && matchMonth;
  });

  // ── Totais ──
  const totalEntradas = filtered
    .filter((m) => m.ui_type === "entrada")
    .reduce((s, m) => s + Math.abs(m.quantity), 0);

  const totalSaidas = filtered
    .filter((m) => m.ui_type === "saida")
    .reduce((s, m) => s + Math.abs(m.quantity), 0);

  const totalReceita = filtered
    .filter((m) => m.ui_type === "saida" && m.raw_type === "VENDA")
    .reduce((s, m) => s + (m.unit_price || m.unit_price_sold || 0) * Math.abs(m.quantity), 0);

  const totalLucro = filtered
    .filter((m) => m.profit != null)
    .reduce((s, m) => s + (m.profit || 0), 0);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // ── Relatório de movimentação (CSV) ──
  // Entradas, saídas, valores, lucro e a descrição preenchida pela
  // consultora. CSV abre no Excel e no Google Sheets sem plugin.
  const baixarRelatorio = async () => {
    setBaixandoRel(true);
    try {
      await movementsReportApi.download("tudo");
    } catch {
      /* silencioso: o extrato na tela continua disponível */
    } finally {
      setBaixandoRel(false);
    }
  };

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* ══════════════════════════════════════════
          HEADER
          ══════════════════════════════════════════ */}
      <header className="sticky top-0 z-20 border-b border-border bg-card shadow-sm">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-6 py-4">
          <button
            onClick={() => navigate("/")}
            className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="font-display text-lg font-bold text-foreground">
            Extrato de Movimentações
          </h1>
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
            {filtered.length}
          </span>

          <button
            onClick={baixarRelatorio}
            disabled={baixandoRel}
            className={`ml-auto ${btn.base} ${btn.sm} ${btn.suave}`}
            title="Baixar relatório de movimentação"
          >
            {baixandoRel ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">Relatório</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-6 space-y-4">
        {/* ══════════════════════════════════════════
            SUMMARY CARDS
            ══════════════════════════════════════════ */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">
              Entradas
            </p>
            <p className="font-display text-2xl font-bold text-success">
              +{totalEntradas}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">
              Saídas
            </p>
            <p className="font-display text-2xl font-bold text-destructive">
              -{totalSaidas}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">
              Receita (Vendas)
            </p>
            <p className="font-display text-2xl font-bold text-foreground">
              {formatMoney(totalReceita)}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">
              Lucro Bruto
            </p>
            <p
              className={`font-display text-2xl font-bold ${
                totalLucro >= 0 ? "text-success" : "text-destructive"
              }`}
            >
              {formatMoney(totalLucro)}
            </p>
          </div>
        </div>

        {/* ══════════════════════════════════════════
            FILTERS
            ══════════════════════════════════════════ */}
        <div className="flex flex-col gap-3 sm:flex-row pt-2">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 focus-within:border-brand/50 shadow-sm">
            <Search className="h-5 w-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por nome ou código..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          {availableMonths.length > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm min-w-[160px]">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent text-sm font-medium text-foreground outline-none w-full cursor-pointer capitalize"
              >
                <option value="all">Todo o período</option>
                {availableMonths.map((m) => (
                  <option key={m} value={m} className="capitalize">
                    {formatMonthLabel(m)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {(["all", "entrada", "saida"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors border ${
                filter === f
                  ? "bg-brand text-white shadow-sm border-brand"
                  : "bg-card text-muted-foreground border-border hover:bg-secondary"
              }`}
            >
              {f === "all"
                ? "Todos os Tipos"
                : f === "entrada"
                ? "Apenas Entradas"
                : "Apenas Saídas"}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════
            MOVEMENT LIST
            ══════════════════════════════════════════ */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-muted-foreground">
            <Package className="mb-4 h-14 w-14 opacity-20" />
            <p className="text-base font-medium">Nenhuma movimentação</p>
            <p className="text-sm mt-1">Tente mudar o mês ou os filtros acima.</p>
          </div>
        ) : (
          <div className="space-y-3 pt-2">
            {filtered.map((m, i) => {
              const typeInfo = TYPE_LABELS[m.raw_type] || TYPE_LABELS["AJUSTE"];
              const displayQuantity = Math.abs(m.quantity);
              const isExpanded = expandedId === m.id;
              const isEntry = m.ui_type === "entrada";
              const operacaoTotal =
                displayQuantity * (Number(m.unit_price) || Number(m.unit_cost) || 0);

              return (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02 }}
                  onClick={() => setExpandedId(isExpanded ? null : m.id)}
                  className="flex flex-col rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-md cursor-pointer relative overflow-hidden"
                >
                  {/* Data no topo */}
                  <div className="absolute top-2 right-3 text-[10px] text-muted-foreground font-medium flex items-center gap-1.5">
                    <Calendar className="h-3 w-3" />
                    {formatDate(m.created_at)}
                  </div>

                  <div className="flex items-start gap-4 mt-3">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                        isEntry ? "bg-success/10" : "bg-destructive/10"
                      }`}
                    >
                      {isEntry ? (
                        <ArrowUpCircle className="h-6 w-6 text-success" />
                      ) : (
                        <ArrowDownCircle className="h-6 w-6 text-destructive" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 pr-4">
                      <div className="flex justify-between items-start mb-1">
                        <p className="text-sm font-bold text-foreground line-clamp-2 leading-tight">
                          {m.product_name}
                        </p>
                        <span
                          className={`text-sm font-mono font-black shrink-0 ml-3 ${
                            isEntry ? "text-success" : "text-destructive"
                          }`}
                        >
                          {isEntry ? "+" : "-"}
                          {displayQuantity} un.
                        </span>
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 font-bold uppercase tracking-wider ${
                            isEntry
                              ? "bg-success/10 text-success"
                              : "bg-destructive/10 text-destructive"
                          }`}
                        >
                          {isEntry ? "Entrada" : "Saída"}
                        </span>
                        <span className="font-mono bg-secondary px-2 py-0.5 rounded">
                          {m.barcode}
                        </span>
                        {typeInfo && (
                          <span className="bg-secondary px-2 py-0.5 rounded text-foreground font-medium">
                            {typeInfo.emoji} {typeInfo.label}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Preços */}
                  <div className="flex items-center justify-between border-t border-border/50 pt-3 mt-3">
                    <div className="flex gap-5 text-xs text-muted-foreground">
                      <p>
                        Custo:{" "}
                        <span className="font-bold text-foreground">
                          {formatMoney(m.unit_cost)}
                        </span>
                      </p>
                      <p>
                        Venda:{" "}
                        <span className="font-bold text-foreground">
                          {formatMoney(m.unit_price)}
                        </span>
                      </p>
                    </div>
                    <div className="p-1.5 rounded-full bg-secondary/80 text-muted-foreground hover:bg-secondary transition-colors">
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </div>
                  </div>

                  {/* ── Acordeão com detalhes ── */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-3 pt-3 border-t border-border/50 grid grid-cols-2 gap-y-3 gap-x-4 text-xs">
                          <div className="bg-secondary/30 p-3 rounded-xl border border-border">
                            <p className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1.5 mb-1">
                              <Calculator className="h-3.5 w-3.5" /> Total da Operação
                            </p>
                            <p className="font-mono font-bold text-base text-foreground">
                              {formatMoney(operacaoTotal)}{" "}
                              <span className="text-[10px] font-medium text-muted-foreground">
                                ({displayQuantity}x)
                              </span>
                            </p>
                          </div>

                          {m.profit != null && (
                            <div className="bg-secondary/30 p-3 rounded-xl border border-border">
                              <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">
                                Lucro da Venda
                              </p>
                              <p
                                className={`font-mono font-bold text-base ${
                                  m.profit >= 0 ? "text-success" : "text-destructive"
                                }`}
                              >
                                {formatMoney(m.profit)}
                              </p>
                            </div>
                          )}

                          {(m.batch_code ||
                            m.expiration_date ||
                            m.description ||
                            m.notes) && (
                            <div className="col-span-2 rounded-xl bg-brand/5 p-3.5 border border-brand/20 space-y-2">
                              <p className="text-[10px] uppercase font-bold text-brand mb-1.5 flex items-center gap-1.5">
                                <Package className="h-3.5 w-3.5" /> Informações Adicionais
                              </p>
                              {m.batch_code && (
                                <p className="text-foreground text-xs">
                                  <span className="font-semibold text-brand/80">Lote:</span>{" "}
                                  {m.batch_code}
                                </p>
                              )}
                              {m.expiration_date && (
                                <p className="text-foreground text-xs">
                                  <span className="font-semibold text-brand/80">Validade:</span>{" "}
                                  {new Date(m.expiration_date).toLocaleDateString("pt-BR")}
                                </p>
                              )}
                              {m.description && (
                                <p className="text-foreground text-xs">
                                  <span className="font-semibold text-brand/80">Descrição:</span>{" "}
                                  {m.description}
                                </p>
                              )}
                              {m.notes && (
                                <p className="text-foreground text-xs">
                                  <span className="font-semibold text-brand/80">Notas:</span>{" "}
                                  {m.notes}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}