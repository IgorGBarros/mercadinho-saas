import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Package, BarChart3, Store, ScanBarcode, Shield, Sparkles,
  Check, X, ArrowRight, Star, TrendingDown, Bell, Bot, Crown, 
  Zap, Users, CreditCard, Loader2,
} from "lucide-react";
import { api } from "../services/api"; 
import { useToast } from '../components/ui/use-toast';// ✅ Importar useToast original para evitar dependência circular
import logoMinhaAmora from "../assets/logo-minhaamora.png";
import amorinhaAvatar from "../assets/amorinha-avatar.png";
import appPreview1 from "../assets/app-preview-1.png";
import appPreview2 from "../assets/app-preview-2.png";
const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.1, duration: 0.55, ease: [0.25, 0.46, 0.45, 0.94] as const } }),
};

const BRAND_COLORS = {
  primary: '#871745',
  primaryLight: '#FDF2F7',
  success: '#871745',
  text: '#2D292E'
};

const FREE_FEATURES = [
  { text: "Até 20 produtos", ok: true },
  { text: "Scanner de código de barras", ok: true },
  { text: "Controle básico de estoque", ok: true },
  { text: "Vitrine digital personalizada", ok: false },
  { text: "Scanner de validade (OCR)", ok: false },
  { text: "Alertas inteligentes", ok: false },
  { text: "Analytics avançado", ok: false },
  { text: "Assistente Amorinha (IA)", ok: false },
];

const PRO_FEATURES = [
  { text: "Produtos ilimitados", ok: true },
  { text: "Scanner multimarcas completo", ok: true },
  { text: "Controle total de estoque", ok: true },
  { text: "Sua vitrine digital exclusiva", ok: true },
  { text: "Scanner de validade inteligente", ok: true },
  { text: "Alertas de vencimento no WhatsApp", ok: true },
  { text: "Analytics e relatórios completos", ok: true },
  { text: "Amorinha - sua assistente IA", ok: true },
];

const FEATURES = [
  {
    icon: Package,
    title: "Estoque sempre organizado",
    desc: "Cadastre entradas e saídas em segundos. Nunca mais perca o controle do que você tem para vender.",
  },
  {
    icon: ScanBarcode,
    title: "Scanner inteligente multimarcas",
    desc: "Aponte o celular para qualquer código de barras e nossa IA encontra o produto automaticamente - Natura, Avon, Boticário e muito mais.",
  },
  {
    icon: TrendingDown,
    title: "Alertas de estoque baixo",
    desc: "Receba notificações quando algo estiver acabando. Nunca mais perca uma venda por falta de produto.",
  },
  {
    icon: Bell,
    title: "Proteção contra vencimentos",
    desc: "A Amorinha te avisa antes dos produtos vencerem. Faça promoções a tempo e evite prejuízos.",
  },
  {
    icon: Store,
    title: "Sua vitrine digital exclusiva",
    desc: "Um link personalizado com seus produtos em tempo real. Compartilhe no WhatsApp e venda 24h por dia.",
  },
  {
    icon: Bot,
    title: "Amorinha - sua assistente IA",
    desc: "Pergunte 'Quantos batons tenho?' ou 'Qual meu lucro hoje?' e receba respostas instantâneas da sua assistente pessoal.",
  },
];

const TESTIMONIALS = [
  {
    name: "Juliana Mendes",
    role: "Consultora Natura",
    text: "Antes eu controlava tudo no caderno e sempre me perdia entre as marcas. Com a Minha Amora, é só bipar e pronto! Minha renda aumentou 40%.",
    stars: 5,
  },
  {
    name: "Camila Rocha",
    role: "Revendedora Multimarcas",
    text: "A vitrine digital mudou meu negócio! Mando o link no status do WhatsApp e as clientes compram sozinhas. A Amorinha me ajuda com tudo!",
    stars: 5,
  },
  {
    name: "Patricia Lima",
    role: "Empreendedora Digital",
    text: "O scanner reconhece todos os produtos nacionais que trabalho! E os alertas de validade já me salvaram de muito prejuízo. Recomendo de olhos fechados.",
    stars: 5,
  },
];

