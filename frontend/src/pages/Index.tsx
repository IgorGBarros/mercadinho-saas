// pages/Index.tsx — VERSÃO SEGURA E OTIMIZADA
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  Package, TrendingDown, DollarSign, BarChart3, ScanBarcode, List,
  ArrowDownCircle, Settings, PieChart, Store, History, User, Bell, CheckCircle2,
  Users,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { statsApi } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { useFeatureGates } from "../hooks/useFeatureGates";
import { ChatAssistant } from "../components/ChatAssistant";
import ProBadge from "../components/ProBadge";
import UpgradeModal from "../components/UpgradeModal";
import ProfileCompletionBanner from "../components/ProfileCompletionBanner";
import amorinhaAvatar from "../assets/amorinha-avatar.png";
import AiTrainingConsentBanner from "@/components/AitrainingConsentBanner";
import { useSystemConfig } from "../hooks/useSystemConfig";

interface Stats {
  investedValue: number;
  potentialValue: number;
  projectedProfit: number;
  monthSales: number;
  monthProfit: number;
}

export default function Index() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isLocked, loading: gatesLoading } = useFeatureGates();
  const { aiEnabled } = useSystemConfig();
  const [stats, setStats] = useState<Stats>({
    investedValue: 0,
    potentialValue: 0,
    projectedProfit: 0,
    monthSales: 0,
    monthProfit: 0,
  });
  const [loading, setLoading] = useState(true);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeCtx, setUpgradeCtx] = useState({ feature: "", description: "" });
  const [storeSlug, setStoreSlug] = useState<string | null>(null);
  const [showNotif, setShowNotif] = useState(false);

  useEffect(() => {
    if (!user) return;

    // ✅ store_slug já vem no objeto `user` do useAuth (o login espalha o
    // profile inteiro nele) — não precisa de outra chamada a /profile/.
    // Era esta busca extra que disparava GET /profile/ toda vez que se
    // voltava para a home.
    setStoreSlug((user as any).store_slug ?? null);

    const fetchData = async () => {
      try {
        // statsApi.getDashboard() tem cache de 30s + deduplicação — voltar
        // pra home dentro da janela não gera requisição de rede.
        const statsRes = await statsApi.getDashboard();
        setStats(statsRes);
      } catch (err) {
        console.error("Erro ao carregar estatísticas:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    // ✅ Depender de user?.id (primitivo), não do objeto inteiro: o useAuth
    // recria o objeto em vários momentos e isso re-disparava este efeito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  const statCards = [
    { label: "Valor Investido", value: fmt(stats.investedValue), icon: Package, color: "text-muted-foreground" },
    { label: "Potencial de Venda", value: fmt(stats.potentialValue), icon: DollarSign, color: "text-brand" },
    { label: "Lucro Estimado Geral", value: fmt(stats.projectedProfit), icon: BarChart3, color: "text-success" },
    { label: "Vendas deste Mês", value: fmt(stats.monthSales), icon: TrendingDown, color: "text-foreground" },
    { label: "Lucro Real do Mês", value: fmt(stats.monthProfit), icon: BarChart3, color: "text-success" },
  ];

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* ══ HEADER ══ */}
      <header className="sticky top-0 z-20 border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full overflow-hidden border-2 border-brand/20 shadow-sm">
              <img
                src={amorinhaAvatar}
                alt="Minha Amora"
                className="h-full w-full object-cover"
                onError={(e) => {
                  const parent = (e.target as HTMLImageElement).parentElement!;
                  parent.innerHTML = '';
                  parent.className = "flex h-10 w-10 items-center justify-center rounded-full bg-brand shadow-sm";
                  const icon = document.createElement('span');
                  icon.textContent = '🍇';
                  icon.className = 'text-lg';
                  parent.appendChild(icon);
                }}
              />
            </div>
            <div>
              <h1 className="font-display text-lg font-bold text-foreground">Minha Amora</h1>
              <p className="text-xs text-muted-foreground">Gestão inteligente de estoque</p>
            </div>
          </div>

          <div className="flex items-center gap-1 relative">
            <button
              onClick={() => setShowNotif(!showNotif)}
              className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              <Bell className="h-5 w-5" />
            </button>
            <AnimatePresence>
              {showNotif && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 top-12 mt-2 w-72 bg-card border border-border rounded-xl shadow-xl p-4 z-50"
                >
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-foreground">Tudo tranquilo por aqui!</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Você não possui nenhum alerta de estoque baixo ou validade no momento.
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <button onClick={() => navigate("/profile")} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
              <User className="h-5 w-5" />
            </button>
            <button onClick={() => navigate("/settings")} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
              <Settings className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* ══ MAIN ══ */}
      <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        <ProfileCompletionBanner />
        <AiTrainingConsentBanner />

        {/* CARDS FINANCEIROS */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {statCards.map((stat) => (
            <div key={stat.label} className="rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-md">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase text-muted-foreground">{stat.label}</span>
                <stat.icon className={`h-4 w-4 ${stat.color} opacity-70`} />
              </div>
              <p className={`font-display text-2xl font-bold ${stat.color}`}>
                {loading ? <span className="animate-pulse text-muted-foreground/50">R$ ...</span> : stat.value}
              </p>
            </div>
          ))}
        </div>

        {/* BOTÕES DE AÇÃO */}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <ActionBtn onClick={() => navigate("/add")} icon={ScanBarcode} label="Cadastrar" desc="Escanear entrada" primary />
          <ActionBtn onClick={() => navigate("/withdraw")} icon={ArrowDownCircle} label="Baixa" desc="Registrar saída" />
          <ActionBtn onClick={() => navigate("/products")} icon={List} label="Meu Estoque" desc="Lista completa" />
          <ActionBtn onClick={() => navigate("/history")} icon={History} label="Extrato" desc="Movimentações" />
          <ActionBtn onClick={() => navigate("/crm")} icon={Users} label="Meus Clientes" desc="Quem comprou na vitrine" />
          <ActionBtn
            onClick={() => {
              // Bloqueado: oferece o upgrade em vez de levar a uma tela que
              // vai negar o acesso.
              if (isLocked("dashboard_charts")) {
                setUpgradeCtx({ feature: "Dashboard", description: "Veja lucro real, fluxo de caixa e gráficos das suas vendas." });
                setShowUpgrade(true);
              } else {
                navigate("/dashboard");
              }
            }}
            icon={PieChart}
            label="Dashboard"
            desc="Gráficos e análises"
            proBadge={isLocked("dashboard_charts")}
            proBadgeLoading={gatesLoading}
          />
          <ActionBtn
            onClick={() => {
              if (isLocked("storefront")) {
                setUpgradeCtx({ feature: "Vitrine Digital", description: "Crie sua loja online e venda pelo WhatsApp automaticamente." });
                setShowUpgrade(true);
              } else if (storeSlug) {
                window.open(`${window.location.origin}/vitrine/${storeSlug}`, "_blank");
              } else {
                navigate("/profile");
              }
            }}
            icon={Store}
            label="Vitrine"
            desc="Sua loja online"
            proBadge={isLocked("storefront")}
            proBadgeLoading={gatesLoading}
          />
        </div>

        <div className="mt-10 text-center text-sm text-muted-foreground bg-brand-soft p-4 rounded-xl border border-brand/10">
          {gatesLoading ? (
            <div className="flex items-center justify-center gap-2 animate-pulse">
              <div className="h-6 w-6 rounded-full bg-brand/15" />
              <span className="h-3 w-48 rounded bg-brand/15" />
            </div>
          ) : !isLocked("chat_assistant") ? (
            <div className="flex items-center justify-center gap-2">
              <div className="h-6 w-6 rounded-full overflow-hidden border border-brand/20">
                <img src={amorinhaAvatar} alt="Amorinha" className="h-full w-full object-cover" />
              </div>
              <span>
                Converse com a <strong className="text-brand">Amorinha</strong> no canto inferior direito 💜
              </span>
            </div>
          ) : (
            <span>🔒 A Amorinha é uma funcionalidade exclusiva do plano PRO</span>
          )}
        </div>
      </main>

      {/* ⚙️ Além do gate por plano (chat_assistant), agora também respeita o
          flag global "Assistente IA" do admin-panel — antes essa flag não
          controlava nada de verdade, era só localStorage sem consumidor. */}
      {!gatesLoading && !isLocked("chat_assistant") && aiEnabled && <ChatAssistant />}
      <UpgradeModal
        isOpen={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        feature={upgradeCtx.feature}
        description={upgradeCtx.description}
      />
    </div>
  );
}

/* ══ ACTION BUTTON ══ */
function ActionBtn({
  onClick,
  icon: Icon,
  label,
  desc,
  primary,
  proBadge,
  proBadgeLoading,
}: {
  onClick: () => void;
  icon: typeof Package;
  label: string;
  desc: string;
  primary?: boolean;
  proBadge?: boolean;
  proBadgeLoading?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl p-4 text-left transition-all hover:scale-[1.02] hover:shadow-md ${
        primary
          ? "border-2 border-brand bg-gradient-to-br from-brand to-brand-hover shadow-sm"
          : "border border-border bg-card hover:bg-brand-soft" // ✅ Corrigido: hover:bg-brand-soft
      }`}
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${primary ? "bg-white/20" : "bg-brand/10"}`}>
        <Icon className={`h-5 w-5 ${primary ? "text-white" : "text-brand"}`} />
      </div>
      <div className="min-w-0">
        <p className={`text-sm font-bold flex items-center gap-1.5 ${primary ? "text-white" : "text-foreground"}`}>
          {label}
          {proBadgeLoading ? (
            <span className="inline-block h-4 w-8 rounded-full bg-brand/15 animate-pulse" />
          ) : (
            proBadge && <ProBadge />
          )}
        </p>
        <p className={`text-xs truncate mt-0.5 ${primary ? "text-white/80" : "text-muted-foreground"}`}>
          {desc}
        </p>
      </div>
    </button>
  );
}