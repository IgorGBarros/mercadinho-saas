// pages/ProductList.tsx — VERSÃO FINAL COM PALETA COMPLETA MINHA AMORA
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus, Search, Edit2, Package, ArrowLeft, Scale, Loader2,
  AlertTriangle, Clock, ChevronDown, ChevronUp, X, BookOpen, ZoomIn, Calendar,
  TrendingUp, TrendingDown, Download } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { inventoryApi, formatMoney, stockReportApi } from "../lib/api";
import { btn } from "../lib/ui";
import { useToast } from '../components/ui/use-toast';// ✅ Importar useToast original para evitar dependência circular
import StockAdjustmentModal from "../components/StockAdjustmentModal";
import ProductSearchModal from "../components/ProductSearchModal";

function getStockStatus(qty: number, min: number): { label: string; color: string } {
  if (qty <= 0)
    return { label: "Esgotado", color: "bg-destructive/10 text-destructive border-destructive/20" };
  if (qty <= min)
    return { label: "Baixo", color: "bg-brand-peach/40 text-brand-rose border-brand-peach" };
  return { label: "Em Estoque", color: "bg-brand/10 text-brand border-brand/20" };
}

function getBatchStatus(batch: any) {
  if (!batch.expiration_date)
    return { status: "no_date", color: "text-muted-foreground", icon: Calendar };

  const exp = new Date(batch.expiration_date);
  exp.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / 86400000);

  if (daysLeft <= 0) return { status: "expired", color: "text-destructive", icon: AlertTriangle };
  if (daysLeft <= 7) return { status: "critical", color: "text-destructive", icon: AlertTriangle };
  if (daysLeft <= 30) return { status: "warning", color: "text-brand-rose", icon: Clock };
  return { status: "valid", color: "text-brand", icon: Clock };
}

const consolidateBatchesByExpiry = (batches: any[]) => {
  if (!batches || batches.length === 0) return [];
  const activeBatches = batches.filter((batch) => batch.quantity > 0);
  const grouped = activeBatches.reduce((acc: any, batch: any) => {
    const key = batch.expiration_date || "no_date";
    if (!acc[key]) {
      acc[key] = {
        expiration_date: batch.expiration_date,
        quantity: 0,
        batch_codes: [],
        ids: [],
        formatted_date: batch.expiration_date
          ? new Date(batch.expiration_date).toLocaleDateString("pt-BR")
          : "Sem validade",
      };
    }
    acc[key].quantity += batch.quantity;
    acc[key].batch_codes.push(batch.batch_code || "S/N");
    acc[key].ids.push(batch.id);
    return acc;
  }, {});

  return Object.entries(grouped)
    .map(([, data]: [string, any]) => ({
      id: `consolidated_${data.ids[0]}`,
      expiration_date: data.expiration_date,
      quantity: data.quantity,
      batch_code:
        data.batch_codes.length === 1
          ? data.batch_codes[0]
          : `${data.batch_codes.length} lotes`,
      is_consolidated: data.batch_codes.length > 1,
      original_batches: data.batch_codes,
      formatted_date: data.formatted_date,
    }))
    .sort((a: any, b: any) => {
      if (!a.expiration_date && !b.expiration_date) return 0;
      if (!a.expiration_date) return 1;
      if (!b.expiration_date) return -1;
      return new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime();
    });
};

type StockFilter = "TODOS" | "COM_ESTOQUE" | "ESGOTADO";