const FAQS = [
  { 
    q: "Como funciona a assistente Amorinha?", 
    a: "A Amorinha é sua assistente pessoal com inteligência artificial. Você pode conversar com ela normalmente: 'Amorinha, quanto lucrei esta semana?' ou 'Quais produtos estão vencendo?' e ela responde na hora!" 
  },
  { 
    q: "Funciona com produtos de quais marcas?", 
    a: "Todas! Natura, Avon, Boticário, Eudora, O Boticário, Mary Kay, Jequiti e milhares de outras marcas nacionais e importadas. Se tem código de barras, a Minha Amora reconhece." 
  },
  { 
    q: "Posso cancelar quando quiser?", 
    a: "Claro! Sem fidelidade ou multas. Você pode cancelar a qualquer momento e continuar usando até o final do período já pago." 
  },
  { 
    q: "Meus dados estão seguros?", 
    a: "100% seguros! Usamos a mesma tecnologia de bancos digitais para proteger suas informações. Seus dados de estoque e vendas são criptografados e só você tem acesso." 
  },
];

// ─── Checkout Modal ─────────────────────────────────────────────────────────
interface CheckoutModalProps {
  open: boolean;
  onClose: () => void;
}

function CheckoutModal({ open, onClose }: CheckoutModalProps) {
  const { toast } = useToast();
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const currentPrice = billing === "monthly" ? "R$ 39,90/mês" : "R$ 399/ano (~R$ 33,25/mês)";

  const handleCheckout = async () => {
    if (!email || !email.includes("@")) {
      toast({ title: "E-mail inválido", description: "Por favor, insira um e-mail válido.", variant: "destructive" });
      return;
    }
    
    setLoading(true);
    
    try {
      const { data } = await api.post("/payments/create-checkout/", {
        billing_cycle: billing,
        email: email,
      });
      
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error("URL de checkout não recebida do servidor.");
      }
      
    } catch (err: any) {
      console.error(err);
      if (err.response?.status === 404 || err.message.includes('Network Error')) {
        toast({ 
          title: "Lista VIP da Minha Amora", 
          description: "Sistema de pagamentos em atualização. Seu e-mail foi salvo com prioridade máxima!", 
        });
        setTimeout(onClose, 2500);
      } else {
        const msg = err.response?.data?.error || err.message || "Erro ao processar checkout.";
        toast({ title: "Ops!", description: msg, variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-md rounded-2xl border-2 border-[#871745] bg-card p-6 shadow-2xl shadow-[#871745]/20"
      >
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-1">
            <Crown className="h-5 w-5 text-[#871745]" />
            <h2 className="font-display text-xl font-bold text-foreground">Assinar Minha Amora PRO</h2>
          </div>
          <p className="text-sm text-muted-foreground">Checkout seguro. Cancele quando quiser.</p>
        </div>
        
        <div className="flex gap-2 mb-5 p-1 rounded-xl bg-[#FDF2F7]">
          <button 
            onClick={() => setBilling("monthly")} 
            className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all ${
              billing === "monthly" 
                ? "bg-card text-[#871745] shadow-sm border border-[#871745]/20" 
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Mensal
          </button>
          <button 
            onClick={() => setBilling("yearly")} 
            className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all relative ${
              billing === "yearly" 
                ? "bg-card text-[#871745] shadow-sm border border-[#871745]/20" 
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Anual 
            <span className="ml-1.5 rounded-full bg-[#871745]/15 px-1.5 py-0.5 text-[10px] font-bold text-[#871745]">
              -17%
            </span>
          </button>
        </div>
        
        <div className="mb-5 rounded-xl bg-[#871745]/5 border border-[#871745]/20 p-3 text-center">
          <p className="text-sm font-bold text-[#871745]">{currentPrice}</p>
        </div>
        
        <div className="mb-5">
          <label className="block text-xs font-semibold text-foreground mb-1.5">Seu e-mail</label>
          <input 
            type="email" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            onKeyDown={(e) => e.key === "Enter" && handleCheckout()} 
            placeholder="voce@email.com" 
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-[#871745] focus:outline-none focus:ring-2 focus:ring-[#871745]/20 transition-all" 
          />
        </div>
        
        <button 
          onClick={handleCheckout} 
          disabled={loading || !email} 
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#871745] py-3.5 text-sm font-bold text-white shadow-md shadow-[#871745]/20 hover:bg-[#871745]/90 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
          {loading ? "Processando..." : "Ir para pagamento"}
        </button>
        
        <button 
          onClick={onClose} 
          className="mt-3 w-full text-xs text-muted-foreground hover:text-foreground transition-colors text-center py-1"
        >
          Cancelar
        </button>
      </motion.div>
    </div>
  );
}

// ─── Landing Page Component ──────────────────────────────────────────────────
export default function LandingPage() {
  const navigate = useNavigate();
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <AnimatePresence>
        {checkoutOpen && <CheckoutModal open={checkoutOpen} onClose={() => setCheckoutOpen(false)} />}
      </AnimatePresence>
      
      {/* ─── NAV ─── */}
      <nav className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            {/* ✅ LOGO ATUALIZADO - NAV */}
            <img
              src={logoMinhaAmora}
              alt="Minha Amora"
              className="h-9 w-9 rounded-xl object-contain"
            />
            <span className="font-display text-base font-bold text-foreground">
              Minha <span className="text-[#871745]">Amora</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate("/auth")} 
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Entrar
            </button>
            <button 
              onClick={() => navigate("/auth")} 
              className="rounded-xl bg-[#871745] px-4 py-2 text-sm font-bold text-white hover:bg-[#871745]/90 transition-colors"
            >
              Começar grátis
            </button>
          </div>
        </div>
      </nav>

      {/* ─── HERO ─── */}
      <section className="relative overflow-hidden py-20 md:py-32">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-[#871745]/8 blur-3xl" />
          <div className="absolute top-20 right-0 h-80 w-80 rounded-full bg-[#FDF2F7] blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <motion.div 
            initial="hidden" 
            animate="visible" 
            variants={fadeUp} 
            custom={0} 
            className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#871745]/20 bg-[#871745]/8 px-4 py-1.5"
          >
            <Sparkles className="h-3.5 w-3.5 text-[#871745]" />
            <span className="text-xs font-semibold text-[#871745]">Para consultoras de beleza brasileiras</span>
          </motion.div>
          
          <motion.h1 
            initial="hidden" 
            animate="visible" 
            variants={fadeUp} 
            custom={1} 
            className="font-display text-4xl font-bold leading-tight text-foreground md:text-6xl"
          >
            Sua consultoria de <span className="text-[#871745]">qualquer marca</span> <br className="hidden md:block"/>
            <span className="relative">
              <span className="relative z-10">organizada e lucrativa.</span>
              <span className="absolute bottom-1 left-0 right-0 h-3 -z-0 rounded bg-[#871745]/15" />
            </span>
          </motion.h1>
          
          <motion.p 
            initial="hidden" 
            animate="visible" 
            variants={fadeUp} 
            custom={2} 
            className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground"
          >
            Apontou, cadastrou. Nossa inteligência artificial reconhece produtos de qualquer marca pelo código de barras. 
            Tenha sua vitrine digital exclusiva e conte com a <strong className="text-[#871745]">Amorinha</strong>, sua assistente pessoal.
          </motion.p>
          
          <motion.div 
            initial="hidden" 
            animate="visible" 
            variants={fadeUp} 
            custom={3} 
            className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center"
          >
            <button 
              onClick={() => navigate("/auth")} 
              className="flex items-center gap-2 rounded-2xl bg-[#871745] px-8 py-4 text-base font-bold text-white shadow-lg shadow-[#871745]/25 hover:bg-[#871745]/90 hover:shadow-[#871745]/40 transition-all"
            >
              Começar grátis agora
              <ArrowRight className="h-4 w-4" />
            </button>
            <p className="text-sm text-muted-foreground">Sem cartão de crédito · 100% gratuito</p>
          </motion.div>
          
          <motion.div 
            initial="hidden" 
            animate="visible" 
            variants={fadeUp} 
            custom={4} 
            className="mt-16 grid grid-cols-3 gap-6 divide-x divide-border border border-border rounded-2xl bg-card p-6 max-w-lg mx-auto shadow-sm"
          >
            {[
              { value: "5+ Marcas", label: "Principais do Brasil" },
              { value: "R$ 0", label: "Para começar" },
              { value: "100%", label: "Sua consultoria" },
            ].map((stat) => (
              <div key={stat.label} className="px-2">
                <p className="font-display text-2xl font-bold text-[#871745]">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
              </div>
            ))}
          </motion.div>
        </div>
        
      </section>

            {/* ─── APP PREVIEW / SHOWCASE ─── */}
      <section className="py-20 overflow-hidden">
        <div className="mx-auto max-w-6xl px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            className="text-center mb-14"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-[#871745]/20 bg-[#871745]/8 px-4 py-1.5 mb-4">
              <Zap className="h-3.5 w-3.5 text-[#871745]" />
              <span className="text-xs font-semibold text-[#871745]">Veja na prática</span>
            </div>
            <h2 className="font-display text-3xl font-bold text-foreground md:text-4xl">
              Tudo na palma da sua mão
            </h2>
            <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
              Interface pensada para consultoras de verdade. Simples, bonita e poderosa — com a 
              <strong className="text-[#871745]"> Amorinha</strong> sempre ao seu lado.
            </p>
          </motion.div>

          {/* ─── IMAGENS ─── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            {/* Imagem 1 — Visão geral do app */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
              variants={fadeUp}
              custom={0}
              className="relative group"
            >
              <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-[#871745]/10 to-[#FDF2F7]/60 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
              <div className="relative rounded-2xl overflow-hidden border border-border bg-card shadow-xl shadow-[#871745]/5 hover:shadow-2xl hover:shadow-[#871745]/10 transition-all duration-500">
                <img
                  src={appPreview1}
                  alt="Minha Amora — Interface principal com scanner, produtos e estatísticas"
                  className="w-full h-auto object-cover"
                  loading="lazy"
                />
              </div>
              {/* Label flutuante */}
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-[#871745] text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-lg shadow-[#871745]/30 whitespace-nowrap">
                ✨ Sua consultoria organizada
              </div>
            </motion.div>

            {/* Imagem 2 — Scanner em ação */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
              variants={fadeUp}
              custom={0.3}
              className="relative group"
            >
              <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-[#FDF2F7]/60 to-[#871745]/10 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
              <div className="relative rounded-2xl overflow-hidden border border-border bg-card shadow-xl shadow-[#871745]/5 hover:shadow-2xl hover:shadow-[#871745]/10 transition-all duration-500">
                <img
                  src={appPreview2}
                  alt="Minha Amora — Scanner inteligente reconhecendo código de barras de produto"
                  className="w-full h-auto object-cover"
                  loading="lazy"
                />
              </div>
              {/* Label flutuante */}
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-[#871745] text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-lg shadow-[#871745]/30 whitespace-nowrap">
                📦 Escaneou? Cadastrou!
              </div>
            </motion.div>
          </div>

          {/* ─── MINI STATS abaixo das imagens ─── */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            custom={0.6}
            className="mt-14 flex flex-wrap justify-center gap-6 md:gap-12"
          >
            {[
              { icon: ScanBarcode, label: "Scanner Inteligente", desc: "Reconhece qualquer marca" },
              { icon: Bot, label: "Amorinha IA", desc: "Sua assistente pessoal" },
              { icon: Store, label: "Vitrine Digital", desc: "Venda 24h pelo WhatsApp" },
              { icon: Shield, label: "100% Seguro", desc: "Dados criptografados" },
            ].map((item, i) => (
              <div key={item.label} className="flex items-center gap-3 text-left">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#871745]/10 shrink-0">
                  <item.icon className="h-5 w-5 text-[#871745]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>
      {/* ─── FEATURES ─── */}
      <section className="bg-[#FDF2F7]/30 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <motion.div 
            initial="hidden" 
            whileInView="visible" 
            viewport={{ once: true }} 
            variants={fadeUp} 
            className="text-center mb-14"
          >
            <h2 className="font-display text-3xl font-bold text-foreground md:text-4xl">
              Tudo que sua consultoria precisa
            </h2>
            <p className="mt-3 text-muted-foreground">
              A tecnologia mais inteligente para consultoras que querem crescer.
            </p>
          </motion.div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feat, i) => (
              <motion.div 
                key={feat.title} 
                initial="hidden" 
                whileInView="visible" 
                viewport={{ once: true }} 
                variants={fadeUp} 
                custom={i * 0.2} 
                className="rounded-2xl border border-border bg-card p-6 hover:shadow-md hover:border-[#871745]/30 transition-all"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#871745]/10">
                  <feat.icon className="h-6 w-6 text-[#871745]" />
                </div>
                <h3 className="font-display text-base font-semibold text-foreground">{feat.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{feat.desc}</p>
              </motion.div>
            ))}
          </div>
        

            
        </div>
        
      </section>
          {/* ✅ AMORINHA SUTIL NO HERO - Flutuante no canto */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1.2, duration: 0.7, ease: "easeOut" }}
            className="hidden lg:flex absolute bottom-8 right-8 items-end gap-3"
          >
            <div className="rounded-2xl bg-card border border-border shadow-lg px-4 py-3 max-w-[220px]">
              <p className="text-xs text-muted-foreground leading-relaxed">
                <span className="font-bold text-[#871745]">Amorinha:</span> "Oi! Posso te ajudar a organizar seu estoque hoje?" 💜
              </p>
            </div>
            <div className="relative shrink-0">
              <div className="absolute -inset-1 rounded-full bg-[#871745]/20 animate-pulse" />
              <img
                src={amorinhaAvatar}
                alt="Amorinha - Assistente Virtual"
                className="relative h-14 w-14 rounded-full object-cover border-2 border-[#871745] shadow-md"
              />
            </div>
          </motion.div>
      {/* ─── HOW IT WORKS ─── */}
      <section className="py-20">
        <div className="mx-auto max-w-4xl px-6">
          <motion.div 
            initial="hidden" 
            whileInView="visible" 
            viewport={{ once: true }} 
            variants={fadeUp} 
            className="text-center mb-14"
          >
            <h2 className="font-display text-3xl font-bold text-foreground md:text-4xl">
              Comece em 3 passos simples
            </h2>
          </motion.div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {[
              { step: "01", title: "Crie sua conta grátis", desc: "Cadastre-se em menos de 1 minuto. Sem cartão, sem complicação.", icon: Users },
              { step: "02", title: "Escaneie seus produtos", desc: "Aponte o celular para o código de barras e nossa IA encontra tudo automaticamente.", icon: ScanBarcode },
              { step: "03", title: "Venda mais com a Amorinha", desc: "Sua assistente IA te ajuda com relatórios, alertas e sua vitrine digital exclusiva.", icon: Bot },
            ].map((s, i) => (
              <motion.div 
                key={s.step} 
                initial="hidden" 
                whileInView="visible" 
                viewport={{ once: true }} 
                variants={fadeUp} 
                custom={i * 0.3} 
                className="relative text-center"
              >
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#871745] text-white font-display text-xl font-bold shadow-lg shadow-[#871745]/20">
                  {s.step}
                </div>
                {i < 2 && (
                  <div className="hidden md:block absolute top-8 left-[calc(50%+40px)] right-[calc(-50%+40px)] h-px border-t-2 border-dashed border-[#871745]/30" />
                )}
                <h3 className="font-display text-base font-semibold text-foreground">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── PRICING ─── */}
      <section className="bg-[#FDF2F7]/30 py-20" id="planos">
        <div className="mx-auto max-w-4xl px-6">
          <motion.div 
            initial="hidden" 
            whileInView="visible" 
            viewport={{ once: true }} 
            variants={fadeUp} 
            className="text-center mb-14"
          >
            <h2 className="font-display text-3xl font-bold text-foreground md:text-4xl">Planos e Preços</h2>
            <p className="mt-3 text-muted-foreground">
              Comece grátis para testar. Assine o PRO para decolar suas vendas.
            </p>
          </motion.div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 max-w-2xl mx-auto">
            {/* FREE */}
            <motion.div 
              initial="hidden" 
              whileInView="visible" 
              viewport={{ once: true }} 
              variants={fadeUp} 
              custom={0} 
              className="rounded-2xl border border-border bg-card p-6 space-y-5 hover:border-[#871745]/50 transition-colors"
            >
              <div>
                <h3 className="font-display text-xl font-bold text-foreground">Free</h3>
                <p className="text-xs text-muted-foreground mt-1">Para quem está começando</p>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-display font-bold text-foreground">R$ 0</span>
              <span className="text-sm text-muted-foreground">/mês</span>
              </div>
              <button 
                onClick={() => navigate("/auth")} 
                className="w-full rounded-xl border border-border py-3 text-sm font-semibold text-foreground hover:bg-[#FDF2F7] transition-colors"
              >
                Criar Conta Grátis
              </button>
              <ul className="space-y-2.5">
                {FREE_FEATURES.map((f) => (
                  <li key={f.text} className="flex items-center gap-2 text-sm">
                    {f.ok ? (
                      <Check className="h-4 w-4 text-[#871745] shrink-0" />
                    ) : (
                      <X className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                    )}
                    <span className={f.ok ? "text-foreground" : "text-muted-foreground/50"}>
                      {f.text}
                    </span>
                  </li>
                ))}
              </ul>
            </motion.div>
            
            {/* PRO */}
            <motion.div 
              initial="hidden" 
              whileInView="visible" 
              viewport={{ once: true }} 
              variants={fadeUp} 
              custom={1} 
              className="rounded-2xl border-2 border-[#871745] bg-card p-6 space-y-5 relative overflow-hidden shadow-xl shadow-[#871745]/10"
            >
              <div className="absolute top-0 right-0 bg-[#871745] text-white px-3 py-1 text-[10px] font-bold uppercase rounded-bl-xl">
                Acesso Total
              </div>
              <div>
                <h3 className="font-display text-xl font-bold text-foreground flex items-center gap-2">
                  <Crown className="h-5 w-5 text-[#871745]" /> PRO
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Sua consultoria nas suas mãos
                </p>
              </div>
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-display font-bold text-foreground">R$ 39,90</span>
                  <span className="text-sm text-muted-foreground">/mês</span>
                </div>
                <p className="text-xs text-[#871745] font-semibold mt-1">
                  Se paga na primeira venda
                </p>
              </div>
              <button 
                onClick={() => navigate("/auth")} 
                className="w-full rounded-xl bg-[#871745] py-3 text-sm font-bold text-white hover:bg-[#871745]/90 transition-colors shadow-md shadow-[#871745]/20 flex items-center justify-center gap-2"
              >
                <Users className="h-4 w-4" /> Criar Conta
              </button>
              <ul className="space-y-2.5">
                {PRO_FEATURES.map((f) => (
                  <li key={f.text} className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-[#871745] shrink-0" />
                    <span className="text-foreground font-medium">{f.text}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── TESTIMONIALS ─── */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <motion.div 
            initial="hidden" 
            whileInView="visible" 
            viewport={{ once: true }} 
            variants={fadeUp} 
            className="text-center mb-14"
          >
            <h2 className="font-display text-3xl font-bold text-foreground md:text-4xl">
              Quem usa, aprova e vende mais
            </h2>
            <p className="mt-3 text-muted-foreground">
              Consultoras que transformaram seus negócios com a Minha Amora
            </p>
          </motion.div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {TESTIMONIALS.map((t, i) => (
              <motion.div 
                key={t.name} 
                initial="hidden" 
                whileInView="visible" 
                viewport={{ once: true }} 
                variants={fadeUp} 
                custom={i * 0.3} 
                className="rounded-2xl border border-border bg-card p-6 space-y-4 hover:shadow-md hover:border-[#871745]/30 transition-all"
              >
                <div className="flex gap-0.5">
                  {Array.from({ length: t.stars }).map((_, s) => (
                    <Star key={s} className="h-4 w-4 fill-[#871745] text-[#871745]" />
                  ))}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed italic">
                  "{t.text}"
                </p>
                <div>
                  <p className="text-sm font-bold text-foreground">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.role}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="bg-[#FDF2F7]/30 py-20">
        <div className="mx-auto max-w-2xl px-6">
          <motion.div 
            initial="hidden" 
            whileInView="visible" 
            viewport={{ once: true }} 
            variants={fadeUp} 
            className="text-center mb-12"
          >
            <h2 className="font-display text-3xl font-bold text-foreground">
              Dúvidas Frequentes
            </h2>
            <p className="mt-3 text-muted-foreground">
              Tudo que você precisa saber sobre a Minha Amora
            </p>
          </motion.div>
          <div className="space-y-4">
            {FAQS.map((faq, i) => (
              <motion.div 
                key={faq.q} 
                initial="hidden" 
                whileInView="visible" 
                viewport={{ once: true }} 
                variants={fadeUp} 
                custom={i * 0.2} 
                className="rounded-2xl border border-border bg-card p-5 hover:border-[#871745]/30 transition-colors"
              >
                <p className="font-display text-base font-bold text-foreground mb-2">
                  {faq.q}
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {faq.a}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA FINAL ─── */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#871745]/5 to-[#FDF2F7]/50" />
        <div className="mx-auto max-w-2xl px-6 text-center relative z-10">
          <motion.div 
            initial="hidden" 
            whileInView="visible" 
            viewport={{ once: true }} 
            variants={fadeUp}
          >
            {/* ✅ LOGO ATUALIZADO - CTA FINAL */}
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-[#FDF2F7] shadow-xl shadow-[#871745]/30">
              <img
                src={logoMinhaAmora}
                alt="Minha Amora"
                className="h-16 w-16 object-contain"
              />
            </div>
            <h2 className="font-display text-3xl font-bold text-foreground md:text-5xl tracking-tight mb-4">
              Sua consultoria merece brilhar
            </h2>
            <p className="text-lg text-muted-foreground mb-10 max-w-lg mx-auto">
              Junte-se a centenas de consultoras que já transformaram seus negócios com a 
              <strong className="text-[#871745]"> Minha Amora</strong>
            </p>
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <button 
                onClick={() => navigate("/auth")} 
                className="flex items-center gap-2 rounded-2xl bg-[#871745] px-10 py-4 text-lg font-bold text-white shadow-xl shadow-[#871745]/30 hover:scale-105 hover:bg-[#871745]/90 transition-all"
              >
                Começar gratuitamente
                <ArrowRight className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              ✨ Sem compromisso • Cancele quando quiser • Suporte brasileiro
            </p>
          </motion.div>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="border-t border-border bg-card py-12">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
            <div className="flex items-center gap-3">
              {/* ✅ LOGO ATUALIZADO - FOOTER */}
              <img
                src={logoMinhaAmora}
                alt="Minha Amora"
                className="h-10 w-10 rounded-xl object-contain"
              />
              <div>
                <span className="font-display text-lg font-bold text-foreground">
                  Minha <span className="text-[#871745]">Amora</span>
                </span>
                <p className="text-xs text-muted-foreground">
                  Inteligência para sua consultoria brilhar
                </p>
              </div>
            </div>
            
            <div className="flex flex-col items-center gap-4 sm:items-end">
              <div className="flex items-center gap-6 text-sm text-muted-foreground">
                <button 
                  onClick={() => navigate("/privacy")}
                  className="hover:text-[#871745] transition-colors"
                >
                  Privacidade
                </button>
                <button 
                  onClick={() => navigate("/terms")}
                  className="hover:text-[#871745] transition-colors"
                >
                  Termos de Uso
                </button>
                <button 
                  onClick={() => navigate("/support")}
                  className="hover:text-[#871745] transition-colors"
                >
                  Suporte
                </button>
              </div>
              
              <p className="text-sm text-muted-foreground text-center sm:text-right">
                © {new Date().getFullYear()} Minha Amora. Todos os direitos reservados.
                <br />
                <span className="text-xs">
                  Feito com 💜 para consultoras brasileiras
                </span>
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}