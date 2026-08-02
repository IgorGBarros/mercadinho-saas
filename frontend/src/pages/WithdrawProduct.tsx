// pages/WithdrawProduct.tsx — VERSÃO REFATORADA COM TEMA DINÂMICO
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ScanBarcode, DollarSign, Check, Loader2, X, Package, Search,
  ChevronRight, ChevronLeft, ShoppingBag, Gift, User as UserIcon,
  Megaphone, AlertTriangle as AlertIcon, Layers, Lock,
} from "lucide-react";
import BarcodeScanner from "../components/BarcodeScanner";
import BatchSelectModal from "../components/BatchSelectModal";
import InventorySearchModal from "../components/InventorySearchModal";
import UpgradeModal from "../components/UpgradeModal";
import ProBadge from "../components/ProBadge";
import {
  inventoryApi, batchApi, InventoryBatch, TransactionType, formatMoney,
  clearAppCache, movementsApi,
} from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { useFeatureGates } from "../hooks/useFeatureGates";
import { useToast } from '../components/ui/use-toast'; // ✅ Importar useToast original para evitar dependência circular

const SALE_TYPES: {
  value: TransactionType; label: string; emoji: string;
  icon: typeof ShoppingBag; desc: string; hasRevenue: boolean;
}[] = [
  { value: "venda", label: "Venda", emoji: "💰", icon: ShoppingBag, desc: "Gera receita e lucro", hasRevenue: true },
  { value: "presente", label: "Presente", emoji: "🎁", icon: Gift, desc: "Retirada pessoal", hasRevenue: false },
  { value: "brinde", label: "Brinde", emoji: "🤝", icon: Megaphone, desc: "Despesa de marketing", hasRevenue: false },
  { value: "perda", label: "Perda", emoji: "⚠️", icon: AlertIcon, desc: "Prejuízo operacional", hasRevenue: false },
  { value: "uso_proprio", label: "Uso Próprio", emoji: "👤", icon: UserIcon, desc: "Consumo pessoal", hasRevenue: false },
];

interface WithdrawData {
  barcode: string;
  product_id: string;
  inventory_id: string;
  product_name: string;
  category: string;
  current_quantity: number;
  cost_price: number;
  withdraw_qty: number;
  sale_price: number | null;
  sale_type: TransactionType;
  selected_batch: InventoryBatch | null;
  batches: InventoryBatch[];
  notes: string;
}

