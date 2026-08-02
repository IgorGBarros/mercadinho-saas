// src/components/admin/ApiManagementTab.tsx
//
// ⚠️ REESCRITO DO ZERO. A versão anterior tinha 5 sub-abas: Visão Geral,
// Chaves, Webhooks, Endpoints, Comercialização. Das cinco, só as duas
// primeiras tinham algum dado real (e mesmo essas, misturado com mock —
// "Chaves" usava lojas com vitrine ativa como proxy de chave de API,
// gerando um prefixo falso; nenhuma chave real tinha sido emitida).
// Webhooks, Endpoints e Comercialização diziam no próprio texto que eram
// prévia de algo que ainda não existe ("será ativado na versão comercial",
// "futura comercialização", "checklist de preparação").
//
// Agora: só as duas abas que mostram dado de verdade, vindo de
// DeveloperAccount/ApiKey/ApiUsageLog (ver monitor_api_usage no backend).
import { useState, useEffect } from "react";
import { Key, Activity, RefreshCw, TrendingUp, AlertCircle, Clock, Users, DollarSign, Save, ToggleLeft, ToggleRight } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import { adminApi } from "../../lib/api";

interface ApiPlanoConfig {
  plan_type: string;
  display_name: string;
  monthly_price: number;
  yearly_price: number;
  monthly_quota: number;
  rate_limit: number;
  is_visible: boolean;
}

interface ApiMonitorKey {
  id: string;
  name: string;
  key_prefix: string;
  developer_name: string | null;
  developer_email: string | null;
  plan: string;
  is_active: boolean;
  rate_limit: number;
  monthly_quota: number;
  requests_30d: number;
  last_used: string | null;
}

interface ApiMonitorData {
  total_developers: number;
  active_keys: number;
  total_requests_30d: number;
  error_rate_percent: number;
  avg_response_time_ms: number;
  requests_by_day: { date: string; count: number }[];
  top_endpoints: { endpoint: string; chamadas: number }[];
  keys: ApiMonitorKey[];
  revenue_api_mrr: number;
  revenue_note: string;
  generated_at: string;
}

interface Props {
  formatCurrency: (value: number) => string;
  toast: (opts: { title: string; description?: string; variant?: "default" | "destructive" }) => void;
}

