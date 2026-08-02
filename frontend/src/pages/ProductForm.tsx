// pages/ProductForm.tsx — VERSÃO REFATORADA COM TEMA DINÂMICO
import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, ScanBarcode, Save, Loader2, Search, Calendar,
  Package, ImageIcon, ChevronDown, ChevronUp, Info, Layers,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Product, productService } from "../lib/productService";
import BarcodeScanner from "../components/BarcodeScanner";
import { useToast } from '../components/ui/use-toast';// ✅ Importar useToast original para evitar dependência circular
import { inventoryApi } from "../lib/api";
import { useStockEntry } from "../hooks/useStockEntry";
import { api } from "../services/api";

const CATEGORIES = [
  "Perfumaria", "Corpo", "Rosto", "Cabelos",
  "Maquiagem", "Infantil", "Casa", "Outro",
];

const emptyProduct: Product = {
  name: "",
  bar_code: "",
  natura_sku: "",
  category: "Perfumaria",
  price: 0,
  sale_price: 0,
  cost_price: 0,
  quantity: 0,
  min_quantity: 5,
  description: "",
  batch_code: "",
  expiration_date: "",
  image_url: "",
};

export default function ProductForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isEditing = Boolean(id);

  const { saveEntry } = useStockEntry();

  const [form, setForm] = useState<Product>(emptyProduct);
  const [showScanner, setShowScanner] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);

  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [inventoryItem, setInventoryItem] = useState<any>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (id) {
      inventoryApi.list().then((items) => {
        const item = items.find(
          (i) => String(i.product?.id) === id || String(i.id) === id
        );
        if (item) {
          setInventoryItem(item);
          setForm((prev) => ({
            ...prev,
            name: item.product?.name || item.product_name || "",
            bar_code: item.product?.bar_code || item.barcode || "",
            natura_sku: item.product?.natura_sku || item.sku || "",
            category: item.product?.category || item.category || "Outro",
            image_url: item.product?.image_url || item.image_url || "",
            price: item.sale_price || item.product?.official_price || 0,
            cost_price: item.cost_price || 0,
            batch_code: item.batches?.[0]?.batch_code || "",
            expiration_date: item.batches?.[0]?.expiration_date || "",
          }));
        } else {
          productService.get(Number(id)).then(setForm);
        }
      });
    }
  }, [id]);

  const handleChange = (field: keyof Product, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleNameChange = async (val: string) => {
    handleChange("name", val);
    if (val.length > 2) {
      try {
        const { data } = await api.get(`/products/lookup/?q=${val}`);
        if (data.candidates && data.candidates.length > 0) {
          setSuggestions(data.candidates);
          setShowSuggestions(true);
        } else {
          setShowSuggestions(false);
        }
      } catch {
        setShowSuggestions(false);
      }
    } else {
      setShowSuggestions(false);
    }
  };

  const selectSuggestion = (suggestion: any) => {
    setForm((prev) => ({
      ...prev,
      name: suggestion.name,
      price: suggestion.official_price || prev.price,
      natura_sku: suggestion.natura_sku,
      description: suggestion.description,
      image_url: suggestion.image_url,
    }));
    setShowSuggestions(false);
    toast({
      title: "Produto Vinculado!",
      description: `SKU ${suggestion.natura_sku} carregado.`,
    });
  };

  const handleLookup = async (ean: string) => {
    if (!ean) return;
    setSearching(true);
    try {
      const result = await productService.lookupByEan(ean);
      if (result.found) {
        const data = result.data as any;
        const { local, remote, source, candidates, google_name } = {
          ...data,
          source: result.source,
        };
        if (source === "local" && local) {
          if (!isEditing && local.id) navigate(`/products/${local.id}/edit`);
        } else if (source === "suggestion" && candidates) {
          setSuggestions(candidates);
          setShowSuggestions(true);
          setForm((prev) => ({
            ...prev,
            name: google_name || prev.name,
            bar_code: ean,
          }));
          toast({
            title: "Nome Encontrado!",
            description: `Possível match: ${google_name}`,
          });
        } else if (source?.includes("remote")) {
          setForm((prev) => ({
            ...prev,
            name: remote?.name || data?.name || prev.name,
            price: remote?.sale_price || data?.sale_price || prev.price,
            natura_sku: remote?.natura_sku || data?.natura_sku || prev.natura_sku,
            description: remote?.description || data?.description || prev.description,
            image_url: remote?.image_url || data?.image_url || prev.image_url,
            bar_code: ean,
          }));
          toast({ title: "Encontrado!", description: "Dados carregados." });
        }
      } else {
        toast({
          title: "Novo Código",
          description: "Preencha os dados manualmente.",
        });
      }
    } catch {
      toast({ title: "Erro", description: "Falha na busca." });
    } finally {
      setSearching(false);
    }
  };

  const handleScan = (code: string) => {
    setShowScanner(false);
    handleChange("bar_code", code);
    handleLookup(code);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isEditing && (!form.bar_code || form.bar_code.trim() === "")) {
      toast({
        title: "Código Obrigatório",
        description: "O código de barras não pode ficar vazio.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);

    try {
      if (isEditing) {
        if (inventoryItem) {
          await inventoryApi.update(inventoryItem.id, {
            cost_price: form.cost_price,
            sale_price: form.price,
          });

          const prodId = inventoryItem.product?.id || id;
          await api
            .patch(`/products/${prodId}/`, {
              name: form.name,
              bar_code: form.bar_code,
              natura_sku: form.natura_sku,
              category: form.category,
              image_url: form.image_url,
            })
            .catch((err) => {
              console.warn(
                "Aviso: O produto pode ser protegido ou a rota falhou.",
                err
              );
            });
        } else {
          await productService.update(Number(id), form);
        }
        toast({
          title: "Sucesso!",
          description: "Produto atualizado com sucesso.",
        });
      } else {
        await saveEntry({
          bar_code: form.bar_code,
          name: form.name,
          category: form.category,
          natura_sku: form.natura_sku,
          quantity: form.quantity,
          cost_price: form.cost_price,
          sale_price: form.price,
          batch_code: form.batch_code,
          expiration_date: form.expiration_date,
        });
      }
      navigate("/products");
    } catch (err: any) {
      toast({
        title: "Erro",
        description: "Falha ao salvar as alterações.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* ══════════════════════════════════════════
          HEADER
          ══════════════════════════════════════════ */}
      <header className="sticky top-0 z-10 border-b border-border bg-card px-6 py-4 flex items-center gap-3">
        <button type="button" onClick={() => navigate("/products")}>
          <ArrowLeft className="text-muted-foreground hover:text-foreground" />
        </button>
        <h1 className="font-display text-lg font-bold text-foreground">
          {isEditing ? "Editar Produto" : "Novo Produto"}
        </h1>
      </header>

      <main className="max-w-2xl mx-auto p-6 space-y-6">
        {/* ══════════════════════════════════════════
            ACORDEÃO DE DETALHES (SÓ EDIÇÃO)
            ══════════════════════════════════════════ */}
        {isEditing && inventoryItem && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <button
              type="button"
              onClick={() => setShowDetails(!showDetails)}
              className="w-full flex items-center justify-between p-4 bg-secondary/30 hover:bg-secondary/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-brand" />
                <span className="text-sm font-bold text-foreground">
                  Detalhes Atuais do Estoque
                </span>
              </div>
              {showDetails ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            <AnimatePresence>
              {showDetails && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden border-t border-border"
                >
                  <div className="p-4 space-y-4 bg-card text-sm">
                    <div className="flex justify-between items-center bg-brand/5 p-3 rounded-lg border border-brand/10">
                      <span className="font-semibold text-foreground">
                        Quantidade Total:
                      </span>
                      <span className="font-mono font-bold text-brand text-lg">
                        {inventoryItem.total_quantity ??
                          inventoryItem.quantity ??
                          0}{" "}
                        un.
                      </span>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
                        <Layers className="h-3.5 w-3.5" /> Lotes Registrados
                      </p>
                      {inventoryItem.batches &&
                      inventoryItem.batches.length > 0 ? (
                        <div className="space-y-2">
                          {inventoryItem.batches.map(
                            (b: any, idx: number) => (
                              <div
                                key={idx}
                                className="flex justify-between items-center bg-secondary/30 p-2.5 rounded-lg border border-border/50"
                              >
                                <div>
                                  <p className="font-medium text-foreground text-xs">
                                    Lote: {b.batch_code || "Sem Lote"}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground">
                                    Vence:{" "}
                                    {b.expiration_date
                                      ? new Date(
                                          b.expiration_date
                                        ).toLocaleDateString("pt-BR")
                                      : "N/A"}
                                  </p>
                                </div>
                                <span className="font-mono text-xs font-semibold">
                                  {b.quantity} un.
                                </span>
                              </div>
                            )
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">
                          Nenhum lote detalhado encontrado.
                        </p>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground text-center pt-2">
                      A quantidade deve ser alterada pelo botão "Ajustar Saldo"
                      (Balança) na lista de estoque.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* ══════════════════════════════════════════
            FORMULÁRIO
            ══════════════════════════════════════════ */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ── BLOCO 1: IDENTIFICAÇÃO ── */}
          <div className="bg-card p-5 rounded-xl border border-border space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">
                Código de Barras (EAN) {isEditing ? "" : "*"}
              </label>
              <div className="flex gap-2 relative mt-1.5">
                <input
                  required={!isEditing}
                  value={form.bar_code}
                  onChange={(e) => handleChange("bar_code", e.target.value)}
                  onBlur={() => handleLookup(form.bar_code)}
                  placeholder="Escaneie ou digite..."
                  className="w-full border border-input rounded-lg px-3 py-2.5 outline-none focus:border-brand bg-background font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowScanner(true)}
                  className="bg-brand text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:opacity-90 transition-opacity"
                >
                  <ScanBarcode size={18} />{" "}
                  <span className="hidden sm:block">Scan</span>
                </button>
                {searching && (
                  <Loader2
                    className="absolute right-24 top-3 animate-spin text-muted-foreground"
                    size={18}
                  />
                )}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">
                SKU Natura
              </label>
              <input
                type="text"
                value={form.natura_sku || ""}
                onChange={(e) => handleChange("natura_sku", e.target.value)}
                placeholder="Código do produto no catálogo"
                className="w-full border border-input rounded-lg px-3 py-2.5 mt-1.5 bg-background outline-none focus:border-brand"
              />
            </div>
          </div>

          {/* ── BLOCO 2: DETALHES COM IMAGEM ── */}
          <div className="bg-card p-5 rounded-xl border border-border space-y-4">
            <div className="flex justify-between items-start">
              <h2 className="font-bold text-sm flex gap-2 items-center text-foreground">
                <Package size={16} className="text-brand" /> Detalhes do Produto
              </h2>
              <div className="w-16 h-16 bg-secondary/50 rounded-lg overflow-hidden border border-border flex items-center justify-center">
                {form.image_url ? (
                  <img
                    src={form.image_url}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <ImageIcon className="text-muted-foreground/50" size={24} />
                )}
              </div>
            </div>

            <div className="relative -mt-12 mr-20">
              <label className="text-sm font-medium text-foreground">
                Nome *
              </label>
              <input
                required
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                className="w-full border border-input rounded-lg px-3 py-2.5 mt-1.5 bg-background outline-none focus:border-brand"
                placeholder="Digite para buscar..."
              />

              {showSuggestions && (
                <div className="absolute z-20 w-full bg-card border border-border rounded-lg shadow-xl mt-1 max-h-60 overflow-y-auto">
                  {suggestions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => selectSuggestion(s)}
                      className="w-full text-left px-4 py-3 hover:bg-secondary border-b border-border/50 last:border-0 transition-colors group"
                    >
                      <div className="flex gap-3">
                        <div className="w-8 h-8 bg-secondary/50 rounded shrink-0 overflow-hidden">
                          {s.image_url && (
                            <img
                              src={s.image_url}
                              className="w-full h-full object-cover"
                            />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-sm text-foreground group-hover:text-brand">
                            {s.name}
                          </p>
                          <span className="text-xs text-muted-foreground">
                            Ref: R$ {s.official_price}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="text-sm font-medium text-foreground">
                  Preço Venda (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={form.price || ""}
                  onChange={(e) =>
                    handleChange("price", parseFloat(e.target.value) || 0)
                  }
                  className="w-full border border-input rounded-lg px-3 py-2.5 mt-1.5 bg-background outline-none focus:border-brand"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">
                  Preço Custo (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={form.cost_price || ""}
                  onChange={(e) =>
                    handleChange("cost_price", parseFloat(e.target.value) || 0)
                  }
                  className="w-full border border-input rounded-lg px-3 py-2.5 mt-1.5 bg-background outline-none focus:border-brand"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground">
                  Categoria
                </label>
                <select
                  value={form.category}
                  onChange={(e) => handleChange("category", e.target.value)}
                  className="w-full border border-input rounded-lg px-3 py-2.5 mt-1.5 bg-background outline-none focus:border-brand"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">
                  URL Imagem
                </label>
                <input
                  value={form.image_url || ""}
                  onChange={(e) => handleChange("image_url", e.target.value)}
                  className="w-full border border-input rounded-lg px-3 py-2.5 mt-1.5 bg-background outline-none focus:border-brand text-xs"
                  placeholder="https://..."
                />
              </div>
            </div>
          </div>

          {/* ── BLOCO 3: DADOS DE INVENTÁRIO ── */}
          <div className="bg-card p-5 rounded-xl border border-border space-y-4 border-l-4 border-l-brand">
            <h2 className="font-bold text-sm flex gap-2 text-foreground">
              <Calendar size={16} className="text-brand" /> Dados de Inventário
            </h2>
            <div className="grid grid-cols-2 gap-4">
              {!isEditing && (
                <div className="col-span-2 sm:col-span-1">
                  <label className="text-sm font-bold text-brand">
                    Quantidade Inicial *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={form.quantity}
                    onChange={(e) =>
                      handleChange("quantity", parseInt(e.target.value))
                    }
                    className="w-full border-2 border-brand/20 rounded-lg px-3 py-2 mt-1.5 text-lg font-bold text-center focus:border-brand outline-none bg-brand/5"
                  />
                </div>
              )}

              <div className={isEditing ? "col-span-2 sm:col-span-1" : ""}>
                <label className="text-sm font-medium text-foreground">
                  Código do Lote
                </label>
                <input
                  value={form.batch_code || ""}
                  onChange={(e) => handleChange("batch_code", e.target.value)}
                  className="w-full border border-input rounded-lg px-3 py-2 mt-1.5 bg-background outline-none focus:border-brand"
                  placeholder="Ex: L2024"
                />
              </div>

              <div className="col-span-2">
                <label className="text-sm font-medium text-foreground">
                  Data de Validade
                </label>
                <input
                  type="date"
                  value={form.expiration_date || ""}
                  onChange={(e) =>
                    handleChange("expiration_date", e.target.value)
                  }
                  className="w-full border border-input rounded-lg px-3 py-2 mt-1.5 bg-background outline-none focus:border-brand"
                />
              </div>
            </div>
          </div>

          {/* ── BOTÃO SUBMIT ── */}
          <button
            disabled={loading}
            type="submit"
            className="w-full bg-brand text-white font-bold py-4 rounded-xl shadow-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 className="animate-spin h-5 w-5" />
            ) : (
              <Save className="h-5 w-5" />
            )}
            {isEditing ? "Salvar Alterações" : "Cadastrar Produto"}
          </button>
        </form>
      </main>

      {/* ── SCANNER MODAL ── */}
      <AnimatePresence>
        {showScanner && (
          <BarcodeScanner
            onScan={handleScan}
            onClose={() => setShowScanner(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}