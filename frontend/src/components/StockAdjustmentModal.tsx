// components/StockAdjustmentModal.tsx — VERSÃO REFATORADA COM PALETA DA MARCA
import { useState, useEffect } from "react";
import { X, Loader2, Scale, Minus, Plus, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { movementsApi, InventoryItem } from "../lib/api";
import { useToast } from '../components/ui/use-toast'; // ✅ Importar useToast original para evitar dependência circular

interface StockAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: InventoryItem | null;
  onAdjusted: () => void;
}

export default function StockAdjustmentModal({
  isOpen,
  onClose,
  item,
  onAdjusted,
}: StockAdjustmentModalProps) {
  const [realQty, setRealQty] = useState<number | "">(0);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const systemQty = item?.total_quantity ?? item?.quantity ?? 0;
  const productName =
    item?.product?.name || item?.product_name || "Produto Desconhecido";
  const barcode = item?.product?.bar_code || item?.barcode || "";
  const productId = item?.product?.id || item?.id;

  useEffect(() => {
    if (isOpen && item) {
      setRealQty(systemQty);
      setNotes("");
    }
  }, [isOpen, item, systemQty]);

  const diff = typeof realQty === "number" ? realQty - systemQty : 0;

  const handleSave = async () => {
    if (!item || typeof realQty !== "number") return;

    if (realQty === systemQty) {
      toast({
        title: "Sem alteração",
        description: "A quantidade real é igual ao sistema.",
      });
      return;
    }

    setLoading(true);
    try {
      const adjustmentQty = Math.abs(diff);
      const isIncrease = diff > 0;

      const transactionData = {
        product: productId,
        product_id: productId,
        quantity: adjustmentQty,
        transaction_type: isIncrease ? "ENTRADA" : "AJUSTE",
        unit_price: 0,
        unit_cost: item.cost_price || 0,
        description:
          notes.trim() ||
          (isIncrease
            ? `Ajuste manual: +${adjustmentQty} unidades`
            : `Ajuste manual: -${adjustmentQty} unidades (Correção de inventário)`),
        product_name: productName,
        barcode: barcode,
        movement_type: isIncrease ? "entrada" : "saida",
        sale_type: isIncrease ? null : "ajuste",
        notes: notes.trim(),
      };

      await movementsApi.create(transactionData);

      toast({
        title: "Estoque ajustado com sucesso!",
        description: `${productName}: ${systemQty} → ${realQty} unidades`,
      });

      onAdjusted();
      onClose();
    } catch (err: any) {
      let errorMessage = "Erro desconhecido";
      if (err.response?.data?.error) {
        errorMessage = err.response.data.error;
      } else if (err.message) {
        errorMessage = err.message;
      }
      toast({
        title: "Erro ao ajustar estoque",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !item) return null;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/60 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 20 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md rounded-2xl bg-card shadow-2xl overflow-hidden border border-brand/15"
        >
          {/* Header */}
          <div className="p-4 border-b border-brand-peach/30 flex items-center justify-between bg-card">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-brand/10 rounded-lg">
                <Scale className="h-5 w-5 text-brand" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-foreground">
                  Ajustar Saldo
                </h2>
                <p className="text-xs text-brand-rose/70">
                  Correção manual de inventário
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-brand-soft rounded-full transition-colors"
            >
              <X className="text-brand-rose/50" size={18} />
            </button>
          </div>

          {/* Content */}
          <div className="p-5 space-y-5">
            {/* Product info */}
            <div className="rounded-lg bg-brand-soft p-3 border border-brand-peach/30">
              <p className="text-sm font-semibold text-foreground line-clamp-2 leading-tight">
                {productName}
              </p>
              <p className="text-xs text-brand-rose/60 mt-1 font-mono">
                {barcode}
              </p>
            </div>

            {/* System says */}
            <div className="text-center bg-brand-soft/50 py-4 rounded-xl border border-dashed border-brand-peach">
              <p className="text-xs text-brand-rose/60 uppercase font-bold tracking-wider mb-1">
                Saldo Atual (Sistema)
              </p>
              <p className="text-4xl font-bold text-foreground font-mono">
                {systemQty}{" "}
                <span className="text-base font-normal text-brand-rose/50">
                  un.
                </span>
              </p>
            </div>

            {/* Real quantity input */}
            <div>
              <label className="text-sm font-medium text-foreground block text-center mb-3">
                Qual a quantidade real física?
              </label>
              <div className="flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() =>
                    setRealQty((v) =>
                      Math.max(0, (typeof v === "number" ? v : 0) - 1)
                    )
                  }
                  className="flex h-14 w-14 items-center justify-center rounded-xl border-2 border-brand-peach bg-brand-soft text-xl font-bold hover:border-brand/50 hover:text-brand transition-colors"
                >
                  <Minus className="h-6 w-6" />
                </button>

                <input
                  type="number"
                  min={0}
                  value={realQty}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRealQty(v === "" ? "" : Math.max(0, parseInt(v) || 0));
                  }}
                  className="h-14 w-28 rounded-xl border-2 border-brand bg-brand/5 text-center font-mono text-3xl font-bold text-brand outline-none focus:ring-2 focus:ring-brand/20"
                />

                <button
                  type="button"
                  onClick={() =>
                    setRealQty((v) => (typeof v === "number" ? v : 0) + 1)
                  }
                  className="flex h-14 w-14 items-center justify-center rounded-xl border-2 border-brand-peach bg-brand-soft text-xl font-bold hover:border-brand/50 hover:text-brand transition-colors"
                >
                  <Plus className="h-6 w-6" />
                </button>
              </div>
            </div>

            {/* Difference indicator */}
            <div className="h-16 flex items-center justify-center">
              {typeof realQty === "number" && realQty !== systemQty && (
                <div
                  className={`w-full rounded-xl p-3 text-center border ${
                    diff < 0
                      ? "bg-destructive/10 border-destructive/20"
                      : "bg-brand/10 border-brand/20"
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    {diff < 0 && (
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                    )}
                    <span
                      className={`text-sm font-bold ${
                        diff < 0 ? "text-destructive" : "text-brand"
                      }`}
                    >
                      Diferença: {diff > 0 ? "+" : ""}
                      {diff} unidade{Math.abs(diff) !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <p
                    className={`text-[10px] mt-0.5 font-medium ${
                      diff < 0 ? "text-destructive/70" : "text-brand/70"
                    }`}
                  >
                    {diff < 0
                      ? "🤖 FIFO será aplicado automaticamente nos lotes mais antigos"
                      : "Será registrada uma ENTRADA no estoque"}
                  </p>
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs font-semibold uppercase text-brand-rose/60">
                Observação do Ajuste (opcional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: Contagem de inventário mensal"
                className="mt-1.5 w-full rounded-lg border border-brand/15 bg-brand-soft/50 px-3 py-2.5 text-sm outline-none focus:border-brand/30 focus:ring-1 focus:ring-brand/20 placeholder:text-brand-rose/40"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-brand-peach/30 flex gap-3 bg-brand-soft/30">
            <button
              onClick={onClose}
              className="flex-1 rounded-xl border border-brand-peach/50 bg-card py-3 text-sm font-medium text-foreground hover:bg-brand-soft transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={
                loading ||
                typeof realQty !== "number" ||
                realQty === systemQty
              }
              className="flex-1 rounded-xl bg-brand py-3 text-sm font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Confirmar Ajuste"
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}