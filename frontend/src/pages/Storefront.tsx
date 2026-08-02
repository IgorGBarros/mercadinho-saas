// pages/Storefront.tsx — VERSÃO COM CRM INVISIBLE + LGPD
import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useParams } from "react-router-dom";
import { Package, Search, ShoppingBag, Plus, Minus, Trash2, Send, Sparkles, CreditCard, QrCode, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { storefrontApi, StorefrontItem, formatMoney } from "../lib/api";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "../components/ui/sheet";
import { Button } from "../components/ui/button";
import { Separator } from "../components/ui/separator";
import { toast } from '../components/ui/use-toast';

// 🔹 CRM: Importar utilitários de captura de lead e persistência de carrinho
import { upsertLead, type LeadInput } from "../lib/leads";
import { getOrCreateSessionId, persistCart, type CartItemInput } from "../lib/cart";
import CheckoutModal from "../components/CheckoutModal"; // 🔹 CRM: Modal de captura suave

type PaymentMethod = "pix" | "cartao";

interface BagItem extends StorefrontItem {
  qty: number;
}

// 🔹 CRM: Chaves de localStorage por tenant para isolamento de dados
const getCartStorageKey = (storeSlug: string) => `storefront_cart_${storeSlug}`;
const getPaymentStorageKey = (storeSlug: string) => `storefront_payment_${storeSlug}`;
const getLeadCapturedKey = (tenantId: string) => `storefront_lead_captured_${tenantId}`; // 🔹 CRM: Marca lead já capturado na sessão

function loadCart(storeSlug: string): BagItem[] {
  try {
    const raw = localStorage.getItem(getCartStorageKey(storeSlug));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveCart(bag: BagItem[], storeSlug: string) {
  localStorage.setItem(getCartStorageKey(storeSlug), JSON.stringify(bag));
}

function loadPayment(storeSlug: string): PaymentMethod {
  return (localStorage.getItem(getPaymentStorageKey(storeSlug)) as PaymentMethod) || "pix";
}

// Helpers de produto (mantidos)
function getProductDisplayName(item: any): string {
  return item.product?.name || item.display_name || item.product_name || item.custom_name || "Produto sem nome";
}

function getProductBrand(item: any): string | null {
  return item.product?.brand || item.brand || null;
}

function getProductQuantity(item: any): number {
  return item.total_quantity ?? item.quantity ?? 0;
}

function getStockDisplay(quantity: number | undefined): { text: string; isUrgent: boolean; className: string } {
  const qty = quantity ?? 0;
  if (qty <= 0) return { text: "Sem estoque", isUrgent: true, className: "text-destructive font-bold" };
  if (qty <= 3) return { text: `Restam apenas ${qty}!`, isUrgent: true, className: "text-destructive font-bold" };
  return { text: "Em estoque", isUrgent: false, className: "text-success font-medium" };
}

export default function Storefront() {
  const { slug } = useParams<{ slug?: string }>();
  const [searchParams] = useSearchParams();
  const sellerIdParam = searchParams.get("seller");

  const [items, setItems] = useState<StorefrontItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sellerName, setSellerName] = useState("");
  const [sellerWhatsapp, setSellerWhatsapp] = useState("");
  const [storeSlug, setStoreSlug] = useState<string>("");
  
  const [bag, setBag] = useState<BagItem[]>([]);
  const [bagOpen, setBagOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");
  const [availableBrands, setAvailableBrands] = useState<string[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<string>("");

  // 🔹 CRM: Estados para fluxo de captura de lead
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [tenantId, setTenantId] = useState<string>("");
  const [sessionId, setSessionId] = useState<string>("");
  const [leadCaptured, setLeadCaptured] = useState<boolean>(false);

  // 🔹 CRM: Inicializa carrinho e pagamento por tenant
  useEffect(() => {
    if (storeSlug) {
      setBag(loadCart(storeSlug));
      setPaymentMethod(loadPayment(storeSlug));
    }
  }, [storeSlug]);

  // 🔹 CRM: sincroniza a sacola com o backend conforme ela muda — não só no
  // fechamento do pedido. Sem isto, uma cliente que adiciona produtos e sai
  // sem finalizar não deixa NENHUM rastro: o "carrinho abandonado" nunca
  // existia porque só salvávamos no clique final de "enviar pedido".
  //
  // Debounce de 2s pra não bater na API a cada + / - de quantidade. Se já
  // existe um lead capturado nesta sessão (visitante que voltou), amarra o
  // carrinho a ele — é o que torna o abandono ACIONÁVEL (a consultora tem o
  // WhatsApp pra quem procurar).
  useEffect(() => {
    if (!tenantId || bag.length === 0) return;
    const timer = setTimeout(() => {
      const leadIdSalvo = localStorage.getItem(getLeadCapturedKey(tenantId));
      const cartItems: CartItemInput[] = bag.map((b) => ({
        inventory_id: b.id,
        product_name: getDisplayName(b),
        quantity: b.qty,
        price_snapshot: b.sale_price || 0,
      }));
      persistCart({
        tenant_id: tenantId,
        session_id: sessionId,
        lead_id: leadIdSalvo || undefined,
        checked_out: false,
        items: cartItems,
      }).catch(() => { /* silencioso: não é ação da cliente, não pode gerar erro visível */ });
    }, 2000);
    return () => clearTimeout(timer);
  }, [bag, tenantId, sessionId]);

  useEffect(() => {
    if (storeSlug) saveCart(bag, storeSlug);
  }, [bag, storeSlug]);

  useEffect(() => {
    if (storeSlug) localStorage.setItem(getPaymentStorageKey(storeSlug), paymentMethod);
  }, [paymentMethod, storeSlug]);

  // 🔹 CRM: Carrega estado de lead capturado quando tenantId estiver disponível
  useEffect(() => {
    if (tenantId) {
      const captured = localStorage.getItem(getLeadCapturedKey(tenantId));
      setLeadCaptured(!!captured);
    }
  }, [tenantId]);

  // Fetch de produtos e configuração da loja
  useEffect(() => {
    const fetchItems = slug
      ? storefrontApi.listBySlug(slug)
      : storefrontApi.list(sellerIdParam || "");

    fetchItems.then((res: any) => {
      const productsList = res.items || [];
      const mappedItems: StorefrontItem[] = productsList.map((item: any) => {
        const productName = getProductDisplayName(item);
        const brand = getProductBrand(item);
        const quantity = getProductQuantity(item);
        return {
          id: item.id,
          product_name: productName,
          display_name: productName,
          category: item.category || item.product?.category || "Geral",
          brand: brand,
          sale_price: item.sale_price || item.product?.official_price || 0,
          total_quantity: quantity,
          stock_info: { quantity, is_urgent: quantity <= 3 && quantity > 0, display_text: getStockDisplay(quantity).text },
          image_url: item.image_url || item.product?.image_url || null,
          custom_name: item.custom_name || null,
          barcode: item.barcode || item.product?.bar_code || "",
          expiry_date: item.expiry_date || null,
          seller_name: null,
          seller_whatsapp: null,
          user_id: "",
          store_slug: null,
        };
      });

      setItems(mappedItems);

      // Extrai marcas disponíveis
      const validBrands = [...new Set(mappedItems.map((item: StorefrontItem) => getProductBrand(item)).filter(Boolean) as string[])].sort();
      setAvailableBrands(validBrands);
      if (res.brands?.available) setAvailableBrands(res.brands.available);

      // 🔹 CRM: Configura tenant e sessão
      if (res.store) {
        setSellerName(res.store.name || "Consultor(a)");
        setSellerWhatsapp(res.store.whatsapp || "");
        const currentStoreSlug = res.store.slug || slug || sellerIdParam || "default";
        setStoreSlug(currentStoreSlug);
        setTenantId(res.store.user_id || res.store.tenant_id || "");
        setSessionId(getOrCreateSessionId(currentStoreSlug));
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [slug, sellerIdParam]);

  // Filtros de busca e marca
  const filtered = items.filter((item: StorefrontItem) => {
    const matchesSearch = !search || getProductDisplayName(item).toLowerCase().includes(search.toLowerCase()) || (item.category || "").toLowerCase().includes(search.toLowerCase());
    const itemBrand = getProductBrand(item);
    const matchesBrand = !selectedBrand || itemBrand === selectedBrand;
    return matchesSearch && matchesBrand;
  });

  // Gestão do carrinho
  const addToBag = useCallback((item: StorefrontItem) => {
    setBag((prev) => {
      const existing = prev.find((b) => b.id === item.id);
      if (existing) return prev.map((b) => b.id === item.id ? { ...b, qty: b.qty + 1 } : b);
      return [...prev, { ...item, qty: 1 }];
    });
  }, []);

  const updateQty = (id: string, delta: number) => {
    setBag((prev) => prev.map((b) => b.id === id ? { ...b, qty: b.qty + delta } : b).filter((b) => b.qty > 0));
  };

  const removeFromBag = (id: string) => setBag((prev) => prev.filter((b) => b.id !== id));
  const bagTotal = bag.reduce((sum, b) => sum + (b.sale_price || 0) * b.qty, 0);
  const bagCount = bag.reduce((sum, b) => sum + b.qty, 0);
  const paymentLabel = paymentMethod === "pix" ? "PIX" : "Cartão / Link de Pagamento";
  const getDisplayName = (item: StorefrontItem | BagItem) => getProductDisplayName(item);
  const getItemQtyInBag = (id: string) => bag.find((b) => b.id === id)?.qty || 0;

  // 🔹 CRM: monta só o TEXTO da mensagem (sem codificar pra URL). Separado
  // do link porque agora esse texto também é REGISTRADO no pedido — é o
  // "o que ela enviou pra consultora" que a consultora pediu pra guardar.
  const buildOrderMessageText = (itemsList: BagItem[]): string => {
    if (itemsList.length === 1 && itemsList[0].qty === 1) {
      const name = getDisplayName(itemsList[0]);
      const priceText = itemsList[0].sale_price ? ` — ${formatMoney(itemsList[0].sale_price)}` : "";
      return `Olá ${sellerName}! 😊\n\nTenho interesse no produto:\n• ${name}${priceText}\n\n💳 Forma de pagamento: *${paymentLabel}*\n\nEstá disponível?`;
    }
    const lines = itemsList.map((b) => `• ${b.qty}x ${getDisplayName(b)}${b.sale_price ? ` — ${formatMoney(b.sale_price * b.qty)}` : ""}`);
    return `Olá ${sellerName}! 😊\n\nGostaria de solicitar os seguintes produtos:\n\n${lines.join("\n")}\n\n💰 Total estimado: *${formatMoney(bagTotal)}*\n💳 Forma de pagamento: *${paymentLabel}*\n\nPode verificar a disponibilidade e me retornar? Obrigada!`;
  };

  // 🔹 CRM: Gera link do WhatsApp com mensagem contextual
  const buildWhatsappLink = (itemsList: BagItem[]) => {
    const rawPhone = sellerWhatsapp?.replace(/\D/g, "") || "";
    const phone = rawPhone.startsWith("55") ? rawPhone : `55${rawPhone}`;
    const msg = buildOrderMessageText(itemsList);
    return `https://api.whatsapp.com/send/?phone=${phone}&text=${encodeURIComponent(msg)}`;
  };

  const handleDirectBuy = (item: StorefrontItem) => {
    if (!sellerWhatsapp) {
      toast({ title: "Aviso", description: "O lojista não configurou o número de WhatsApp.", variant: "destructive" });
      return;
    }
    addToBag(item);
    setBagOpen(true);
  };

  // 🔹 CRM: registra o pedido como FECHADO — com forma de pagamento e a
  // mensagem exata que foi mandada. Reaproveitado tanto por quem preenche o
  // modal agora quanto por quem já é cliente e está comprando de novo.
  // Nunca bloqueia o envio: se isso falhar, o WhatsApp abre normalmente.
  const registrarPedidoFechado = async (leadId: string) => {
    if (!tenantId) return;
    const cartItems: CartItemInput[] = bag.map((b) => ({
      inventory_id: b.id,
      product_name: getDisplayName(b),
      quantity: b.qty,
      price_snapshot: b.sale_price || 0,
    }));
    try {
      await persistCart({
        tenant_id: tenantId,
        session_id: sessionId,
        lead_id: leadId,
        checked_out: true,
        payment_method: paymentMethod,
        whatsapp_message: buildOrderMessageText(bag),
        items: cartItems,
      });
    } catch {
      /* silencioso — o pedido já foi enviado pelo WhatsApp de qualquer forma */
    }
  };

  // 🔹 CRM: Fluxo principal de envio do pedido
  const handleSendOrder = () => {
    if (bag.length === 0 || !sellerWhatsapp) return;

    // ⚠️ CORREÇÃO: antes, quem já tinha lead capturado (cliente que voltou)
    // só abria o WhatsApp — o pedido em si NUNCA era registrado como
    // fechado. Isso significava que a 2ª compra em diante de qualquer
    // cliente ficava invisível pro CRM: não contava em total_orders, não
    // tinha forma de pagamento, e o carrinho ficava sempre marcado como
    // "aberto" (por causa da sincronização automática da sacola) até virar
    // um falso positivo de carrinho abandonado 2h depois.
    if (leadCaptured || !tenantId) {
      const leadIdSalvo = tenantId ? localStorage.getItem(getLeadCapturedKey(tenantId)) : null;
      if (leadIdSalvo) {
        registrarPedidoFechado(leadIdSalvo); // não precisa esperar — abre o WhatsApp já
      }
      const link = buildWhatsappLink(bag);
      window.open(link, "_blank", "noopener,noreferrer");
      return;
    }

    // 🔹 Caso contrário, abre modal de captura suave (CRM Invisible)
    setCheckoutOpen(true);
  };

  // 🔹 CRM: Callback do CheckoutModal - captura lead e persiste carrinho
  const handleLeadSubmit = async (data: {
    name: string;
    phone: string;
    email?: string;
    birth_date?: string;
    whatsapp_opt_in: boolean;
  }) => {
    if (!tenantId) {
      // Fallback: se não tem tenant, envia direto
      const link = buildWhatsappLink(bag);
      window.open(link, "_blank", "noopener,noreferrer");
      return;
    }

    try {
      // 1. Cria ou atualiza o Lead (com deduplicação por telefone)
      const leadInput: LeadInput = {
        tenant_id: tenantId,
        name: data.name.trim(),
        phone: data.phone.replace(/\D/g, ""),
        email: data.email,
        birth_date: data.birth_date,
        whatsapp_opt_in: data.whatsapp_opt_in,
        source: "storefront",
        consent_version: "1.0", // 🔹 LGPD: versão do termo de consentimento
      };
      const lead = await upsertLead(leadInput);

      // 2. Marca lead como capturado nesta sessão (localStorage por tenant)
      localStorage.setItem(getLeadCapturedKey(tenantId), lead.id);
      setLeadCaptured(true);

      // 3. Persiste carrinho vinculado ao lead (para analytics/CRM da consultora)
      const cartItems: CartItemInput[] = bag.map((b) => ({
        inventory_id: b.id,
        product_name: getDisplayName(b),
        quantity: b.qty,
        price_snapshot: b.sale_price || 0,
      }));

      await persistCart({
        tenant_id: tenantId,
        session_id: sessionId,
        lead_id: lead.id,
        checked_out: true,
        payment_method: paymentMethod,
        whatsapp_message: buildOrderMessageText(bag),
        items: cartItems,
      });

      toast({ title: "Dados salvos!", description: "Agora você receberá atualizações no WhatsApp." });

    } catch (error) {
      console.error("Erro ao capturar lead:", error);
      toast({ title: "Atenção", description: "Não foi possível salvar seus dados. Tente novamente.", variant: "destructive" });
      // Mesmo com erro, permite continuar para não bloquear a venda
    }

    // 4. Envia para o WhatsApp após captura (ou fallback)
    const link = buildWhatsappLink(bag);
    window.open(link, "_blank", "noopener,noreferrer");
  };

  const clearBag = () => {
    setBag([]);
    if (storeSlug) localStorage.removeItem(getCartStorageKey(storeSlug));
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand/5 via-background to-background pb-28">
      {/* HEADER */}
      <header className="relative overflow-hidden bg-gradient-to-br from-brand via-brand/90 to-brand-hover">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.08),transparent_50%)]" />
        <div className="relative mx-auto max-w-4xl px-6 pb-12 pt-8 text-center">
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm shadow-lg">
            <Sparkles className="h-7 w-7 text-white" />
          </motion.div>
          <motion.h1 initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }} className="mt-4 text-2xl font-bold text-white tracking-tight">
            {sellerName ? `Vitrine de ${sellerName}` : "Vitrine Online"}
          </motion.h1>
          <motion.p initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="mt-1 text-sm text-white/80">
            Produtos disponíveis para pronta entrega
          </motion.p>
        </div>
      </header>

      {/* SEARCH + FILTERS */}
      <main className="mx-auto max-w-4xl px-4 sm:px-6">
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.25 }} className="-mt-6 relative z-10 mb-6">
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 shadow-xl shadow-black/5 ring-1 ring-black/[0.03] focus-within:ring-2 focus-within:ring-brand/40 transition-all">
            <Search className="h-5 w-5 text-brand shrink-0" />
            <input type="text" placeholder="Buscar produto ou categoria..." value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1 bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground/60" />
            {search && <button onClick={() => setSearch("")} className="rounded-lg bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted/80 transition-colors">Limpar</button>}
          </div>
        </motion.div>

        {/* Abas de marca — mesma lógica de filtro de antes (client-side,
            state selectedBrand/availableBrands), agora com o mesmo padrão
            visual usado no resto do sistema (Dashboard, Relatórios/Meu MEI):
            cartão com borda, segmento ativo preenchido na cor da marca. A
            versão anterior era só texto sublinhado, sem "corpo" nenhum —
            por isso destoava do resto do app. */}
        {availableBrands.length > 1 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1 scrollbar-hide"
            role="tablist"
            aria-label="Filtrar por marca"
          >
            <button
              role="tab"
              aria-selected={selectedBrand === ""}
              onClick={() => setSelectedBrand("")}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                selectedBrand === ""
                  ? "bg-brand text-white"
                  : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              Todas
              <span
                className={`rounded-full px-1.5 py-0.5 text-[11px] leading-none ${
                  selectedBrand === "" ? "bg-white/20" : "bg-secondary"
                }`}
              >
                {items.length}
              </span>
            </button>
            {availableBrands.map((brand: string) => {
              const brandCount = items.filter((item: StorefrontItem) => getProductBrand(item) === brand).length;
              const ativa = selectedBrand === brand;
              return (
                <button
                  key={brand}
                  role="tab"
                  aria-selected={ativa}
                  onClick={() => setSelectedBrand(brand)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                    ativa ? "bg-brand text-white" : "text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {brand}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[11px] leading-none ${
                      ativa ? "bg-white/20" : "bg-secondary"
                    }`}
                  >
                    {brandCount}
                  </span>
                </button>
              );
            })}
          </motion.div>
        )}

        {/* Results Counter */}
        {(search || selectedBrand) && (
          <div className="mb-4 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span>{filtered.length} produto{filtered.length !== 1 ? "s" : ""}{search && ` para "${search}"`}{selectedBrand && ` da marca ${selectedBrand}`}</span>
            {(search || selectedBrand) && <button onClick={() => { setSearch(""); setSelectedBrand(""); }} className="text-brand hover:text-brand/80 underline">Limpar filtros</button>}
          </div>
        )}

        {/* PRODUCTS GRID */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-muted-foreground">
            <Package className="mb-3 h-14 w-14 opacity-20" />
            <p className="text-sm font-medium">{search || selectedBrand ? "Nenhum produto encontrado com os filtros aplicados" : "Nenhum produto disponível"}</p>
            <p className="text-xs mt-1">{search || selectedBrand ? "Tente remover alguns filtros" : "A loja está sem estoque no momento."}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map((item: StorefrontItem, i: number) => {
              const qtyInBag = getItemQtyInBag(item.id);
              const name = getDisplayName(item);
              const quantity = getProductQuantity(item);
              const stockDisplay = getStockDisplay(quantity);

              return (
                <motion.div key={item.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, type: "spring", stiffness: 300, damping: 30 }} className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all duration-200 hover:shadow-lg hover:shadow-brand/5 hover:-translate-y-0.5">
                  {/* Badges */}
                  {getProductBrand(item) && availableBrands.length > 0 && <div className="absolute left-2 top-2 z-10 px-2 py-1 bg-black/70 text-white text-[10px] font-medium rounded">{getProductBrand(item)}</div>}
                  {stockDisplay.isUrgent && quantity > 0 && <div className="absolute left-2 top-8 z-10 flex items-center gap-1 px-2 py-1 bg-destructive text-white text-[9px] font-bold rounded"><AlertTriangle className="h-2.5 w-2.5" />ÚLTIMAS UNIDADES!</div>}
                  {qtyInBag > 0 && <div className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white shadow-md">{qtyInBag}</div>}

                  {/* Image */}
                  <div className="relative aspect-square w-full overflow-hidden bg-secondary/30">
                    {item.image_url ? (
                      <img src={item.image_url} alt={name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center"><Package className="h-10 w-10 text-muted-foreground/30" /></div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex flex-1 flex-col p-3 border-t border-border/50">
                    <p className="text-xs font-bold text-foreground leading-snug line-clamp-2" title={name}>{name}</p>
                    <p className="mt-0.5 text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">{item.category}</p>
                    <div className="mt-1"><p className={`text-[10px] ${stockDisplay.className}`}>{stockDisplay.text}</p></div>
                    <div className="mt-auto pt-3">
                      {item.sale_price ? <p className="text-base font-extrabold text-brand">{formatMoney(item.sale_price)}</p> : <p className="text-xs italic text-muted-foreground">Preço sob consulta</p>}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="outline" className="rounded-xl h-9 flex-1 bg-secondary/50 border-transparent hover:border-brand/30 hover:bg-brand/10 hover:text-brand transition-all text-xs font-semibold" onClick={() => addToBag(item)} disabled={quantity === 0}>
                        <Plus className="h-3.5 w-3.5 mr-1" />{quantity === 0 ? "Sem estoque" : "Sacola"}
                      </Button>
                      <Button size="sm" className="rounded-xl bg-[#25D366] hover:bg-[#128C7E] text-white shadow-sm transition-all h-9 w-9 p-0 shrink-0" onClick={() => handleDirectBuy(item)} title="Pedir pelo WhatsApp" disabled={quantity === 0}>
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </main>

      {/* FLOATING BAG BUTTON */}
      <AnimatePresence>
        {bagCount > 0 && (
          <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 w-full max-w-[90%] sm:max-w-md px-4">
            <Button onClick={() => setBagOpen(true)} className="w-full flex items-center justify-between rounded-2xl bg-foreground px-5 py-7 text-background shadow-2xl hover:bg-foreground/90 hover:scale-[1.02] transition-all">
              <div className="flex items-center gap-3">
                <div className="relative"><ShoppingBag className="h-5 w-5" /><span className="absolute -top-2 -right-2 flex h-4 w-4 items-center justify-center rounded-full bg-brand text-[9px] font-bold text-white">{bagCount}</span></div>
                <span className="font-semibold text-sm">Ver Sacola</span>
              </div>
              {bagTotal > 0 && <span className="text-base font-black">{formatMoney(bagTotal)}</span>}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* BAG SHEET */}
      <Sheet open={bagOpen} onOpenChange={setBagOpen}>
        {/* ⚠️ CORREÇÃO: o conteúdo (lista + pagamento + total + botões) só
            tinha UM scroll interno, o da lista, limitado a 40vh. O resto
            (cabeçalho, pagamento, total, os dois botões) disputava o mesmo
            espaço fixo de max-h-[85vh] SEM nenhuma rolagem própria — com
            a sacola cheia, o conjunto passava da altura da tela e o botão
            "Esvaziar sacola" (o último elemento) ficava inacessível, sem
            nenhuma barra de rolagem pra alcançar.
            Agora é cabeçalho fixo + área do meio que rola + rodapé sempre
            fixo — o padrão de layout pra esse tipo de painel. */}
        <SheetContent side="bottom" className="flex max-h-[85vh] flex-col rounded-t-3xl px-4 sm:mx-auto sm:max-w-md">
          <SheetHeader className="shrink-0 pb-4">
            <SheetTitle className="flex items-center gap-2 text-foreground text-lg"><ShoppingBag className="h-5 w-5 text-brand" />Sua Sacola</SheetTitle>
            <SheetDescription>{bag.length === 0 ? "Sua sacola está vazia" : `${bagCount} ${bagCount === 1 ? "item" : "itens"} selecionado${bagCount === 1 ? "" : "s"}`}</SheetDescription>
          </SheetHeader>

          {bag.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-muted-foreground">
              <ShoppingBag className="mb-3 h-10 w-10 opacity-20" />
              <p className="text-sm font-medium">Adicione produtos da vitrine</p>
            </div>
          ) : (
            <>
              {/* Área do meio: cresce e rola. min-h-0 é essencial aqui — sem
                  ele, um filho flex com overflow-y-auto não encolhe direito
                  e a rolagem não funciona (comportamento padrão do flexbox). */}
              <div className="min-h-0 flex-1 overflow-y-auto pr-1 scrollbar-thin">
                <div className="flex flex-col gap-5 pb-2 pt-2">
                  <div className="space-y-3">
                    {bag.map((item) => (
                      <div key={item.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-2.5 shadow-sm">
                        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border/50 bg-secondary/30">
                          {item.image_url ? <img src={item.image_url} alt={getDisplayName(item)} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center"><Package className="h-6 w-6 text-muted-foreground/30" /></div>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-xs font-bold text-foreground">{getDisplayName(item)}</p>
                          {item.sale_price && <p className="mt-1 text-sm font-extrabold text-brand">{formatMoney(item.sale_price * item.qty)}</p>}
                        </div>
                        <div className="flex items-center gap-1 bg-secondary rounded-lg p-1 border border-border/50">
                          <button className="flex h-6 w-6 items-center justify-center rounded bg-background shadow-sm text-muted-foreground hover:text-foreground" onClick={() => updateQty(item.id, -1)}><Minus className="h-3 w-3" /></button>
                          <span className="w-6 text-center text-xs font-bold text-foreground">{item.qty}</span>
                          <button className="flex h-6 w-6 items-center justify-center rounded bg-background shadow-sm text-muted-foreground hover:text-foreground" onClick={() => updateQty(item.id, 1)}><Plus className="h-3 w-3" /></button>
                        </div>
                        <button className="p-2 text-muted-foreground hover:text-destructive transition-colors rounded-lg hover:bg-destructive/10" onClick={() => removeFromBag(item.id)}><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ))}
                  </div>
                  <Separator />

                  {/* Payment Method */}
                  <div className="space-y-3">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Como deseja pagar?</p>
                    <div className="grid grid-cols-2 gap-3">
                      <button onClick={() => setPaymentMethod("pix")} className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 p-3 transition-all ${paymentMethod === "pix" ? "border-brand bg-brand/5 text-brand shadow-sm" : "border-border bg-card text-muted-foreground hover:border-brand/30 hover:bg-secondary/50"}`}>
                        <QrCode className="h-5 w-5" /><span className="text-xs font-bold">PIX</span>
                      </button>
                      <button onClick={() => setPaymentMethod("cartao")} className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 p-3 transition-all ${paymentMethod === "cartao" ? "border-brand bg-brand/5 text-brand shadow-sm" : "border-border bg-card text-muted-foreground hover:border-brand/30 hover:bg-secondary/50"}`}>
                        <CreditCard className="h-5 w-5" /><span className="text-xs font-bold">Cartão ou Link</span>
                      </button>
                    </div>
                  </div>
                  <Separator />

                  <div className="flex items-center justify-between px-1">
                    <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Total do Pedido</span>
                    <span className="text-2xl font-black text-foreground">{formatMoney(bagTotal)}</span>
                  </div>
                </div>
              </div>

              {/* Rodapé: NUNCA rola, sempre visível, não importa o tamanho da sacola. */}
              <div className="shrink-0 space-y-2 border-t border-border pt-3">
                <Button onClick={handleSendOrder} className="w-full h-14 gap-2 rounded-xl bg-[#25D366] text-base font-bold text-white shadow-lg hover:bg-[#128C7E] transition-all hover:scale-[1.02]">
                  <Send className="h-5 w-5" />Enviar pedido pelo WhatsApp
                </Button>
                <Button variant="ghost" className="w-full text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors" onClick={clearBag}>Esvaziar sacola</Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* 🔹 CRM: Modal de Captura Suave (CheckoutModal) */}
      <CheckoutModal
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        sellerName={sellerName}
        onSubmit={handleLeadSubmit}
        // 🔹 LGPD: Configurações de consentimento
        lgpdConfig={{
          required: true,
          checkboxLabel: "Aceito receber promoções e novidades da consultora via WhatsApp",
          privacyPolicyLink: "/privacy",
          consentVersion: "1.0",
        }}
      />

      {/* Footer */}
      <footer className="mt-12 border-t border-border/50 bg-card/50 py-5 text-center text-xs text-muted-foreground/60">
        Vitrine digital • Estoque Natura · <a href="/privacy" className="underline hover:text-brand">Política de Privacidade</a>
      </footer>
    </div>
  );
}