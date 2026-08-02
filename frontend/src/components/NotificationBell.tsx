// components/NotificationBell.tsx — VERSÃO REFATORADA COM PALETA DA MARCA
import { useState, useRef, useEffect } from "react";
import { Bell, AlertTriangle, Clock, X, ChevronRight, Trophy, Star, Flame, TrendingUp, Package, Crown, Users, Cake, ShoppingBag } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useExpiryAlerts, ExpiryAlert } from "../hooks/useExpiryAlerts";
import { useSalesNotifications, SalesMilestone, WeeklyInsight } from "../hooks/useSalesNotifications";
import { useSubscriptionAlert } from "../hooks/useSubscriptionAlert";
import { useCrmNotifications } from "../hooks/useCrmNotifications";
import { formatMoney } from "../lib/api";
import { AnimatePresence, motion } from "framer-motion";

function formatDaysLeft(days: number): string {
  if (days <= 0) return "Vencido!";
  if (days === 1) return "Vence amanhã";
  return `${days} dias`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("pt-BR");
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const { alerts: expiryAlerts, totalCount: expiryCount, criticalCount } = useExpiryAlerts();
  const { milestones, weeklyInsight, notificationCount: salesCount, dismissMilestone } = useSalesNotifications();
  const { subscriptionAlert } = useSubscriptionAlert();
  const { crmItens } = useCrmNotifications();

  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "expiry" | "sales">("all");
  const ref = useRef<HTMLDivElement>(null);

  const salesMilestonesEnabled = localStorage.getItem("notif_sales_milestones") !== "false";
  const weeklyInsightsEnabled = localStorage.getItem("notif_weekly_insights") !== "false";
  const expiryEnabled = localStorage.getItem("notif_expiry_alerts") !== "false";

  const filteredMilestones = salesMilestonesEnabled ? milestones : [];
  const filteredWeekly = weeklyInsightsEnabled ? weeklyInsight : null;
  const filteredExpiry = expiryEnabled ? expiryAlerts : [];
  const filteredExpiryCount = expiryEnabled ? expiryCount : 0;
  const filteredCritical = expiryEnabled ? criticalCount : 0;
  const filteredSalesCount = filteredMilestones.length + (filteredWeekly ? 1 : 0);
  const subCount = subscriptionAlert ? 1 : 0;
  const totalCount = filteredExpiryCount + filteredSalesCount + subCount + crmItens.length;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (totalCount === 0) {
    return (
      <div
        className="relative rounded-lg p-2 text-muted-foreground/60"
        title="Nenhuma notificação no momento"
        aria-label="Nenhuma notificação"
      >
        <Bell className="h-5 w-5" />
      </div>
    );
  }

  const hasCritical = filteredCritical > 0 || subscriptionAlert?.expired === true;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative rounded-lg p-2 text-muted-foreground hover:bg-brand-soft hover:text-brand transition-colors"
      >
        <Bell className="h-5 w-5" />
        <span
          className={`absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white ${
            hasCritical
              ? "bg-destructive"
              : filteredMilestones.length > 0
              ? "bg-brand"
              : "bg-brand-rose"
          }`}
        >
          {totalCount > 9 ? "9+" : totalCount}
        </span>
        {hasCritical && (
          <span className="absolute -right-0.5 -top-0.5 h-5 w-5 animate-ping rounded-full bg-destructive/40" />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-12 z-50 w-[calc(100vw-2rem)] max-w-[340px] rounded-xl border border-brand/15 bg-card shadow-xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-brand-peach/30 px-4 py-3">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-brand" />
                <h3 className="text-sm font-semibold text-foreground">Notificações</h3>
                <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold text-brand">
                  {totalCount}
                </span>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-brand-peach/30">
              {([
                { key: "all" as const, label: "Tudo", count: totalCount },
                { key: "sales" as const, label: "Vendas", count: filteredSalesCount },
                { key: "expiry" as const, label: "Validade", count: filteredExpiryCount },
              ]).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                    activeTab === tab.key
                      ? "border-b-2 border-brand text-brand"
                      : "text-brand-rose/70 hover:text-foreground"
                  }`}
                >
                  {tab.label}{" "}
                  {tab.count > 0 && (
                    <span className="ml-1 opacity-60">({tab.count})</span>
                  )}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="max-h-96 overflow-y-auto">
              {/* Assinatura vencendo/vencida — sempre no topo */}
              {subscriptionAlert && (
                <SubscriptionAlertItem
                  alert={subscriptionAlert}
                  onNavigate={() => {
                    setOpen(false);
                    navigate("/plans");
                  }}
                />
              )}

              {/* CRM: novos clientes, aniversários, carrinho abandonado —
                  todas levam para a central de clientes. */}
              {crmItens.map((item) => (
                <CrmNotificationItem
                  key={item.key}
                  item={item}
                  onNavigate={() => {
                    setOpen(false);
                    navigate("/crm");
                  }}
                />
              ))}

              {/* Milestones */}
              {(activeTab === "all" || activeTab === "sales") &&
                filteredMilestones.map((m) => (
                  <MilestoneItem
                    key={m.id}
                    milestone={m}
                    onDismiss={() => dismissMilestone(m.value)}
                    onNavigate={() => {
                      setOpen(false);
                      navigate("/dashboard");
                    }}
                  />
                ))}

              {/* Weekly insight */}
              {(activeTab === "all" || activeTab === "sales") && filteredWeekly && (
                <WeeklyInsightItem
                  insight={filteredWeekly}
                  onNavigate={() => {
                    setOpen(false);
                    navigate("/dashboard");
                  }}
                />
              )}

              {/* Expiry alerts */}
              {(activeTab === "all" || activeTab === "expiry") &&
                filteredExpiry
                  .slice(0, activeTab === "expiry" ? 15 : 5)
                  .map((alert) => (
                    <ExpiryAlertItem
                      key={alert.id}
                      alert={alert}
                      onNavigate={() => {
                        setOpen(false);
                        navigate(`/products/${alert.id}/edit`);
                      }}
                    />
                  ))}

              {/* Empty states */}
              {activeTab === "sales" && filteredSalesCount === 0 && (
                <div className="px-4 py-8 text-center text-xs text-brand-rose/60">
                  Nenhuma notificação de vendas
                </div>
              )}
              {activeTab === "expiry" && filteredExpiryCount === 0 && (
                <div className="px-4 py-8 text-center text-xs text-brand-rose/60">
                  Nenhum alerta de validade
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-brand-peach/30 px-4 py-2">
              <button
                onClick={() => {
                  setOpen(false);
                  navigate("/settings");
                }}
                className="w-full text-center text-xs text-brand hover:underline"
              >
                Gerenciar notificações
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Milestone Item ──
function MilestoneItem({
  milestone,
  onDismiss,
  onNavigate,
}: {
  milestone: SalesMilestone;
  onDismiss: () => void;
  onNavigate: () => void;
}) {
  const IconMap = { trophy: Trophy, star: Star, flame: Flame };
  const Icon = IconMap[milestone.icon];

  return (
    <div className="flex items-center gap-3 bg-brand-soft px-4 py-3 border-b border-brand-peach/30">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10">
        <Icon className="h-5 w-5 text-brand" />
      </div>
      <button onClick={onNavigate} className="min-w-0 flex-1 text-left">
        <p className="text-sm font-semibold text-foreground">{milestone.title}</p>
        <p className="text-[11px] text-brand-rose/70">{milestone.description}</p>
      </button>
      <button
        onClick={onDismiss}
        className="shrink-0 rounded-lg p-1 text-brand-rose/50 hover:text-foreground"
        title="Dispensar"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Weekly Insight Item ──
function WeeklyInsightItem({
  insight,
  onNavigate,
}: {
  insight: WeeklyInsight;
  onNavigate: () => void;
}) {
  return (
    <button
      onClick={onNavigate}
      className="w-full border-b border-brand-peach/30 px-4 py-3 text-left transition-colors hover:bg-brand-soft/50"
    >
      <div className="flex items-center gap-2 mb-2">
        <TrendingUp className="h-4 w-4 text-brand" />
        <span className="text-sm font-semibold text-foreground">{insight.title}</span>
      </div>
      <div className="space-y-1.5">
        {insight.products.map((p, i) => (
          <div key={p.barcode} className="flex items-center gap-2">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                i === 0
                  ? "bg-brand-peach/50 text-brand"
                  : "bg-brand-lavender/30 text-brand-rose"
              }`}
            >
              {i + 1}
            </span>
            <span className="flex-1 truncate text-xs text-foreground">
              {p.product_name}
            </span>
            <span className="text-[10px] font-mono text-brand-rose/70">
              {p.totalQty} un.
            </span>
            {p.totalRevenue > 0 && (
              <span className="text-[10px] font-mono font-medium text-brand">
                {formatMoney(p.totalRevenue)}
              </span>
            )}
          </div>
        ))}
      </div>
    </button>
  );
}

