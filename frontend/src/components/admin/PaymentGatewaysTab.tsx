// src/components/admin/PaymentGatewaysTab.tsx
import { useState, useEffect } from "react";
import { useToast } from "@/components/ui/use-toast"
import { adminApi } from "../../lib/api";
import {
  AlertTriangle, Bell, Check, CheckCircle, CreditCard, ExternalLink,
  Globe, Key, Loader2, Plus, RefreshCw, Save, Settings2, Shield,
  ToggleLeft, ToggleRight, Trash2, Wifi, WifiOff, XCircle, Copy, Zap,
} from "lucide-react";
import { Badge } from "../ui/badge";

// ==========================================
// INTERFACES
// ==========================================

interface GatewayConfig {
  id: string;
  name: string;
  enabled: boolean;
  mode: "sandbox" | "production";
  publicKey: string;
  secretKey: string;
  webhookUrl: string;
  webhookSecret: string;
  supportedMethods: string[];
  notes: string;
}

interface AsaasConfig {
  environment: string;
  base_url: string;
  has_api_key: boolean;
  has_webhook_token: boolean;
  webhook_url: string;
}

interface ConnectionTestResult {
  status: "connected" | "error" | "idle" | "testing";
  balance?: number;
  environment?: string;
  message?: string;
}

// ==========================================
// CONSTANTES
// ==========================================

const DEFAULT_GATEWAYS: GatewayConfig[] = [
  {
    id: "asaas",
    name: "Asaas",
    enabled: true,
    mode: "sandbox",
    publicKey: "",
    secretKey: "",
    webhookUrl: "",
    webhookSecret: "",
    supportedMethods: ["card", "pix", "boleto"],
    notes: "Gateway principal — PIX, Boleto e Cartão para o mercado brasileiro.",
  },
  {
    id: "stripe",
    name: "Stripe",
    enabled: false,
    mode: "sandbox",
    publicKey: "",
    secretKey: "",
    webhookUrl: "",
    webhookSecret: "",
    supportedMethods: ["card"],
    notes: "Para pagamentos internacionais (futuro).",
  },
  {
    id: "mercadopago",
    name: "Mercado Pago",
    enabled: false,
    mode: "sandbox",
    publicKey: "",
    secretKey: "",
    webhookUrl: "",
    webhookSecret: "",
    supportedMethods: ["card", "pix", "boleto"],
    notes: "Alternativa para mercado brasileiro.",
  },
];

const PAYMENT_METHODS_OPTIONS = [
  { value: "card", label: "💳 Cartão" },
  { value: "pix", label: "⚡ PIX" },
  { value: "boleto", label: "📄 Boleto" },
  { value: "debit", label: "🏦 Débito" },
];

const API_BASE = (
  (import.meta as any).env?.VITE_API_BASE_URL ||
  "https://dev-brih.onrender.com"
).replace(/\/$/, "");

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================