export default function WithdrawProduct() {
  const [step, setStep] = useState(0);
  const [showScanner, setShowScanner] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const [data, setData] = useState<WithdrawData>({
    barcode: "", product_id: "", inventory_id: "", product_name: "", category: "",
    current_quantity: 0, cost_price: 0, withdraw_qty: 1, sale_price: null,
    sale_type: "venda", selected_batch: null, batches: [], notes: "",
  });

  const navigate = useNavigate();
  const { user } = useAuth();
  const { isFeatureEnabled } = useFeatureGates();
  const { toast } = useToast();

  const handleScannerClick = () => {
    if (!isFeatureEnabled("barcode_scanner")) {
      setShowUpgrade(true);
      return;
    }
    setShowScanner(true);
  };

  const handleBarcodeScan = async (barcode: string) => {
    if (!barcode.trim()) return;
    setShowScanner(false);
    setNotFound(false);
    setData((p) => ({ ...p, barcode }));

    try {
      const allItems = await inventoryApi.list();
      const item = allItems.find(
        (i) =>
          i.product?.bar_code === barcode ||
          i.barcode === barcode ||
          String(i.product?.bar_code).trim() === barcode.trim() ||
          String(i.barcode).trim() === barcode.trim()
      );

      if (!item) {
        setNotFound(true);
        return;
      }

      const qty = item.total_quantity ?? item.quantity ?? 0;
      if (qty <= 0) {
        toast({ title: "Produto esgotado", description: "Você não tem estoque deste item.", variant: "destructive" });
        setNotFound(true);
        return;
      }

      let batches: InventoryBatch[] = [];
      try {
        batches = await batchApi.listByItem(item.id);
        batches = batches.filter((b) => b.quantity > 0);
      } catch {
        batches = [];
      }

      const sortedBatches = batches.sort((a, b) => {
        if (!a.expiration_date) return 1;
        if (!b.expiration_date) return -1;
        return new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime();
      });

      const batchCost = sortedBatches.length > 0 ? sortedBatches[0].cost_price : item.cost_price;
      const productId = String(item.product?.id || item.id || "");

      if (!productId) {
        setNotFound(true);
        return;
      }

      setData((p) => ({
        ...p,
        product_id: productId,
        inventory_id: item.id,
        product_name: item.product?.name || item.product_name || "Produto sem nome",
        category: item.product?.category || item.category || "Geral",
        current_quantity: qty,
        cost_price: batchCost,
        sale_price: item.sale_price || item.product?.official_price || null,
        batches: sortedBatches,
        selected_batch: sortedBatches.length > 0 ? sortedBatches[0] : null,
      }));

      if (sortedBatches.length > 1) {
        setShowBatchModal(true);
      } else {
        setStep(1);
      }

      toast({
        title: "Produto encontrado!",
        description: `${item.product?.name || item.product_name || "Produto"} — ${qty} un.`,
      });
    } catch {
      setNotFound(true);
    }
  };

  const handleBatchSelect = (batch: InventoryBatch) => {
    setShowBatchModal(false);
    setData((p) => ({
      ...p,
      selected_batch: batch,
      cost_price: batch.cost_price,
      withdraw_qty: Math.min(p.withdraw_qty, batch.quantity),
    }));
    setStep(1);
  };

  const maxQty = data.selected_batch?.quantity || data.current_quantity;

  const profit =
    data.sale_type === "venda" && data.sale_price
      ? (data.sale_price - data.cost_price) * data.withdraw_qty
      : null;

  const margin =
    data.sale_price && data.cost_price && data.cost_price > 0
      ? (((data.sale_price - data.cost_price) / data.cost_price) * 100).toFixed(1)
      : null;

  const currentSaleType = SALE_TYPES.find((t) => t.value === data.sale_type)!;

  const oldestBatch = data.batches?.length > 0 ? data.batches[0] : null;

  const isViolatingFifo =
    data.selected_batch &&
    oldestBatch &&
    data.selected_batch.id !== oldestBatch.id &&
    oldestBatch.expiration_date;

  const isExpired =
    data.selected_batch?.expiration_date &&
    new Date(data.selected_batch.expiration_date) < new Date();

  const handleSave = async () => {
    if (!user) return;
    setLoading(true);

    try {
      if (!data.product_id) throw new Error("ID do produto não encontrado");
      if (data.withdraw_qty <= 0) throw new Error("Quantidade deve ser maior que zero");
      if (data.withdraw_qty > data.current_quantity) throw new Error("Quantidade maior que o estoque disponível");

      const newQty = data.current_quantity - data.withdraw_qty;

      await inventoryApi.update(data.inventory_id, {
        total_quantity: newQty,
        quantity: newQty,
        sale_price: data.sale_type === "venda" ? data.sale_price : undefined,
      });

      const unitPrice = currentSaleType.hasRevenue ? (data.sale_price || 0) : 0;

      await movementsApi.create({
        product: data.product_id,
        transaction_type: data.sale_type.toUpperCase(),
        product_id: data.product_id,
        product_name: data.product_name,
        barcode: data.barcode,
        movement_type: "saida",
        quantity: data.withdraw_qty,
        sale_type: data.sale_type,
        unit_price: unitPrice,
        description: data.notes.trim() || `${currentSaleType.label} - ${data.product_name}`,
      });

      toast({
        title: "Baixa realizada!",
        description: `${data.withdraw_qty} unidades de ${data.product_name}. Estoque atual: ${newQty}`,
      });

      setIsSuccess(true);
      setTimeout(() => navigate("/"), 2000);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message || "Erro ao processar baixa", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* ══════════════════════════════════════════
          HEADER
          ══════════════════════════════════════════ */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
          <button onClick={() => navigate("/")} className="rounded-lg p-2 text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
          <h1 className="font-display text-base font-bold text-foreground">Baixa / PDV</h1>
          <div className="w-9" />
        </div>
      </header>

      {/* ── STEPS PROGRESS ── */}
      <div className="mx-auto max-w-lg px-4 pt-4">
        <div className="flex items-center gap-1">
          {["Escanear", "Tipo & Preço", "Confirmar"].map((label, i) => (
            <div key={label} className="flex flex-1 flex-col items-center gap-1">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  i <= step ? "bg-brand text-white" : "bg-muted text-muted-foreground"
                }`}
              >
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span className={`text-[10px] ${i <= step ? "text-brand font-medium" : "text-muted-foreground"}`}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════
          MAIN CONTENT
          ══════════════════════════════════════════ */}
      <main className="mx-auto max-w-lg px-4 py-6">
        <AnimatePresence mode="wait">
          {/* ════════════════════════════════
              STEP 0: SCAN
              ════════════════════════════════ */}
          {step === 0 && (
            <motion.div key="scan" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              {showScanner && !isFeatureEnabled("barcode_scanner") ? (
                <div className="space-y-4">
                  <BarcodeScanner
                    onScan={handleBarcodeScan}
                    onClose={() => {
                      setShowScanner(false);
                      setIsSearchOpen(true);
                    }}
                  />
                  <button onClick={() => setShowScanner(false)} className="w-full text-center text-sm text-muted-foreground underline mt-4">
                    Cancelar Câmera
                  </button>
                </div>
              ) : (
                <div className="space-y-6 rounded-xl border border-border bg-card p-5">
                  <div>
                    <label className="text-sm font-medium text-foreground">Código de Barras *</label>
                    <input
                      type="text"
                      value={data.barcode}
                      onChange={(e) => setData((p) => ({ ...p, barcode: e.target.value }))}
                      onBlur={(e) => handleBarcodeScan(e.target.value)}
                      placeholder="Escaneie ou digite..."
                      className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus:border-brand"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-xs text-muted-foreground">OU</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>

                  <button
                    onClick={handleScannerClick}
                    className={`w-full flex items-center justify-between p-4 border border-border rounded-xl hover:bg-secondary text-left group transition-all ${
                      isFeatureEnabled("barcode_scanner") ? "opacity-80" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2 rounded-lg ${
                          !isFeatureEnabled("barcode_scanner") ? "bg-brand/10 text-brand" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {!isFeatureEnabled("barcode_scanner") ? <ScanBarcode size={20} /> : <Lock size={20} />}
                      </div>
                      <div>
                        <p className="font-bold text-sm text-foreground flex items-center gap-2">
                          Escanear com Câmera
                          {isFeatureEnabled("barcode_scanner") && <ProBadge />}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {!isFeatureEnabled("barcode_scanner") ? "Use a câmera para ler o código de barras" : "Exclusivo para assinantes PRO"}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="text-muted-foreground/30 group-hover:text-brand transition-colors" />
                  </button>

                  <button
                    onClick={() => setIsSearchOpen(true)}
                    className="w-full flex items-center justify-between p-4 border border-border rounded-xl hover:bg-secondary text-left group transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-brand/10 text-brand rounded-lg">
                        <Search size={20} />
                      </div>
                      <div>
                        <p className="font-bold text-sm text-foreground">Buscar Manualmente</p>
                        <p className="text-xs text-muted-foreground">Pesquise produtos no seu estoque</p>
                      </div>
                    </div>
                    <ChevronRight className="text-muted-foreground/30 group-hover:text-brand transition-colors" />
                  </button>

                  {notFound && (
                    <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive animate-pulse text-center">
                      Produto não encontrado no seu estoque.
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {/* ════════════════════════════════
              STEP 1: TIPO & PREÇO
              ════════════════════════════════ */}
          {step === 1 && (
            <motion.div key="type" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <div className="space-y-5 rounded-xl border border-border bg-card p-5">
                <div className="rounded-lg bg-secondary/50 p-3">
                  <p className="text-xs text-muted-foreground">Produto</p>
                  <p className="text-sm font-semibold text-foreground">{data.product_name}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>
                      Estoque: <span className="font-mono font-semibold text-foreground">{data.current_quantity} un.</span>
                    </span>
                    {data.selected_batch && (
                      <span className="flex items-center gap-1">
                        <Layers className="h-3 w-3" />
                        Lote: val.{" "}
                        {data.selected_batch.expiration_date
                          ? new Date(data.selected_batch.expiration_date).toLocaleDateString("pt-BR")
                          : "N/A"}{" "}
                        ({data.selected_batch.quantity} un.)
                      </span>
                    )}
                  </div>

                  {isExpired && (
                    <div className="mt-2 flex items-start gap-2 rounded-lg bg-destructive/10 p-2 text-destructive border border-destructive/20">
                      <AlertIcon className="h-4 w-4 shrink-0 mt-0.5" />
                      <p className="text-xs font-medium">⚠️ Atenção: Este lote já está vencido!</p>
                    </div>
                  )}

                  {isViolatingFifo && !isExpired && (
                    <div className="mt-2 flex items-start gap-2 rounded-lg bg-amber-100 p-2 text-amber-800 border border-amber-200">
                      <AlertIcon className="h-4 w-4 shrink-0 mt-0.5" />
                      <p className="text-xs">
                        <span className="font-bold">💡 Sugestão FIFO:</span> Existe um lote mais antigo vencendo em{" "}
                        <b>{new Date(oldestBatch!.expiration_date!).toLocaleDateString("pt-BR")}</b>. É recomendado dar saída nele primeiro.
                      </p>
                    </div>
                  )}

                  {data.batches.length > 0 && !data.selected_batch && (
                    <div className="mt-2 flex items-start gap-2 rounded-lg bg-brand-soft p-2 text-brand border border-brand/20">
                      <Layers className="h-4 w-4 shrink-0 mt-0.5" />
                      <p className="text-xs">
                        <span className="font-bold">🤖 FIFO Automático:</span> O sistema selecionará automaticamente os lotes mais antigos para baixa.
                      </p>
                    </div>
                  )}

                  {data.batches.length > 1 && (
                    <button type="button" onClick={() => setShowBatchModal(true)} className="mt-2 text-xs text-brand font-bold hover:underline">
                      Escolher lote específico (opcional)
                    </button>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground">Quantidade de Saída *</label>
                  <div className="mt-2 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setData((p) => ({ ...p, withdraw_qty: Math.max(1, p.withdraw_qty - 1) }))}
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-secondary text-lg font-bold"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={maxQty}
                      value={data.withdraw_qty}
                      onChange={(e) =>
                        setData((p) => ({
                          ...p,
                          withdraw_qty: Math.min(maxQty, Math.max(1, parseInt(e.target.value) || 1)),
                        }))
                      }
                      className="h-10 w-20 rounded-lg border border-input bg-background text-center font-mono text-lg font-bold outline-none focus:border-brand"
                    />
                    <button
                      type="button"
                      onClick={() => setData((p) => ({ ...p, withdraw_qty: Math.min(maxQty, p.withdraw_qty + 1) }))}
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-secondary text-lg font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground">Classificação da Transação</label>
                  <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {SALE_TYPES.slice(0, 3).map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setData((p) => ({ ...p, sale_type: t.value }))}
                        className={`flex flex-col items-center gap-1 rounded-xl border-2 p-3 text-center transition-colors ${
                          data.sale_type === t.value ? "border-brand bg-brand/5" : "border-border hover:border-brand/30"
                        }`}
                      >
                        <span className="text-lg">{t.emoji}</span>
                        <span className={`text-xs font-medium ${data.sale_type === t.value ? "text-brand" : "text-muted-foreground"}`}>
                          {t.label}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {SALE_TYPES.slice(3).map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setData((p) => ({ ...p, sale_type: t.value }))}
                        className={`flex items-center gap-2 rounded-xl border-2 p-3 text-left transition-colors ${
                          data.sale_type === t.value ? "border-brand bg-brand/5" : "border-border hover:border-brand/30"
                        }`}
                      >
                        <span className="text-lg">{t.emoji}</span>
                        <div>
                          <span className={`text-xs font-medium ${data.sale_type === t.value ? "text-brand" : "text-muted-foreground"}`}>
                            {t.label}
                          </span>
                          <p className="text-[10px] text-muted-foreground">{t.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {data.sale_type === "venda" && (
                  <div>
                    <label className="text-sm font-medium text-foreground">Preço de Venda Unitário (R$)</label>
                    <div className="relative mt-2">
                      <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={data.sale_price ?? ""}
                        onChange={(e) => setData((p) => ({ ...p, sale_price: parseFloat(e.target.value) || null }))}
                        placeholder="0.00"
                        className="w-full rounded-lg border border-input bg-background py-2.5 pl-10 pr-4 text-sm outline-none focus:border-brand"
                      />
                    </div>
                    {margin && (
                      <p className={`mt-1 text-xs font-medium ${Number(margin) >= 0 ? "text-brand" : "text-destructive"}`}>
                        Margem: {margin}% · Lucro: {formatMoney(profit)}
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium text-foreground">Descrição / Observação (Opcional)</label>
                  <input
                    type="text"
                    value={data.notes}
                    onChange={(e) => setData((p) => ({ ...p, notes: e.target.value }))}
                    placeholder={data.sale_type === "venda" ? "Ex: Venda para Maria" : "Ex: Produto quebrado no estoque"}
                    className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-brand"
                  />
                </div>
              </div>
            </motion.div>
          )}

          {/* ════════════════════════════════
              STEP 2: CONFIRMAR
              ════════════════════════════════ */}
          {step === 2 && (
            <motion.div key="confirm" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <div className="space-y-4 rounded-xl border border-border bg-card p-5 overflow-hidden">
                <AnimatePresence mode="wait">
                  {!isSuccess ? (
                    <motion.div key="summary" exit={{ opacity: 0, scale: 0.9 }}>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10">
                          <Package className="h-5 w-5 text-brand" />
                        </div>
                        <p className="text-sm font-semibold text-foreground">Confirmar Baixa FIFO</p>
                      </div>
                      <div className="space-y-2 rounded-lg bg-secondary/50 p-4">
                        <Row label="Produto" value={data.product_name} />
                        <Row label="Código" value={data.barcode} />
                        <Row label="Quantidade Saída" value={`${data.withdraw_qty} un.`} />
                        <Row label="Estoque Restante" value={`${data.current_quantity - data.withdraw_qty} un.`} />
                        <Row label="Tipo" value={`${currentSaleType.emoji} ${currentSaleType.label}`} />
                        {data.batches.length > 0 && (
                          <Row label="Método" value={data.selected_batch ? "Lote específico" : "FIFO Automático"} />
                        )}
                        {data.notes && <Row label="Descrição" value={data.notes} />}
                        <Row label="Custo Unitário" value={formatMoney(data.cost_price)} />
                        {data.sale_type === "venda" && data.sale_price && (
                          <>
                            <Row label="Preço Venda Unitário" value={formatMoney(data.sale_price)} />
                            <Row label="Receita Total" value={formatMoney(data.sale_price * data.withdraw_qty)} />
                            <Row label="Lucro Total" value={formatMoney(profit)} />
                          </>
                        )}
                        {!currentSaleType.hasRevenue && <Row label="Receita" value="R$ 0,00" />}
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="success"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex flex-col items-center justify-center py-10 space-y-4"
                    >
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 200, damping: 10, delay: 0.1 }}
                        className="flex h-24 w-24 items-center justify-center rounded-full bg-success text-white shadow-lg"
                      >
                        <Check size={48} strokeWidth={3} />
                      </motion.div>
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="text-center space-y-1"
                      >
                        <h3 className="text-xl font-bold text-foreground">Sucesso!</h3>
                        <p className="text-sm text-muted-foreground">Baixa registrada no estoque.</p>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ══════════════════════════════════════════
            NAVIGATION BUTTONS
            ══════════════════════════════════════════ */}
        {(step > 0 || (!showScanner && data.barcode && !notFound)) && !isSuccess && (
          <div className="mt-6 flex gap-3">
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                disabled={loading}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card py-3 text-sm font-medium text-foreground disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" /> Voltar
              </button>
            )}
            {step < 2 ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={step === 0 && !data.product_id}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                Próximo <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={loading}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50 active:scale-95 transition-all"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Confirmar Baixa
              </button>
            )}
          </div>
        )}
      </main>

      {/* ══════════════════════════════════════════
          MODAIS
          ══════════════════════════════════════════ */}
      <AnimatePresence>
        {showBatchModal && data.batches.length > 0 && (
          <BatchSelectModal
            productName={data.product_name}
            batches={data.batches}
            onSelect={handleBatchSelect}
            onClose={() => { setShowBatchModal(false); setStep(1); }}
          />
        )}
      </AnimatePresence>

      <InventorySearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelect={(item: any) => {
          setIsSearchOpen(false);
          const barcode = item.product?.bar_code || item.barcode;
          if (barcode) handleBarcodeScan(barcode);
        }}
      />

      <UpgradeModal
        isOpen={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        feature="Scanner de Código de Barras"
        description="Cansada de digitar? O Scanner é exclusivo PRO."
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm border-b border-border/50 pb-1 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}