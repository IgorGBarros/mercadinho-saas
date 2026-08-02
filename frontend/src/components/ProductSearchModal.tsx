// components/ProductSearchModal.tsx — VERSÃO REFATORADA COM PALETA DA MARCA
import { useState, useEffect } from "react";
import {
  Search, X, Loader2, ChevronRight, Package, ImageOff,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { formatMoney } from "../lib/api";
import { productService } from "../lib/productService";

interface Product {
  id?: number;
  name: string;
  natura_sku?: string;
  bar_code?: string;
  category?: string;
  official_price?: number;
  image_url?: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (product: Product) => void;
}

export default function ProductSearchModal({ isOpen, onClose, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || loaded) return;
    setLoading(true);
    productService
      .list()
      .then((data) => {
        setAllProducts(data);
        setLoaded(true);
      })
      .catch((err) => {
        console.error("Erro ao carregar catálogo local:", err);
        setError("Falha ao carregar catálogo local.");
      })
      .finally(() => setLoading(false));
  }, [isOpen, loaded]);

  const searchProducts = async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await productService.lookupByName(q);
      let list: Product[] = [];

      if (response.candidates && response.candidates.length > 0) {
        list = response.candidates;
      } else if (response.found && response.source === "local" && response.data) {
        const data = response.data as Product;
        list = [data];
      }

      if (!list.length && allProducts.length) {
        const qLower = q.toLowerCase();
        list = allProducts.filter(
          (p) =>
            p.name.toLowerCase().includes(qLower) ||
            (p.natura_sku && p.natura_sku.toLowerCase().includes(qLower)) ||
            (p.bar_code && p.bar_code.includes(qLower))
        );
      }

      setResults(list.slice(0, 20));
    } catch (err) {
      console.error("Erro na busca remota:", err);
      setError("Falha ao buscar produtos.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.length >= 2 && isOpen) searchProducts(query);
      else setResults([]);
    }, 500);
    return () => clearTimeout(timer);
  }, [query, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setResults([]);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0.95 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-card w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] border border-brand/15"
        >
          {/* Search Header */}
          <div className="p-4 border-b border-brand-peach/30 flex items-center gap-3">
            <Search className="text-brand-rose" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Digite nome ou SKU (ex: 38854)..."
              className="flex-1 outline-none text-base bg-transparent text-foreground placeholder:text-brand-rose/50"
            />
            <button onClick={onClose}>
              <X className="text-brand-rose/50 hover:text-brand transition-colors" />
            </button>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {loading ? (
              <div className="py-10 flex justify-center text-brand">
                <Loader2 className="animate-spin" />
              </div>
            ) : error ? (
              <div className="py-10 text-center text-destructive text-sm">{error}</div>
            ) : results.length === 0 ? (
              <div className="py-10 text-center text-brand-rose/60">
                <Package className="w-10 h-10 mx-auto mb-2 text-brand-lavender" />
                <p>Nenhum produto encontrado.</p>
                <p className="text-xs">Digite pelo menos 2 caracteres.</p>
              </div>
            ) : (
              results.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    onSelect(item);
                    onClose();
                  }}
                  className="w-full flex items-center gap-3 p-3 hover:bg-brand-soft rounded-xl transition-colors text-left border border-transparent hover:border-brand-peach/50"
                >
                  <div className="w-12 h-12 bg-brand-soft rounded-lg shrink-0 overflow-hidden flex items-center justify-center border border-brand-peach/30">
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ImageOff size={20} className="text-brand-lavender" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-foreground text-sm truncate">{item.name}</p>
                    <div className="flex gap-2 text-xs text-brand-rose/70 mt-1">
                      {item.natura_sku && <span>SKU: {item.natura_sku}</span>}
                      {item.official_price && (
                        <span className="text-brand font-medium">
                          {formatMoney(item.official_price)}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-brand-rose/40" />
                </button>
              ))
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}