export default function ApiManagementTab({ formatCurrency, toast }: Props) {
  const [data, setData] = useState<ApiMonitorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState("overview");
  const [planos, setPlanos] = useState<ApiPlanoConfig[]>([]);
  const [salvandoPlano, setSalvandoPlano] = useState<string | null>(null);

  const carregar = async () => {
    setLoading(true);
    try {
      const resultado = await adminApi.getApiMonitor();
      setData(resultado);
    } catch {
      toast({ title: "Erro", description: "Não foi possível carregar os dados da API", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const carregarPlanos = async () => {
    try {
      const resultado = await adminApi.listApiPlanConfigs();
      setPlanos(resultado);
    } catch {
      toast({ title: "Erro", description: "Não foi possível carregar os planos de API", variant: "destructive" });
    }
  };

  const salvarPlano = async (plano: ApiPlanoConfig) => {
    setSalvandoPlano(plano.plan_type);
    try {
      const atualizado = await adminApi.updateApiPlanConfig(plano.plan_type, {
        monthly_price: plano.monthly_price,
        yearly_price: plano.yearly_price,
        monthly_quota: plano.monthly_quota,
        rate_limit: plano.rate_limit,
        is_visible: plano.is_visible,
      });
      setPlanos((prev) => prev.map((p) => (p.plan_type === plano.plan_type ? atualizado : p)));
      toast({ title: "Plano salvo", description: `${plano.display_name} atualizado — reflete em /api/pricing na hora.` });
    } catch {
      toast({ title: "Erro", description: "Não foi possível salvar o plano", variant: "destructive" });
    } finally {
      setSalvandoPlano(null);
    }
  };

  const atualizarCampoPlano = (planType: string, campo: keyof ApiPlanoConfig, valor: any) => {
    setPlanos((prev) => prev.map((p) => (p.plan_type === planType ? { ...p, [campo]: valor } : p)));
  };

  useEffect(() => {
    carregar();
    carregarPlanos();
  }, []);

  if (loading && !data) {
    return (
      <div className="flex justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" /> Produto de API
          </h2>
          <p className="text-sm text-muted-foreground">
            Desenvolvedores, chaves e uso — dado real, vindo de ApiUsageLog
          </p>
        </div>
        <button
          onClick={carregar}
          className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>

      <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview" className="text-xs">Visão Geral</TabsTrigger>
          <TabsTrigger value="keys" className="text-xs">Chaves</TabsTrigger>
          <TabsTrigger value="plans" className="text-xs">Planos</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Desenvolvedores", value: data.total_developers, icon: Users, color: "text-blue-600" },
              { label: "Chaves Ativas", value: data.active_keys, icon: Key, color: "text-primary" },
              { label: "Requisições (30d)", value: data.total_requests_30d.toLocaleString("pt-BR"), icon: Activity, color: "text-purple-600" },
              { label: "Latência Média", value: `${data.avg_response_time_ms}ms`, icon: Clock, color: "text-amber-600" },
            ].map((stat, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <stat.icon className={`h-4 w-4 ${stat.color}`} />
                    <span className="text-xs text-muted-foreground font-medium">{stat.label}</span>
                  </div>
                  <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Receita — honesto sobre o que ainda não existe, em vez de mostrar
              um número emprestado de outro produto (era a receita de
              assinatura das CONSULTORAS, relabelada como se fosse de API). */}
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-medium text-amber-900">
                Receita de assinatura de API: {formatCurrency(data.revenue_api_mrr)}
              </p>
              <p className="text-xs text-amber-700">{data.revenue_note}</p>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" /> Endpoints mais chamados
              </CardTitle>
              <CardDescription>Últimos 30 dias, contagem real de ApiUsageLog</CardDescription>
            </CardHeader>
            <CardContent>
              {data.top_endpoints.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhuma chamada registrada ainda.
                </p>
              ) : (
                <div className="space-y-2">
                  {data.top_endpoints.map((e) => (
                    <div key={e.endpoint} className="flex items-center justify-between rounded-lg border border-border p-2.5">
                      <code className="text-xs font-mono text-primary">{e.endpoint}</code>
                      <Badge variant="secondary">{e.chamadas} chamadas</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="keys" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Chaves de API</CardTitle>
                <CardDescription>Emitidas de verdade, uma por desenvolvedor cadastrado</CardDescription>
              </div>
              <Badge variant="outline">{data.keys.length} total</Badge>
            </CardHeader>
            <CardContent>
              {data.keys.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhum desenvolvedor se cadastrou ainda.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Desenvolvedor</TableHead>
                      <TableHead>Chave</TableHead>
                      <TableHead>Plano</TableHead>
                      <TableHead>Uso (30d)</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.keys.map((k) => (
                      <TableRow key={k.id}>
                        <TableCell>
                          <p className="text-sm font-medium">{k.developer_name || "—"}</p>
                          <p className="text-xs text-muted-foreground">{k.developer_email}</p>
                        </TableCell>
                        <TableCell>
                          <code className="text-xs bg-secondary px-1.5 py-0.5 rounded font-mono">{k.key_prefix}</code>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="capitalize text-xs">{k.plan}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {k.requests_30d} / {k.monthly_quota === 999999 ? "∞" : k.monthly_quota}
                        </TableCell>
                        <TableCell>
                          <Badge variant={k.is_active ? "default" : "secondary"} className="text-xs">
                            {k.is_active ? "Ativa" : "Inativa"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="plans" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-primary" /> Planos de API
              </CardTitle>
              <CardDescription>
                Mudar aqui reflete na hora em /api/pricing e no checkout de novas assinaturas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {planos.map((plano) => (
                <div key={plano.plan_type} className="rounded-lg border border-border p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="font-medium">{plano.display_name}</p>
                    <button
                      onClick={() => atualizarCampoPlano(plano.plan_type, "is_visible", !plano.is_visible)}
                      className={plano.is_visible ? "text-success" : "text-muted-foreground"}
                      title={plano.is_visible ? "Visível em /api/pricing" : "Oculto de /api/pricing"}
                    >
                      {plano.is_visible ? <ToggleRight className="h-6 w-6" /> : <ToggleLeft className="h-6 w-6" />}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Preço mensal (R$)</label>
                      <input
                        type="number" step="0.01" min="0"
                        value={plano.monthly_price}
                        onChange={(e) => atualizarCampoPlano(plano.plan_type, "monthly_price", parseFloat(e.target.value) || 0)}
                        className="w-full rounded-lg border border-input px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Preço anual (R$)</label>
                      <input
                        type="number" step="0.01" min="0"
                        value={plano.yearly_price}
                        onChange={(e) => atualizarCampoPlano(plano.plan_type, "yearly_price", parseFloat(e.target.value) || 0)}
                        className="w-full rounded-lg border border-input px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Cota mensal (requisições)</label>
                      <input
                        type="number" min="0"
                        value={plano.monthly_quota}
                        onChange={(e) => atualizarCampoPlano(plano.plan_type, "monthly_quota", parseInt(e.target.value) || 0)}
                        className="w-full rounded-lg border border-input px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Limite por minuto</label>
                      <input
                        type="number" min="0"
                        value={plano.rate_limit}
                        onChange={(e) => atualizarCampoPlano(plano.plan_type, "rate_limit", parseInt(e.target.value) || 0)}
                        className="w-full rounded-lg border border-input px-2 py-1.5 text-sm"
                      />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="mt-3 gap-2"
                    disabled={salvandoPlano === plano.plan_type}
                    onClick={() => salvarPlano(plano)}
                  >
                    <Save className="h-3.5 w-3.5" />
                    {salvandoPlano === plano.plan_type ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              ))}
              {planos.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhum plano de API configurado ainda.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}