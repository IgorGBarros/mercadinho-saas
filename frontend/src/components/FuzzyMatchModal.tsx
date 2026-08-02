import { motion } from "framer-motion";
import { HelpCircle, Check, X } from "lucide-react";
import { GlobalProduct, formatMoney } from "../lib/api";

interface FuzzyMatchModalProps {
  barcode: string;
  suggestions: GlobalProduct[];
  onConfirm: (product: GlobalProduct) => void;
  onSkip: () => void;
}

export default function FuzzyMatchModal({ barcode, suggestions, onConfirm, onSkip }: FuzzyMatchModalProps) {
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
          <HelpCircle className="h-5 w-5 text-accent-foreground" />
          <div>
            <p className="text-sm font-semibold text-foreground">Produto similar encontrado</p>
            <p className="text-xs text-muted-foreground">Código: <span className="font-mono">{barcode}</span></p>
          </div>
        </div>

        <div className="p-4 space-y-2 max-h-72 overflow-y-auto">
          {suggestions.map((product) => (
            <button
              key={product.id}
              onClick={() => onConfirm(product)}
              className="flex w-full items-center gap-3 rounded-xl border border-border bg-background p-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
            >
              {product.image_url ? (
                <img src={product.image_url} alt={product.name} className="h-12 w-12 rounded-lg object-cover border border-border" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-muted-foreground text-xs">Sem foto</div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{product.name}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  {product.sku && <span>SKU: {product.sku}</span>}
                  {product.official_price && <span>{formatMoney(product.official_price)}</span>}
                </div>
              </div>
              <Check className="h-4 w-4 text-primary shrink-0" />
            </button>
          ))}
        </div>

        <div className="border-t border-border px-4 py-3">
          <button
            onClick={onSkip}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
            Nenhum — cadastrar manualmente
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