// ── Expiry Alert Item ──
function CrmNotificationItem({
  item, onNavigate,
}: {
  item: { tipo: string; titulo: string; descricao: string };
  onNavigate: () => void;
}) {
  const Icone = item.tipo === "novo_lead" ? Users
    : item.tipo === "aniversario" ? Cake
    : ShoppingBag;
  return (
    <button
      onClick={onNavigate}
      className="flex w-full items-center gap-3 border-b border-brand-peach/30 px-4 py-3 text-left transition-colors hover:bg-brand-soft/50"
    >
      <Icone className="h-4 w-4 shrink-0 text-brand" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{item.titulo}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.descricao}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

function SubscriptionAlertItem({
  alert,
  onNavigate,
}: {
  alert: { daysLeft: number; expired: boolean; expiresAt: string | null };
  onNavigate: () => void;
}) {
  const venceEm = alert.expiresAt
    ? new Date(alert.expiresAt).toLocaleDateString("pt-BR")
    : null;

  const titulo = alert.expired
    ? "Sua assinatura PRO venceu"
    : alert.daysLeft <= 1
    ? "Sua assinatura vence amanhã"
    : `Sua assinatura vence em ${alert.daysLeft} dias`;

  const descricao = alert.expired
    ? "Renove para não perder os recursos PRO"
    : venceEm
    ? `Renove até ${venceEm} para continuar`
    : "Renove para continuar com o PRO";

  return (
    <button
      onClick={onNavigate}
      className={`flex w-full items-center gap-3 border-b border-brand-peach/30 px-4 py-3 text-left transition-colors hover:bg-brand-soft/50 ${
        alert.expired ? "bg-destructive/5" : "bg-brand/5"
      }`}
    >
      <div className="shrink-0">
        {alert.expired ? (
          <AlertTriangle className="h-4 w-4 text-destructive" />
        ) : (
          <Crown className="h-4 w-4 text-brand" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{titulo}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{descricao}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

function ExpiryAlertItem({
  alert,
  onNavigate,
}: {
  alert: ExpiryAlert;
  onNavigate: () => void;
}) {
  const isCritical = alert.severity === "critical";

  return (
    <button
      onClick={onNavigate}
      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-brand-soft/50 ${
        isCritical ? "bg-destructive/5" : "bg-brand-peach/20"
      }`}
    >
      <div className="shrink-0">
        {isCritical ? (
          <AlertTriangle className="h-4 w-4 text-destructive" />
        ) : (
          <Clock className="h-4 w-4 text-brand-rose" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {alert.product_name}
        </p>
        <div className="mt-0.5 flex items-center gap-2">
          <span
            className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${
              isCritical
                ? "bg-destructive/10 text-destructive border-destructive/20"
                : "bg-brand-peach/40 text-brand-rose border-brand-peach"
            }`}
          >
            {formatDaysLeft(alert.daysLeft)}
          </span>
          <span className="text-[10px] text-brand-rose/60">
            {formatDate(alert.expiry_date)}
          </span>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-brand-rose/40" />
    </button>
  );
}