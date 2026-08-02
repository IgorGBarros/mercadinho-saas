// pages/Settings.tsx — VERSÃO REFATORADA COM TEMA DINÂMICO
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Save, Loader2, LogOut, Sun, Moon, Monitor, Bell, } from "lucide-react";
import { inventoryApi, movementsApi, InventoryItem, Movement } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../hooks/useTheme";
import { useToast } from '../components/ui/use-toast';// ✅ Importar useToast original para evitar dependência circular
import PrivacySettings from "../components/PrivacySettings";

export default function Settings() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();

  const [saving, setSaving] = useState(false);

  const [expiryDays, setExpiryDays] = useState(() => {
    return parseInt(localStorage.getItem("expiry_alert_days") || "30", 10);
  });

  const [expiryEnabled, setExpiryEnabled] = useState(() => {
    return localStorage.getItem("expiry_alert_enabled") !== "false";
  });

  const [notifPrefs, setNotifPrefs] = useState(() => ({
    sales_milestones: localStorage.getItem("notif_sales_milestones") !== "false",
    weekly_insights: localStorage.getItem("notif_weekly_insights") !== "false",
    low_stock: localStorage.getItem("notif_low_stock") !== "false",
    expiry_alerts: localStorage.getItem("expiry_alert_enabled") !== "false",
  }));

  const toggleNotif = (key: keyof typeof notifPrefs) => {
    setNotifPrefs((prev) => {
      const updated = { ...prev, [key]: !prev[key] };
      localStorage.setItem(`notif_${key}`, String(updated[key]));
      if (key === "expiry_alerts") {
        localStorage.setItem("expiry_alert_enabled", String(updated[key]));
        setExpiryEnabled(updated[key]);
      }
      return updated;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setTimeout(() => {
      localStorage.setItem("expiry_alert_days", String(expiryDays));
      localStorage.setItem("expiry_alert_enabled", String(expiryEnabled));
      toast({ title: "Configurações do sistema salvas!" });
      setSaving(false);
    }, 500);
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/auth");
  };

  // ── Export CSV ──

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob(["\uFEFF" + content], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const themeOptions = [
    { value: "light" as const, icon: Sun, label: "Claro" },
    { value: "dark" as const, icon: Moon, label: "Escuro" },
    { value: "system" as const, icon: Monitor, label: "Sistema" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* ══════════════════════════════════════════
          HEADER
          ══════════════════════════════════════════ */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-6 py-4">
          <button
            onClick={() => navigate("/")}
            className="rounded-lg p-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="font-display text-lg font-bold text-foreground">
            Configurações do Sistema
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-6 py-6 space-y-5">
        {/* ══════════════════════════════════════════
            TEMA / APARÊNCIA
            ══════════════════════════════════════════ */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h2 className="font-display text-sm font-semibold text-foreground flex items-center gap-2">
            <Sun className="h-4 w-4 text-brand" /> Aparência
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {themeOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setTheme(opt.value)}
                className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all ${
                  theme === opt.value
                    ? "border-brand bg-brand/5"
                    : "border-border hover:border-brand/30"
                }`}
              >
                <opt.icon
                  className={`h-5 w-5 ${
                    theme === opt.value ? "text-brand" : "text-muted-foreground"
                  }`}
                />
                <span className="text-xs font-medium text-foreground">
                  {opt.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ══════════════════════════════════════════
            ALERTAS E NOTIFICAÇÕES
            ══════════════════════════════════════════ */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h2 className="font-display text-sm font-semibold text-foreground flex items-center gap-2">
            <Bell className="h-4 w-4 text-brand" /> Alertas e Notificações
          </h2>
          <p className="text-xs text-muted-foreground">
            Escolha quais notificações visuais deseja ativar no aplicativo.
          </p>
          {[
            {
              key: "sales_milestones" as const,
              label: "Metas de Vendas",
              desc: "Aviso ao atingir metas de faturamento (R$500, R$1.000, etc.)",
            },
            {
              key: "weekly_insights" as const,
              label: "Resumo Semanal",
              desc: "Produtos mais vendidos da semana",
            },
            {
              key: "low_stock" as const,
              label: "Estoque Baixo",
              desc: "Alerta quando produtos atingem quantidade mínima",
            },
            {
              key: "expiry_alerts" as const,
              label: "Validade Próxima",
              desc: "Destaque produtos próximos do vencimento",
            },
          ].map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between py-2 border-b border-border last:border-0"
            >
              <div>
                <p className="text-sm font-medium text-foreground">
                  {item.label}
                </p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
              <button
                onClick={() => toggleNotif(item.key)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                  notifPrefs[item.key] ? "bg-brand" : "bg-muted"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    notifPrefs[item.key] ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </button>
            </div>
          ))}

          {notifPrefs.expiry_alerts && (
            <div className="pt-2">
              <label className="text-sm text-muted-foreground">
                Alertar quantos dias antes do vencimento?
              </label>
              <div className="mt-2 flex items-center gap-3">
                {[7, 15, 30, 60, 90].map((d) => (
                  <button
                    key={d}
                    onClick={() => setExpiryDays(d)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                      expiryDays === d
                        ? "bg-brand text-white"
                        : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                    }`}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════
            PRIVACIDADE (LGPD)
            ══════════════════════════════════════════ */}
        <PrivacySettings />

        {/* ══════════════════════════════════════════
            SALVAR
            ══════════════════════════════════════════ */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50 transition-all active:scale-95"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Salvar Configurações
        </button>

        {/* ══════════════════════════════════════════
            LOGOUT
            ══════════════════════════════════════════ */}
        <button
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-destructive/30 py-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/5"
        >
          <LogOut className="h-4 w-4" /> Sair da Conta
        </button>
      </main>
    </div>
  );
}