export default function PaymentGatewaysTab() {
  const { toast } = useToast();

  // Estados
  const [gateways, setGateways] = useState<GatewayConfig[]>(() => {
    const saved = localStorage.getItem("admin_payment_gateways");
    return saved ? JSON.parse(saved) : DEFAULT_GATEWAYS;
  });
  const [editingGateway, setEditingGateway] = useState<string | null>(null);
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customName, setCustomName] = useState("");

  // Estados do Asaas (conexão real com backend)
  const [asaasConfig, setAsaasConfig] = useState<AsaasConfig | null>(null);
  const [connectionTest, setConnectionTest] = useState<ConnectionTestResult>({
    status: "idle",
  });
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // ==========================================
  // EFEITOS
  // ==========================================

  useEffect(() => {
    loadAsaasConfig();
  }, []);

  // ==========================================
  // FUNÇÕES DE API (ASAAS REAL)
  // ==========================================

  const loadAsaasConfig = async () => {
    setLoadingConfig(true);
    try {
      const data = await adminApi.getAsaasConfig();
      setAsaasConfig(data);

      // Sincroniza o gateway local com dados reais do backend
      setGateways((prev) =>
        prev.map((g) => {
          if (g.id === "asaas") {
            return {
              ...g,
              enabled: data.has_api_key,
              mode: data.environment as "sandbox" | "production",
              webhookUrl: data.webhook_url,
            };
          }
          return g;
        })
      );
    } catch (err: any) {
      console.warn("⚠️ Erro ao carregar config Asaas:", err);
      // Fallback: usa dados locais
      setAsaasConfig({
        environment: "sandbox",
        base_url: "https://sandbox.asaas.com/api/v3",
        has_api_key: false,
        has_webhook_token: false,
        webhook_url: `${API_BASE}/api/payments/asaas/webhook/`,
      });
    } finally {
      setLoadingConfig(false);
    }
  };

  const testAsaasConnection = async () => {
    setTestingConnection(true);
    setConnectionTest({ status: "testing" });
    try {
      const result = await adminApi.testAsaasConnection();
      setConnectionTest(result);
      toast({
        title:
          result.status === "connected"
            ? "✅ Conexão com Asaas OK!"
            : "❌ Falha na conexão",
        description:
          result.status === "connected"
            ? `Saldo: R$ ${result.balance?.toFixed(2) || "0.00"} | Ambiente: ${result.environment}`
            : result.message || "Verifique suas credenciais",
        variant: result.status === "connected" ? "default" : "destructive",
      });
    } catch (err: any) {
      setConnectionTest({
        status: "error",
        message: "Não foi possível conectar ao Asaas",
      });
      toast({
        title: "Erro de conexão",
        description: "Verifique se a API Key está configurada no servidor",
        variant: "destructive",
      });
    } finally {
      setTestingConnection(false);
    }
  };

  // ==========================================
  // FUNÇÕES LOCAIS (GATEWAYS)
  // ==========================================

  const saveGateways = (updated: GatewayConfig[]) => {
    setGateways(updated);
    localStorage.setItem("admin_payment_gateways", JSON.stringify(updated));
    toast({ title: "Configurações salvas" });
  };

  const toggleGateway = (id: string) => {
    const updated = gateways.map((g) =>
      g.id === id ? { ...g, enabled: !g.enabled } : g
    );
    saveGateways(updated);
  };

  const updateGateway = (
    id: string,
    field: keyof GatewayConfig,
    value: any
  ) => {
    setGateways((prev) =>
      prev.map((g) => (g.id === id ? { ...g, [field]: value } : g))
    );
  };

  const saveGateway = (id: string) => {
    localStorage.setItem("admin_payment_gateways", JSON.stringify(gateways));
    setEditingGateway(null);
    toast({ title: "Gateway atualizado" });
  };

  const toggleMethod = (gatewayId: string, method: string) => {
    setGateways((prev) =>
      prev.map((g) => {
        if (g.id !== gatewayId) return g;
        const methods = g.supportedMethods.includes(method)
          ? g.supportedMethods.filter((m) => m !== method)
          : [...g.supportedMethods, method];
        return { ...g, supportedMethods: methods };
      })
    );
  };

  const addCustomGateway = () => {
    if (!customName.trim()) return;
    const id = customName.toLowerCase().replace(/\s+/g, "_");
    if (gateways.find((g) => g.id === id)) {
      toast({ title: "Gateway já existe", variant: "destructive" });
      return;
    }
    const newGateway: GatewayConfig = {
      id,
      name: customName.trim(),
      enabled: false,
      mode: "sandbox",
      publicKey: "",
      secretKey: "",
      webhookUrl: "",
      webhookSecret: "",
      supportedMethods: ["card", "pix"],
      notes: "",
    };
    saveGateways([...gateways, newGateway]);
    setCustomName("");
    setShowAddCustom(false);
  };

  const removeGateway = (id: string) => {
    if (
      !confirm(
        `Remover gateway "${gateways.find((g) => g.id === id)?.name}"?`
      )
    )
      return;
    saveGateways(gateways.filter((g) => g.id !== id));
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
    toast({ title: "Copiado!" });
  };

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <div className="space-y-6">
      {/* ─── HEADER ─── */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Gateways de Pagamento</h2>
          <p className="text-muted-foreground">
            Configure provedores de pagamento para o Minha Amora PRO
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadAsaasConfig}
            disabled={loadingConfig}
            className="flex items-center gap-2 border border-border rounded-lg px-3 py-2 text-sm hover:bg-secondary"
          >
            <RefreshCw
              className={`h-4 w-4 ${loadingConfig ? "animate-spin" : ""}`}
            />
            Atualizar
          </button>
          <button
            onClick={() => setShowAddCustom(true)}
            className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Adicionar Gateway
          </button>
        </div>
      </div>

      {/* ─── CARD PRINCIPAL: STATUS DO ASAAS ─── */}
      <div className="border border-border rounded-xl bg-card overflow-hidden">
        {/* Header com gradiente */}
        <div className="p-6 border-b border-border bg-gradient-to-r from-blue-500/5 via-brand-rose/5 to-success/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-success flex items-center justify-center shadow-lg">
                <CreditCard className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2">
                  Asaas
                  <Badge variant="outline" className="text-xs">
                    Gateway Principal
                  </Badge>
                </h3>
                <p className="text-sm text-muted-foreground">
                  PIX, Boleto e Cartão — Gateway brasileiro para assinaturas
                  recorrentes
                </p>
              </div>
            </div>

            {/* Status Badge */}
            <div className="flex items-center gap-2">
              {connectionTest.status === "connected" ? (
                <Badge
                  variant="default"
                  className="bg-success hover:bg-success"
                >
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Conectado
                </Badge>
              ) : connectionTest.status === "error" ? (
                <Badge variant="destructive">
                  <XCircle className="h-3 w-3 mr-1" />
                  Erro
                </Badge>
              ) : connectionTest.status === "testing" ? (
                <Badge variant="secondary">
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Testando...
                </Badge>
              ) : (
                <Badge variant="secondary">
                  <WifiOff className="h-3 w-3 mr-1" />
                  Não testado
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Corpo: Credenciais e Configuração */}
        <div className="p-6 space-y-6">
          {/* Grid de Status */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Ambiente */}
            <div className="p-4 border border-border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase">
                  Ambiente
                </span>
              </div>
              <p className="font-bold capitalize">
                {asaasConfig?.environment || "—"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {asaasConfig?.environment === "sandbox"
                  ? "🟡 Modo de testes"
                  : "🟢 Produção ativa"}
              </p>
            </div>

            {/* API Key */}
            <div className="p-4 border border-border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Key className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase">
                  API Key
                </span>
              </div>
              <div className="flex items-center gap-2">
                {asaasConfig?.has_api_key ? (
                  <>
                    <CheckCircle className="h-4 w-4 text-success" />
                    <span className="font-medium text-success text-sm">
                      Configurada
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 text-red-500" />
                    <span className="font-medium text-red-600 text-sm">
                      Não configurada
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Webhook Token */}
            <div className="p-4 border border-border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase">
                  Webhook Token
                </span>
              </div>
              <div className="flex items-center gap-2">
                {asaasConfig?.has_webhook_token ? (
                  <>
                    <CheckCircle className="h-4 w-4 text-success" />
                    <span className="font-medium text-success text-sm">
                      Configurado
                    </span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <span className="font-medium text-amber-600 text-sm">
                      Opcional
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Saldo (se conectado) */}
            <div className="p-4 border border-border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase">
                  Saldo
                </span>
              </div>
              {connectionTest.status === "connected" ? (
                <p className="font-bold text-success">
                  R$ {connectionTest.balance?.toFixed(2) || "0.00"}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Teste a conexão
                </p>
              )}
            </div>
          </div>

          {/* Webhook URL */}
          <div>
            <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              URL do Webhook (cole no painel do Asaas)
            </h4>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-secondary/50 border border-border px-4 py-2.5 rounded-lg font-mono text-xs break-all">
                {asaasConfig?.webhook_url ||
                  `${API_BASE}/api/payments/asaas/webhook/`}
              </code>
              <button
                onClick={() =>
                  copyToClipboard(
                    asaasConfig?.webhook_url ||
                      `${API_BASE}/api/payments/asaas/webhook/`,
                    "webhook"
                  )
                }
                className="flex items-center gap-1 px-3 py-2.5 border border-border rounded-lg text-xs hover:bg-secondary shrink-0"
              >
                {copied === "webhook" ? (
                  <Check className="h-3 w-3 text-success" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                {copied === "webhook" ? "Copiado!" : "Copiar"}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              📋 Acesse{" "}
              <a
                href={
                  asaasConfig?.environment === "production"
                    ? "https://www.asaas.com/webhooks"
                    : "https://sandbox.asaas.com/webhooks"
                }
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                Painel do Asaas → Webhooks
                <ExternalLink className="h-3 w-3" />
              </a>{" "}
              e cole esta URL
            </p>
          </div>

          {/* Botão de Teste */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={testAsaasConnection}
              disabled={testingConnection || !asaasConfig?.has_api_key}
              className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testingConnection ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wifi className="h-4 w-4" />
              )}
              {testingConnection ? "Testando..." : "Testar Conexão"}
            </button>

            <a
              href={
                asaasConfig?.environment === "production"
                  ? "https://www.asaas.com"
                  : "https://sandbox.asaas.com"
              }
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 border border-border px-4 py-2.5 rounded-lg text-sm hover:bg-secondary"
            >
              <ExternalLink className="h-4 w-4" />
              Abrir Painel Asaas
            </a>

            {!asaasConfig?.has_api_key && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Configure a variável ASAAS_API_KEY no servidor
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ─── MODAL ADICIONAR GATEWAY ─── */}
      {showAddCustom && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <h4 className="font-medium text-sm mb-3">
            Adicionar Gateway Customizado
          </h4>
          <div className="flex gap-3">
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Nome do gateway (ex: Iugu, PagSeguro)"
              className="flex-1 border border-input rounded-lg px-3 py-2 text-sm"
              onKeyDown={(e) => e.key === "Enter" && addCustomGateway()}
            />
            <button
              onClick={addCustomGateway}
              className="bg-primary text-white px-4 py-2 rounded-lg text-sm hover:bg-primary/90"
            >
              Adicionar
            </button>
            <button
              onClick={() => {
                setShowAddCustom(false);
                setCustomName("");
              }}
              className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-secondary"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ─── OUTROS GATEWAYS ─── */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg">Outros Gateways</h3>

        {gateways
          .filter((g) => g.id !== "asaas")
          .map((gateway) => (
            <div
              key={gateway.id}
              className={`border rounded-xl p-5 bg-card transition-colors ${
                gateway.enabled ? "border-primary/30" : "border-border"
              }`}
            >
              {/* Header do gateway */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      gateway.enabled ? "bg-primary/10" : "bg-secondary"
                    }`}
                  >
                    <CreditCard
                      className={`h-5 w-5 ${
                        gateway.enabled
                          ? "text-primary"
                          : "text-muted-foreground"
                      }`}
                    />
                  </div>
                  <div>
                    <h3 className="font-bold text-base">{gateway.name}</h3>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                          gateway.enabled
                            ? "bg-primary/10 text-primary border border-primary/30"
                            : "bg-secondary text-muted-foreground border border-border"
                        }`}
                      >
                        {gateway.enabled ? "Ativo" : "Inativo"}
                      </span>
                      <span className="text-xs px-2.5 py-0.5 rounded-full border border-border text-muted-foreground">
                        {gateway.mode === "production"
                          ? "🟢 Produção"
                          : "🟡 Sandbox"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleGateway(gateway.id)}
                    className={`p-2 rounded-lg transition-colors ${
                      gateway.enabled
                        ? "bg-success/10 text-success hover:bg-success/10"
                        : "bg-secondary text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {gateway.enabled ? (
                      <ToggleRight className="h-5 w-5" />
                    ) : (
                      <ToggleLeft className="h-5 w-5" />
                    )}
                  </button>
                  <button
                    onClick={() =>
                      setEditingGateway(
                        editingGateway === gateway.id ? null : gateway.id
                      )
                    }
                    className="p-2 rounded-lg border border-border hover:bg-secondary"
                  >
                    <Settings2 className="h-4 w-4" />
                  </button>
                  {!["stripe", "mercadopago"].includes(gateway.id) && (
                    <button
                      onClick={() => removeGateway(gateway.id)}
                      className="p-2 rounded-lg text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Métodos aceitos */}
              <div className="flex flex-wrap gap-2 mb-2">
                {PAYMENT_METHODS_OPTIONS.map((method) => (
                  <button
                    key={method.value}
                    onClick={() => toggleMethod(gateway.id, method.value)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      gateway.supportedMethods.includes(method.value)
                        ? "bg-primary/10 border-primary/30 text-primary font-medium"
                        : "bg-secondary border-border text-muted-foreground"
                    }`}
                  >
                    {gateway.supportedMethods.includes(method.value) && (
                      <Check className="h-3 w-3 inline mr-1" />
                    )}
                    {method.label}
                  </button>
                ))}
              </div>

              {/* Notas */}
              {gateway.notes && (
                <p className="text-xs text-muted-foreground italic mt-2">
                  {gateway.notes}
                </p>
              )}

              {/* Formulário expandido */}
              {editingGateway === gateway.id && (
                <div className="mt-4 pt-4 border-t border-border space-y-4 animate-in slide-in-from-top-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium mb-1">
                        Modo
                      </label>
                      <select
                        value={gateway.mode}
                        onChange={(e) =>
                          updateGateway(gateway.id, "mode", e.target.value)
                        }
                        className="w-full border border-input rounded-lg px-3 py-2 text-sm"
                      >
                        <option value="sandbox">🟡 Sandbox (Teste)</option>
                        <option value="production">🟢 Produção</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">
                        Webhook URL
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={`${API_BASE}/api/webhooks/${gateway.id}/`}
                          readOnly
                          className="flex-1 border border-input rounded-lg px-3 py-2 text-sm bg-secondary/30 font-mono text-xs"
                        />
                        <button
                          onClick={() =>
                            copyToClipboard(
                              `${API_BASE}/api/webhooks/${gateway.id}/`,
                              gateway.id
                            )
                          }
className="px-3 py-2 border border-border rounded-lg text-xs hover:bg-secondary"
              >
                {copied === gateway.id ? "Copiado!" : "Copiar"}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1">
              Chave Pública (Public Key)
            </label>
            <input
              type="text"
              value={gateway.publicKey}
              onChange={(e) =>
                updateGateway(gateway.id, "publicKey", e.target.value)
              }
              className="w-full border border-input rounded-lg px-3 py-2 text-sm font-mono"
              placeholder="pk_live_..."
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">
              Chave Secreta (Secret Key)
            </label>
            <input
              type="password"
              value={gateway.secretKey}
              onChange={(e) =>
                updateGateway(gateway.id, "secretKey", e.target.value)
              }
              className="w-full border border-input rounded-lg px-3 py-2 text-sm font-mono"
              placeholder="sk_live_..."
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1">
            Webhook Secret (para validação)
          </label>
          <input
            type="password"
            value={gateway.webhookSecret}
            onChange={(e) =>
              updateGateway(gateway.id, "webhookSecret", e.target.value)
            }
            className="w-full border border-input rounded-lg px-3 py-2 text-sm font-mono"
            placeholder="whsec_..."
          />
        </div>

        <div>
          <label className="block text-xs font-medium mb-1">
            Notas / Observações
          </label>
          <textarea
            value={gateway.notes}
            onChange={(e) =>
              updateGateway(gateway.id, "notes", e.target.value)
            }
            className="w-full border border-input rounded-lg px-3 py-2 text-sm"
            rows={2}
            placeholder="Anotações internas..."
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => saveGateway(gateway.id)}
            className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm hover:bg-primary/90"
          >
            <Save className="h-4 w-4" />
            Salvar Configuração
          </button>
          <button
            onClick={() => setEditingGateway(null)}
            className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-secondary"
          >
            Cancelar
          </button>
        </div>
      </div>
    )}
  </div>
))}
      </div>

      {/* ─── INSTRUÇÕES DE CONFIGURAÇÃO ─── */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-5">
        <h4 className="font-semibold text-sm text-amber-800 dark:text-amber-200 mb-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Como configurar o Asaas no servidor
        </h4>
        <ol className="text-xs text-amber-700 dark:text-amber-300 space-y-2 list-decimal list-inside">
          <li>
            Crie uma conta no{" "}
            <a
              href="https://sandbox.asaas.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-medium"
            >
              Asaas Sandbox
            </a>{" "}
            para testes
          </li>
          <li>
            Gere uma API Key em{" "}
            <strong>Configurações → Integrações → API</strong>
          </li>
          <li>
            Configure as variáveis de ambiente no servidor:
            <code className="block mt-1 bg-amber-100 dark:bg-amber-900/50 px-2 py-1 rounded font-mono text-[10px]">
              ASAAS_API_KEY=seu_token_aqui
              <br />
              ASAAS_ENVIRONMENT=sandbox
              <br />
              ASAAS_WEBHOOK_TOKEN=token_opcional_para_validacao
            </code>
          </li>
          <li>Copie a URL de webhook acima e cole no painel do Asaas</li>
          <li>
            Clique em <strong>"Testar Conexão"</strong> para verificar
          </li>
          <li>
            Quando estiver pronto, mude{" "}
            <code className="bg-amber-100 dark:bg-amber-900/50 px-1 rounded font-mono">
              ASAAS_ENVIRONMENT=production
            </code>
          </li>
        </ol>
      </div>
    </div>
  );
}