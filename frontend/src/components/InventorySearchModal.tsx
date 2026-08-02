import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, Package } from "lucide-react";
import { inventoryApi } from "../lib/api";

interface InventorySearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (item: any) => void;
}

export default function InventorySearchModal({ isOpen, onClose, onSelect }: InventorySearchModalProps) {
  const [query, setQuery] = useState("");
  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      inventoryApi.list().then((data) => {
        setInventory(data);
        setLoading(false);
      });
    }
  }, [isOpen]);

  const filtered = inventory.filter((item) => {
    const qty = item.total_quantity ?? item.quantity ?? 0;
    
    // 🚀 REGRA 1: Só mostra na lista os produtos que realmente têm saldo no estoque
    if (qty <= 0) return false;

    // 🚀 REGRA 2: Se não digitou nada, mostra todos os disponíveis
    if (!query) return true;

    // 🚀 REGRA 3: Filtra por nome, código de barras ou SKU
    const q = query.toLowerCase();
    const name = (item.product?.name || item.product_name || "").toLowerCase();
    const barcode = item.product?.bar_code || item.barcode || "";
    const sku = (item.product?.natura_sku || item.sku || "").toLowerCase();

    return name.includes(q) || barcode.includes(q) || sku.includes(q);
  });

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4">
        <motion.div
          initial={{ opacity: 0, y: "100%" }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className="flex h-full w-full flex-col bg-card sm:h-[600px] sm:max-w-lg sm:rounded-2xl sm:border sm:border-border sm:shadow-2xl"
        >
          <div className="flex items-center gap-3 border-b border-border p-4">
            <div className="flex flex-1 items-center gap-2 rounded-xl bg-secondary px-3 py-2 focus-within:ring-2 focus-within:ring-primary/20">
              <Search className="h-5 w-5 text-muted-foreground" />
              <input
                autoFocus
                type="text"
                placeholder="Buscar por nome, SKU ou código..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 bg-transparent text-sm outline-none"
              />
              {query && (
                <button onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <button onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary transition-colors">
              Cancelar
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="p-8 text-center text-sm text-primary animate-pulse font-medium">Carregando seu estoque...</div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                <Package className="mb-2 h-8 w-8 opacity-20" />
                <p className="text-sm font-medium">Nenhum produto encontrado.</p>
                <p className="text-xs mt-1">Verifique se o item possui quantidade maior que zero.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {filtered.map((item) => {
                  const qty = item.total_quantity ?? item.quantity ?? 0;
                  const name = item.product?.name || item.product_name || "Sem Nome";
                  const barcode = item.product?.bar_code || item.barcode;
                  const sku = item.product?.natura_sku || item.sku;
                  const image = item.product?.image_url || item.image_url;

                  return (
                    <button
                      key={item.id}
                      onClick={() => onSelect(item)}
                      className="flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors hover:bg-secondary"
                    >
                      {image ? (
                        <img src={image} className="h-10 w-10 rounded-lg object-cover border" />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                          <Package className="h-5 w-5 text-primary" />
                        </div>
                      )}
                      <div className="flex-1 overflow-hidden">
                        <p className="truncate text-sm font-semibold text-foreground">{name}</p>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                          <span className="font-mono">{barcode}</span>
                          {sku && <span>• SKU: {sku}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-bold text-sm text-primary">{qty} un.</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}