import { motion } from "framer-motion";
import { Layers, Calendar, Check } from "lucide-react";
import { InventoryBatch, formatMoney } from "../lib/api";

interface BatchSelectModalProps {
  productName: string;
  batches: InventoryBatch[];
  onSelect: (batch: InventoryBatch) => void;
  onClose: () => void;
}

export default function BatchSelectModal({ productName, batches, onSelect, onClose }: BatchSelectModalProps) {
  // Sort FIFO: oldest first
  const sorted = [...batches].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const formatDate = (d: string | null) => {
    if (!d) return "Sem validade";
    return new Date(d).toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ scale: 0.95, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 10 }}
        className="w-full max-w-md rounded-2xl bg-card shadow-2xl overflow-hidden"
      >
        <div className="flex items-center gap-2 bg-accent/10 px-5 py-4">
          <Layers className="h-5 w-5 text-accent-foreground" />
          <div>
            <p className="text-sm font-semibold text-foreground">Selecionar Lote</p>
            <p className="text-xs text-muted-foreground">{productName} — De qual validade?</p>
          </div>
        </div>

        <div className="p-4 space-y-2 max-h-72 overflow-y-auto">
          {sorted.map((batch, i) => (
            <button
              key={batch.id}
              onClick={() => onSelect(batch)}
              className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 ${
                i === 0 ? "border-primary bg-primary/5" : "border-border bg-background"
              }`}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary text-xs font-bold">
                {batch.quantity}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">{formatDate(batch.expiry_date)}</span>
                  {i === 0 && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">FIFO</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Custo: {formatMoney(batch.cost_price)} · {batch.quantity} un.
                </p>
              </div>
              <Check className="h-4 w-4 text-primary shrink-0" />
            </button>
          ))}
        </div>

        <div className="border-t border-border px-4 py-3">
          <button
            onClick={onClose}
            className="flex w-full items-center justify-center rounded-xl border border-border py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            Cancelar
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