export default function ProductList() {
  const [baixandoRel, setBaixandoRel] = useState(false);

  // Relatório do estoque ATUAL em CSV: o que tem hoje, quanto vale e o que
  // está para vencer. (O histórico de entradas/saídas fica no Extrato.)
  const baixarRelatorio = async () => {
    setBaixandoRel(true);
    try {
      await stockReportApi.download();
    } catch {
      /* silencioso: a lista na tela continua disponível */
    } finally {
      setBaixandoRel(false);
    }
  };

  const navigate = useNavigate();
  const { toast } = useToast();

  const [inventory, setInventory] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [filterStock, setFilterStock] = useState<StockFilter>("COM_ESTOQUE");
  const [loading, setLoading] = useState(true);

  const [adjustItem, setAdjustItem] = useState<any | null>(null);
  const [showCatalog, setShowCatalog] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const loadInventory = async () => {
    try {
      setLoading(true);
      const data = await inventoryApi.list();

      const processedData = data.map((item: any) => {
        if (item.batches && Array.isArray(item.batches)) {
          item.consolidatedBatches = consolidateBatchesByExpiry(item.batches);
          item.batches = item.batches
            .filter((batch: any) => batch.quantity > 0)
            .sort((a: any, b: any) => {
              if (!a.expiration_date && !b.expiration_date) return a.id - b.id;
              if (!a.expiration_date) return 1;
              if (!b.expiration_date) return -1;
              return new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime();
            });
        } else {
          item.consolidatedBatches = [];
        }

        if (item.consolidatedBatches && item.consolidatedBatches.length > 0) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          item.batchSummary = {
            total: item.consolidatedBatches.length,
            expired: item.consolidatedBatches.filter(
              (b: any) => b.expiration_date && new Date(b.expiration_date) < today
            ).length,
            nearExpiry: item.consolidatedBatches.filter((b: any) => {
              if (!b.expiration_date) return false;
              const exp = new Date(b.expiration_date);
              const daysLeft = Math.ceil((exp.getTime() - today.getTime()) / 86400000);
              return daysLeft > 0 && daysLeft <= 30;
            }).length,
            valid: item.consolidatedBatches.filter((b: any) => {
              if (!b.expiration_date) return true;
              const exp = new Date(b.expiration_date);
              const daysLeft = Math.ceil((exp.getTime() - today.getTime()) / 86400000);
              return daysLeft > 30;
            }).length,
          };
        } else {
          item.batchSummary = { total: 0, expired: 0, nearExpiry: 0, valid: 0 };
        }

        return item;
      });

      setInventory(processedData);
    } catch (error) {
      console.error("Erro ao carregar estoque:", error);
      toast({ title: "Erro ao carregar estoque", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInventory();
  }, []);

  const filtered = inventory.filter((item) => {
    const qty = item.total_quantity ?? item.quantity ?? 0;
    const prodName = item.product?.name || item.product_name || "";
    const prodBarcode = item.product?.bar_code || item.barcode || "";
    const prodSku = item.product?.natura_sku || item.sku || "";
    const prodCat = item.product?.category || item.category || "";

    const textMatch =
      prodName.toLowerCase().includes(search.toLowerCase()) ||
      (item.custom_name || "").toLowerCase().includes(search.toLowerCase()) ||
      prodBarcode.includes(search) ||
      prodSku.toLowerCase().includes(search.toLowerCase()) ||
      prodCat.toLowerCase().includes(search.toLowerCase());

    const stockMatch =
      filterStock === "TODOS"
        ? true
        : filterStock === "COM_ESTOQUE"
        ? qty > 0
        : qty <= 0;

    return textMatch && stockMatch;
  });

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* ══════════════════════════════════════════
          HEADER
          ══════════════════════════════════════════ */}
      <header className="sticky top-0 z-20 border-b border-border bg-card">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/")}
              className="rounded-lg p-2 text-muted-foreground hover:bg-brand-soft hover:text-brand transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="font-display text-lg font-bold text-foreground">Meu Estoque</h1>
            <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-bold text-brand">
              {inventory.length}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={baixarRelatorio}
              disabled={baixandoRel}
              className={`${btn.base} ${btn.md} ${btn.contorno}`}
              title="Baixar relatório de estoque"
            >
              {baixandoRel ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">Relatório</span>
            </button>
            <button
              onClick={() => setShowCatalog(true)}
              className="flex items-center gap-1.5 rounded-lg border border-brand/20 bg-brand-soft px-3 py-2 text-sm font-medium text-brand transition-colors hover:bg-brand-peach/30"
            >
              <BookOpen className="h-4 w-4" />
              <span className="hidden sm:inline">Catálogo</span>
            </button>
            <button
              onClick={() => navigate("/products/new")}
              className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 shadow-sm"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Novo</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-6">
        {/* ── Search ── */}
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-brand/15 bg-brand-soft/50 px-3 py-2.5 shadow-sm focus-within:ring-2 focus-within:ring-brand/20 focus-within:border-brand/30 transition-all">
          <Search className="h-4 w-4 text-brand-rose" />
          <input
            type="text"
            placeholder="Buscar por nome, código, SKU ou categoria..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-brand-rose/50"
          />
        </div>

        {/* ── Stock Filters ── */}
        <div className="mb-6 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <button
            onClick={() => setFilterStock("COM_ESTOQUE")}
            className={`px-4 py-1.5 text-xs rounded-full font-bold whitespace-nowrap transition-colors border ${
              filterStock === "COM_ESTOQUE"
                ? "bg-brand text-white border-brand shadow-sm"
                : "bg-brand-soft text-brand-rose border-brand-peach hover:bg-brand-peach/30"
            }`}
          >
            Em Estoque
          </button>
          <button
            onClick={() => setFilterStock("ESGOTADO")}
            className={`px-4 py-1.5 text-xs rounded-full font-bold whitespace-nowrap transition-colors border ${
              filterStock === "ESGOTADO"
                ? "bg-destructive text-destructive-foreground border-destructive shadow-sm"
                : "bg-brand-soft text-brand-rose border-brand-peach hover:bg-brand-peach/30"
            }`}
          >
            Esgotados
          </button>
          <button
            onClick={() => setFilterStock("TODOS")}
            className={`px-4 py-1.5 text-xs rounded-full font-bold whitespace-nowrap transition-colors border ${
              filterStock === "TODOS"
                ? "bg-brand-rose text-white border-brand-rose shadow-sm"
                : "bg-brand-soft text-brand-rose border-brand-peach hover:bg-brand-peach/30"
            }`}
          >
            Todos
          </button>
        </div>

        {/* ══════════════════════════════════════════
            PRODUCT LIST
            ══════════════════════════════════════════ */}
        <div className="space-y-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-brand">
              <Loader2 className="animate-spin w-8 h-8 mb-4" />
              <p className="text-sm font-medium text-brand-rose">Carregando estoque...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Package className="mb-3 h-12 w-12 text-brand-lavender" />
              <p className="text-sm font-medium text-brand-rose">Nenhum produto encontrado</p>
            </div>
          ) : (
            filtered.map((item, i) => {
              const qty = item.total_quantity ?? item.quantity ?? 0;
              const minQty = item.min_quantity ?? 5;
              const status = getStockStatus(qty, minQty);

              const prodName = item.product?.name || item.product_name || "Sem Nome";
              const displayName = item.custom_name || prodName;
              const imageUrl = item.product?.image_url || item.image_url;
              const barcode = item.product?.bar_code || item.barcode;
              const category = item.product?.category || item.category;

              const productIdToEdit = item.product?.id || item.id;
              const isExpanded = expandedId === item.id;

              const salePrice = Number(item.sale_price) || 0;
              const costPrice = Number(item.cost_price) || 0;
              const profitUnit = salePrice - costPrice;

              const nextExpiryBatch =
                item.consolidatedBatches && item.consolidatedBatches.length > 0
                  ? item.consolidatedBatches.find((b: any) => b.expiration_date)
                  : null;

              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex flex-col rounded-xl border border-brand/10 bg-card p-4 hover:shadow-md hover:border-brand/20 transition-all cursor-pointer relative overflow-hidden"
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                >
                  <div className="flex items-start gap-4">
                    {/* Foto */}
                    <div
                      className="relative group shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (imageUrl) setPreviewImage(imageUrl);
                      }}
                    >
                      {imageUrl ? (
                        <>
                          <img
                            src={imageUrl}
                            alt={displayName}
                            className="h-16 w-16 rounded-xl object-cover border border-brand-peach bg-brand-soft"
                          />
                          <div className="absolute inset-0 bg-brand/0 group-hover:bg-brand/20 transition-colors rounded-xl flex items-center justify-center">
                            <ZoomIn className="text-white opacity-0 group-hover:opacity-100 h-5 w-5 transition-opacity" />
                          </div>
                        </>
                      ) : (
                        <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-brand-soft border border-brand-peach">
                          <Package className="h-6 w-6 text-brand-rose" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1 pt-0.5">
                      <p className="text-sm font-bold text-foreground line-clamp-2 leading-tight">
                        {displayName}
                      </p>

                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span
                          className={`shrink-0 rounded-full border px-2 py-0.5 font-bold uppercase tracking-wider ${status.color}`}
                        >
                          {status.label}
                        </span>
                        <span className="bg-brand-lavender/30 text-brand-rose px-2 py-0.5 rounded font-medium">
                          {category}
                        </span>
                        <span className="font-mono bg-brand-soft px-2 py-0.5 rounded text-brand-rose/70">
                          {barcode}
                        </span>

                        {nextExpiryBatch &&
                          (() => {
                            const batchStatus = getBatchStatus(nextExpiryBatch);
                            if (batchStatus.status === "valid" || batchStatus.status === "no_date")
                              return null;

                            const exp = new Date(nextExpiryBatch.expiration_date);
                            const now = new Date();
                            const daysLeft = Math.ceil(
                              (exp.getTime() - now.getTime()) / 86400000
                            );

                            return (
                              <span
                                className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${
                                  batchStatus.status === "expired" ||
                                  batchStatus.status === "critical"
                                    ? "border-destructive/20 bg-destructive/10 text-destructive"
                                    : "border-brand-rose/30 bg-brand-peach/40 text-brand-rose"
                                }`}
                              >
                                <batchStatus.icon className="h-3 w-3" />
                                {daysLeft <= 0 ? "Vencido" : `${daysLeft}d`}
                              </span>
                            );
                          })()}

                        {item.consolidatedBatches && item.consolidatedBatches.length > 1 && (
                          <span className="inline-flex items-center gap-0.5 rounded-full border border-brand-lavender bg-brand-lavender/20 text-brand px-1.5 py-0.5 text-[10px] font-bold">
                            <Calendar className="h-3 w-3" />
                            {item.consolidatedBatches.length} validades
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ── Resumo ── */}
                  <div className="flex items-center justify-between border-t border-brand-peach/30 pt-3 mt-3">
                    <div className="flex gap-4 text-xs text-brand-rose/70">
                      <p>
                        Venda:{" "}
                        <span className="font-bold text-foreground">
                          {formatMoney(salePrice)}
                        </span>
                      </p>
                      <p className="flex items-center gap-1">
                        Lucro:
                        <span
                          className={`font-bold flex items-center gap-0.5 ${
                            profitUnit >= 0 ? "text-brand" : "text-destructive"
                          }`}
                        >
                          {profitUnit >= 0 ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : (
                            <TrendingDown className="h-3 w-3" />
                          )}
                          {formatMoney(profitUnit)}
                        </span>
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <p
                        className={`text-sm font-bold font-mono ${
                          qty <= 0 ? "text-destructive" : "text-brand"
                        }`}
                      >
                        {qty} un.
                      </p>
                      <div className="p-1 rounded-full bg-brand-soft text-brand-rose hover:bg-brand-peach/40 transition-colors">
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ── Acordeão ── */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-3 pt-3 border-t border-brand-peach/30 space-y-4">
                          {/* Financeiro */}
                          <div className="grid grid-cols-2 gap-3">
                            <div className="bg-brand-soft p-3 rounded-xl border border-brand-peach/50">
                              <p className="text-[10px] uppercase font-bold text-brand-rose/60 mb-0.5">
                                Custo Unitário
                              </p>
                              <p className="font-mono text-sm font-semibold text-foreground">
                                {formatMoney(costPrice)}
                              </p>
                            </div>
                            <div className="bg-brand-lavender/15 p-3 rounded-xl border border-brand-lavender/40">
                              <p className="text-[10px] uppercase font-bold text-brand/70 mb-0.5">
                                Lucro Bruto Un.
                              </p>
                              <p
                                className={`font-mono text-sm font-bold ${
                                  profitUnit >= 0 ? "text-brand" : "text-destructive"
                                }`}
                              >
                                {formatMoney(profitUnit)}
                              </p>
                            </div>
                          </div>

                          {/* Lotes consolidados */}
                          {item.consolidatedBatches && item.consolidatedBatches.length > 0 && (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-[10px] uppercase font-bold text-brand-rose/60 flex items-center gap-1">
                                  <Clock className="h-3 w-3" /> Validades Consolidadas (FIFO)
                                </p>
                                {item.batchSummary && (
                                  <div className="flex items-center gap-1 text-[10px]">
                                    {item.batchSummary.expired > 0 && (
                                      <span className="bg-destructive/10 text-destructive px-1.5 py-0.5 rounded-full font-bold">
                                        {item.batchSummary.expired} vencidas
                                      </span>
                                    )}
                                    {item.batchSummary.nearExpiry > 0 && (
                                      <span className="bg-brand-peach/50 text-brand-rose px-1.5 py-0.5 rounded-full font-bold">
                                        {item.batchSummary.nearExpiry} próximas
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="space-y-1">
                                {item.consolidatedBatches.map((batch: any, index: number) => {
                                  const batchStatus = getBatchStatus(batch);
                                  const isFirstBatch = index === 0;

                                  return (
                                    <motion.div
                                      key={batch.id}
                                      initial={{ opacity: 0, x: -10 }}
                                      animate={{ opacity: 1, x: 0 }}
                                      transition={{ delay: index * 0.05 }}
                                      className={`flex justify-between items-center p-3 rounded-xl border text-xs transition-all ${
                                        isFirstBatch
                                          ? "bg-brand-soft border-brand/20 shadow-sm"
                                          : "bg-card border-brand-peach/20"
                                      }`}
                                    >
                                      <div className="flex items-center gap-2">
                                        <batchStatus.icon
                                          className={`h-3 w-3 ${batchStatus.color}`}
                                        />
                                        <span className="font-medium text-brand-rose/70">
                                          {batch.batch_code}
                                        </span>
                                        {isFirstBatch && (
                                          <span className="bg-brand/10 text-brand px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                                            PRÓXIMO
                                          </span>
                                        )}
                                        {batch.is_consolidated && (
                                          <span className="bg-brand-lavender/30 text-brand px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                                            CONSOLIDADO
                                          </span>
                                        )}
                                      </div>

                                      <div className="flex items-center gap-3">
                                        <span
                                          className={`text-foreground flex items-center gap-1 ${batchStatus.color}`}
                                        >
                                          <Calendar className="h-3 w-3" />
                                          {batch.formatted_date}
                                        </span>
                                        <span
                                          className={`font-mono font-bold px-2 py-0.5 rounded-full ${
                                            isFirstBatch
                                              ? "bg-brand text-white"
                                              : "bg-brand-soft text-brand-rose"
                                          }`}
                                        >
                                          {batch.quantity} un.
                                        </span>
                                      </div>
                                    </motion.div>
                                  );
                                })}
                              </div>
                              <div className="text-xs text-brand-rose/60 bg-brand-soft p-2 rounded-lg border border-brand-peach/30">
                                💡 Lotes com a mesma validade foram consolidados para melhor visualização
                              </div>
                            </div>
                          )}

                          {/* Botões de ação */}
                          <div className="flex gap-2 pt-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setAdjustItem(item);
                              }}
                              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-brand-soft py-3 text-xs font-bold hover:bg-brand-peach/30 transition-colors text-brand border border-brand-peach/50"
                            >
                              <Scale className="h-4 w-4" /> Ajustar Saldo
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/products/${productIdToEdit}/edit`);
                              }}
                              className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-brand-peach/50 py-3 text-xs font-bold hover:bg-brand-peach/20 transition-colors text-brand-rose"
                            >
                              <Edit2 className="h-4 w-4" /> Editar Produto
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })
          )}
        </div>
      </main>

      {/* Lightbox */}
      <AnimatePresence>
        {previewImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => setPreviewImage(null)}
          >
            <button
              className="absolute top-4 right-4 p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"
              onClick={() => setPreviewImage(null)}
            >
              <X size={24} />
            </button>
            <motion.img
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              src={previewImage}
              alt="Visualização do Produto"
              className="max-w-full max-h-[80vh] rounded-xl object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <StockAdjustmentModal
        isOpen={adjustItem !== null}
        onClose={() => setAdjustItem(null)}
        item={adjustItem}
        onAdjusted={loadInventory}
      />
      <ProductSearchModal
        isOpen={showCatalog}
        onClose={() => setShowCatalog(false)}
        onSelect={(product) => {
          toast({
            title: "Produto selecionado",
            description: `${product.name} - Use "Novo" para adicionar ao estoque`,
          });
          setShowCatalog(false);
        }}
      />
    </div>
  );
}