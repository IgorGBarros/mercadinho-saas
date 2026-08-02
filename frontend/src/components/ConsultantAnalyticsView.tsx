import { useState } from "react";
import {
  TrendingUp, TrendingDown, Package, ShoppingCart, AlertTriangle,
  Activity, Star, Loader2, Brain, ChevronRight, BarChart3,
  Skull, Clock, Zap, Target, Award,
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";

interface ConsultantAnalyticsViewProps {
  analytics: any;
  insights: any | null;
  insightsLoading: boolean;
  onRequestInsights: () => void;
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(var(--destructive))",
  "hsl(210, 60%, 50%)",
  "hsl(160, 60%, 45%)",
  "hsl(45, 80%, 55%)",
  "hsl(280, 50%, 55%)",
];

const gradeColors: Record<string, string> = {
  A: "text-emerald-500",
  B: "text-primary",
  C: "text-yellow-500",
  D: "text-orange-500",
  E: "text-destructive",
};

const insightIcons: Record<string, { icon: typeof Star; color: string }> = {
  positive: { icon: Star, color: "text-emerald-500" },
  warning: { icon: AlertTriangle, color: "text-yellow-500" },
  critical: { icon: Skull, color: "text-destructive" },
};

export default function ConsultantAnalyticsView({
  analytics,
  insights,
  insightsLoading,
  onRequestInsights,
}: ConsultantAnalyticsViewProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "sales" | "stock" | "ai">("overview");

  const score = analytics.score;
  const pp = analytics.purchase_patterns;
  const sp = analytics.sales_performance;
  const sh = analytics.stock_health;

  const radarData = [
    { subject: "Vendas", value: score.sales },
    { subject: "Estoque", value: score.stock_health },
    { subject: "Engajamento", value: score.engagement },
    { subject: "Giro", value: score.turnover },
    { subject: "Diversidade", value: score.diversity },
  ];

  const tabs = [
    { id: "overview" as const, label: "Visão Geral", icon: BarChart3 },
    { id: "sales" as const, label: "Vendas", icon: ShoppingCart },
    { id: "stock" as const, label: "Estoque", icon: Package },
    { id: "ai" as const, label: "IA Insights", icon: Brain },
  ];

  return (
    <div className="space-y-4 animate-in slide-in-from-bottom-3">
      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-secondary/50 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              if (tab.id === "ai" && !insights && !insightsLoading) onRequestInsights();
            }}
            className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors flex-1 justify-center ${
              activeTab === tab.id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── Overview Tab ── */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          {/* Score Card */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Award className="h-4 w-4 text-primary" /> Score Geral
              </h3>
              <div className="flex items-center gap-2">
                <span className={`text-3xl font-black ${gradeColors[score.grade]}`}>{score.grade}</span>
                <span className="text-2xl font-bold text-foreground">{score.overall}</span>
                <span className="text-xs text-muted-foreground">/100</span>
              </div>
            </div>

            {/* Score Breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-3">
                {[
                  { label: "Vendas", value: score.sales, icon: ShoppingCart },
                  { label: "Saúde do Estoque", value: score.stock_health, icon: Activity },
                  { label: "Engajamento", value: score.engagement, icon: Zap },
                  { label: "Giro", value: score.turnover, icon: TrendingUp },
                  { label: "Diversidade", value: score.diversity, icon: Target },
                ].map((item) => (
                  <div key={item.label} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <item.icon className="h-3 w-3" /> {item.label}
                      </span>
                      <span className="font-bold text-foreground">{item.value}</span>
                    </div>
                    <Progress value={item.value} className="h-1.5" />
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-center">
                <ResponsiveContainer width="100%" height={200}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="hsl(var(--border))" />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                    <Radar dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} strokeWidth={2} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Quick KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Receita Total", value: `R$ ${sp.total_revenue.toLocaleString("pt-BR")}`, icon: TrendingUp, color: "text-emerald-500" },
              { label: "Produtos", value: sh.total_products, icon: Package, color: "text-primary" },
              { label: "Investido", value: `R$ ${pp.total_cost_invested.toLocaleString("pt-BR")}`, icon: ShoppingCart, color: "text-accent" },
              { label: "Giro/Mês", value: `${sh.stock_turnover_monthly}x`, icon: Activity, color: "text-muted-foreground" },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-lg border border-border bg-card p-3">
                <kpi.icon className={`h-4 w-4 ${kpi.color} mb-1`} />
                <p className="text-lg font-bold text-foreground">{kpi.value}</p>
                <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
              </div>
            ))}
          </div>

          {/* Categories Pie */}
          {pp.top_categories.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-bold text-foreground mb-3">Estoque por Categoria</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={pp.top_categories}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {pp.top_categories.map((_: any, idx: number) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* ── Sales Tab ── */}
      {activeTab === "sales" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: "Receita 30d", value: `R$ ${sp.revenue_last_30.toLocaleString("pt-BR")}` },
              { label: "Unidades 30d", value: sp.units_last_30 },
              { label: "Unidades 7d", value: sp.units_last_7 },
              { label: "Ticket Médio", value: `R$ ${sp.avg_ticket.toLocaleString("pt-BR")}` },
              { label: "Total Vendido", value: sp.total_units_sold },
              { label: "Reposições/mês", value: pp.restock_frequency_monthly },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-lg border border-border bg-card p-3">
                <p className="text-lg font-bold text-foreground">{kpi.value}</p>
                <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
              </div>
            ))}
          </div>

          {/* Top Products Bar */}
          {sp.top_products.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-bold text-foreground mb-3">Top Produtos por Receita</h3>
              <ResponsiveContainer width="100%" height={Math.max(200, sp.top_products.length * 35)}>
                <BarChart data={sp.top_products} layout="vertical" margin={{ left: 100 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={95}
                    tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                  />
                  <Tooltip formatter={(v: number) => `R$ ${v.toLocaleString("pt-BR")}`} />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Sale Types */}
          {Object.keys(sp.sale_types).length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-bold text-foreground mb-3">Tipos de Saída</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(sp.sale_types).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between rounded-lg bg-secondary/30 px-3 py-2">
                    <span className="text-xs font-medium text-foreground capitalize">{type.replace("_", " ")}</span>
                    <Badge variant="secondary" className="text-[10px]">{count as number}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Stock Tab ── */}
      {activeTab === "stock" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Sem Estoque", value: sh.out_of_stock, critical: sh.out_of_stock > 0 },
              { label: "Estoque Baixo", value: sh.low_stock, critical: sh.low_stock > 3 },
              { label: "Vencidos", value: sh.expired, critical: sh.expired > 0 },
              { label: "Vencendo 30d", value: sh.expiring_in_30, critical: sh.expiring_in_30 > 2 },
              { label: "Estoque Morto", value: sh.dead_stock, critical: sh.dead_stock > 5 },
              { label: "Taxa de Perda", value: `${sh.loss_rate_percent}%`, critical: sh.loss_rate_percent > 5 },
              { label: "Total Unidades", value: sh.total_units, critical: false },
              { label: "Giro Mensal", value: `${sh.stock_turnover_monthly}x`, critical: sh.stock_turnover_monthly < 0.5 },
            ].map((kpi) => (
              <div key={kpi.label} className={`rounded-lg border p-3 ${
                kpi.critical ? "border-destructive/30 bg-destructive/5" : "border-border bg-card"
              }`}>
                <p className={`text-lg font-bold ${kpi.critical ? "text-destructive" : "text-foreground"}`}>
                  {kpi.value}
                </p>
                <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
              </div>
            ))}
          </div>

          {/* Expiring Products */}
          {sh.expiring_products.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4 text-destructive" /> Produtos por Validade
              </h3>
              <div className="space-y-2">
                {sh.expiring_products.map((p: any, i: number) => (
                  <div key={i} className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                    p.days_until < 0 ? "bg-destructive/10" : p.days_until <= 30 ? "bg-yellow-500/10" : "bg-secondary/30"
                  }`}>
                    <div>
                      <p className="text-xs font-medium text-foreground">{p.name}</p>
                      <p className="text-[10px] text-muted-foreground">{p.quantity} un.</p>
                    </div>
                    <Badge variant={p.days_until < 0 ? "destructive" : p.days_until <= 30 ? "outline" : "secondary"} className="text-[10px]">
                      {p.days_until < 0 ? `Vencido ${Math.abs(p.days_until)}d` : `${p.days_until}d restantes`}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dead Stock */}
          {sh.dead_stock_products.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                <Skull className="h-4 w-4 text-muted-foreground" /> Estoque Morto (sem giro 90d)
              </h3>
              <div className="space-y-2">
                {sh.dead_stock_products.map((p: any, i: number) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-secondary/30 px-3 py-2">
                    <p className="text-xs font-medium text-foreground">{p.name}</p>
                    <div className="text-right">
                      <p className="text-xs font-bold text-foreground">{p.quantity} un.</p>
                      <p className="text-[10px] text-muted-foreground">R$ {p.cost_price}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── AI Insights Tab ── */}
      {activeTab === "ai" && (
        <div className="space-y-4">
          {insightsLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Brain className="h-10 w-10 text-primary animate-pulse" />
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">A IA está analisando o comportamento...</p>
            </div>
          ) : insights ? (
            <>
              {/* Score Analysis */}
              {insights.score_analysis && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                  <p className="text-sm text-foreground">{insights.score_analysis}</p>
                </div>
              )}

              {/* Insights */}
              <div className="space-y-3">
                {insights.insights?.map((insight: any, i: number) => {
                  const config = insightIcons[insight.type] || insightIcons.warning;
                  const Icon = config.icon;
                  return (
                    <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2">
                      <div className="flex items-start gap-2">
                        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${config.color}`} />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-foreground">{insight.title}</p>
                          <p className="text-xs text-muted-foreground mt-1">{insight.description}</p>
                        </div>
                      </div>
                      <div className="ml-6 rounded-lg bg-secondary/50 px-3 py-2">
                        <p className="text-xs font-medium text-primary flex items-center gap-1">
                          <ChevronRight className="h-3 w-3" /> {insight.action}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Recommendations */}
              {insights.recommendations?.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                    <Target className="h-4 w-4 text-primary" /> Recomendações
                  </h3>
                  <div className="space-y-2">
                    {insights.recommendations.map((rec: string, i: number) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                          {i + 1}
                        </span>
                        <p className="text-xs text-foreground">{rec}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Summary */}
              {insights.summary && (
                <div className="rounded-xl bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 p-4 text-center">
                  <p className="text-sm font-medium text-foreground">✨ {insights.summary}</p>
                </div>
              )}

              <button
                onClick={onRequestInsights}
                className="w-full text-center text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                Gerar novos insights
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Brain className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Clique para gerar insights com IA</p>
              <button
                onClick={onRequestInsights}
                className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
              >
                Analisar com IA
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
