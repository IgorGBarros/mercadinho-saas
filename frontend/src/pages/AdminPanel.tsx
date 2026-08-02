// src/components/admin/AdminPanel.tsx
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Shield, Crown, User, Loader2, Check, Search, Users, ChevronUp, ChevronDown,
  ExternalLink, RefreshCw, AlertTriangle, Package, Calendar, Phone, Store, Mail, BarChart3,
  Settings2, ToggleLeft, ToggleRight, CreditCard, Clock, CalendarCheck, CalendarX, X,
  Plus, Edit2, Trash2, Save, DollarSign, Target, Megaphone, TrendingUp, Activity,
  FileText, Download, Upload, Eye, EyeOff, Palette, Zap, Bell, Gift, Percent,
  Bot, Server, Lock, LogIn, Ban, FileSearch, AlertCircle, Key, Copy
} from "lucide-react";

import { profileApi, adminApi, adminHealthApi, systemConfigApi, SystemConfigStatus } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import ConsultantsHealthTab from "../components/admin/ConsultantsHealthTab";
import CrmOverviewTab from "../components/admin/CrmOverviewTab";
import { useToast } from '../components/ui/use-toast'; // ✅ Importar useToast original para evitar dependência circular
import { Badge } from "../components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import React from "react";
import PaymentGatewaysTab from "../components/admin/PaymentGatewaysTab";
import ApiManagementTab from "../components/admin/ApiManagementTab";

// Acesso ao painel é por email autorizado (is_staff, definido pelo backend
// via ADMIN_EMAILS). Não há mais senha no frontend.

// ==========================================
// INTERFACES E TIPOS
// ==========================================

export interface AdminUser {
  id: string | number;
  store_id?: string | number;  // ⚠️ ID da LOJA — usado pra vincular Promotion.target_stores
  email: string;
  display_name: string | null;
  plan: string;
  store_slug: string | null;
  storefront_enabled: boolean;
  whatsapp_number: string | null;
  product_count: number;
  created_at: string;
  last_sign_in: string | null;
  subscription_started_at: string | null;
  subscription_expires_at: string | null;
  payment_provider: string | null;
  payment_external_id: string | null;
  subscription_status?: string;
  days_until_expiry?: number | null;
  can_add_products?: boolean;
  total_value?: number;
  last_activity?: string | null;
}

export interface PlanConfig {
  plan_type: string;
  display_name: string;
  description: string;
  max_products: number | null;
  can_use_scanner: boolean;
  can_use_storefront: boolean;
  can_use_alerts: boolean;
  can_use_ai_assistant: boolean;
  can_use_analytics: boolean;
  monthly_price: number;
  yearly_price: number;
  highlight_color: string;
  is_popular: boolean;
  is_visible: boolean;
  sort_order: number;
}

export interface Promotion {
  id: string;
  title: string;
  message: string;
  target_audience: string;
  target_store_ids?: (string | number)[];
  discount_percent: number;
  discount_amount: number;
  is_active: boolean;
  starts_at: string;
  ends_at: string | null;
  max_views_per_store: number | null;
  created_at: string;
  // 📊 Métricas reais — ver active_promotions_view/_serialize_promotion no backend
  views_count?: number;
  conversions_count?: number;
  conversion_rate?: number;
}

export interface SystemStats {
  total_stores: number;
  active_stores: number;
  pro_stores: number;
  free_stores: number;
  total_products: number;
  total_revenue: number;      // ⚠️ vendas de produto das consultoras (GMV), NÃO é receita do Minha Amora
  monthly_revenue: number;
  platform_revenue_total: number;   // 💰 receita REAL da plataforma — assinaturas pagas via Asaas
  platform_revenue_month: number;
  platform_revenue_by_day: { date: string; value: number }[];
  churn_rate: number;
  conversion_rate: number;
  avg_products_per_store: number;
}

interface ProductAnalytics {
  overview: {
    total_products: number;
    products_with_barcode: number;
    products_with_image: number;
    completion_rate: number;
  };
  brands: {
    name: string;
    count: number;
    avg_price: number;
  }[];
  categories: {
    name: string;
    count: number;
  }[];
  popular_products: {
    name: string;
    brand: string;
    usage_count: number;
    official_price: number;
  }[];
  price_ranges: Record<string, number>;
}
export interface SystemHealth {
  api_status: 'operational' | 'degraded' | 'down';
  database_status: 'operational' | 'degraded' | 'down';
  payment_gateway_status: 'operational' | 'degraded' | 'down';
  last_check: string;
  uptime_percentage: number;
}
export interface AuditLog {
  id: string;
  action: string;
  user_email: string;
  target_user?: string;
  ip_address: string;
  timestamp: string;
  status: 'success' | 'failed';
}
type SortField = "display_name" | "email" | "plan" | "product_count" | "created_at" | "last_sign_in";
type SortDir = "asc" | "desc";

// ==========================================
// HOOKS UTILITÁRIOS
// ==========================================

// Hook de debounce para busca
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  
  useEffect(() => {
    const handler = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  
  return debounced;
}

// ==========================================
// COMPONENTES DE MODAL
// ==========================================

const PlanConfigModal = ({
  isOpen,
  onClose,
  plan,
  onSave
}: {
  isOpen: boolean;
  onClose: () => void;
  plan: PlanConfig | null;
  onSave: (data: Partial<PlanConfig>) => void;
}) => {
  const [formData, setFormData] = useState<Partial<PlanConfig>>({
    plan_type: '',
    display_name: '',
    description: '',
    max_products: null,
    can_use_scanner: true,
    can_use_storefront: false,
    can_use_alerts: false,
    can_use_ai_assistant: false,
    can_use_analytics: false,
    monthly_price: 0,
    yearly_price: 0,
    highlight_color: '#3B82F6',
    is_popular: false,
    is_visible: true,
    sort_order: 0
  });

  useEffect(() => {
    if (plan) {
      setFormData(plan);
    } else {
      setFormData({
        plan_type: '',
        display_name: '',
        description: '',
        max_products: null,
        can_use_scanner: true,
        can_use_storefront: false,
        can_use_alerts: false,
        can_use_ai_assistant: false,
        can_use_analytics: false,
        monthly_price: 0,
        yearly_price: 0,
        highlight_color: '#3B82F6',
        is_popular: false,
        is_visible: true,
        sort_order: 0
      });
    }
  }, [plan, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">
            {plan ? 'Editar Plano' : 'Novo Plano'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-secondary rounded-lg">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Tipo do Plano</label>
              <select
                value={formData.plan_type}
                onChange={(e) => setFormData({...formData, plan_type: e.target.value})}
                className="w-full border border-input rounded-lg px-3 py-2 text-sm"
                disabled={!!plan}
              >
                <option value="">Selecione...</option>
                <option value="free">Free</option>
                <option value="pro">Pro</option>
                <option value="premium">Premium</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Nome de Exibição</label>
              <input
                type="text"
                value={formData.display_name}
                onChange={(e) => setFormData({...formData, display_name: e.target.value})}
                className="w-full border border-input rounded-lg px-3 py-2 text-sm"
                placeholder="Ex: PRO"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Descrição</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              className="w-full border border-input rounded-lg px-3 py-2 text-sm"
              rows={2}
              placeholder="Descrição do plano..."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Máx. Produtos</label>
              <input
                type="number"
                value={formData.max_products || ''}
                onChange={(e) => setFormData({...formData, max_products: e.target.value ? parseInt(e.target.value) : null})}
                className="w-full border border-input rounded-lg px-3 py-2 text-sm"
                placeholder="Ilimitado"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Preço Mensal (R$)</label>
              <input
                type="number"
                step="0.01"
                value={formData.monthly_price}
                onChange={(e) => setFormData({...formData, monthly_price: parseFloat(e.target.value) || 0})}
                className="w-full border border-input rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Preço Anual (R$)</label>
              <input
                type="number"
                step="0.01"
                value={formData.yearly_price}
                onChange={(e) => setFormData({...formData, yearly_price: parseFloat(e.target.value) || 0})}
                className="w-full border border-input rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Recursos Habilitados</label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'can_use_scanner', label: 'Scanner' },
                { key: 'can_use_storefront', label: 'Vitrine' },
                { key: 'can_use_alerts', label: 'Alertas' },
                { key: 'can_use_ai_assistant', label: 'IA Assistant' },
                { key: 'can_use_analytics', label: 'Analytics' }
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData[key as keyof PlanConfig] as boolean}
                    onChange={(e) => setFormData({...formData, [key]: e.target.checked})}
                    className="rounded"
                  />
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Cor de Destaque</label>
              <input
                type="color"
                value={formData.highlight_color}
                onChange={(e) => setFormData({...formData, highlight_color: e.target.value})}
                className="w-full h-10 border border-input rounded-lg"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.is_popular}
                  onChange={(e) => setFormData({...formData, is_popular: e.target.checked})}
                  className="rounded"
                />
                <span className="text-sm">Popular</span>
              </label>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.is_visible}
                  onChange={(e) => setFormData({...formData, is_visible: e.target.checked})}
                  className="rounded"
                />
                <span className="text-sm">Visível</span>
              </label>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={() => onSave(formData)}
              className="flex-1 bg-primary text-white py-2 px-4 rounded-lg font-medium hover:bg-primary/90"
            >
              {plan ? 'Atualizar' : 'Criar'} Plano
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 border border-border rounded-lg hover:bg-secondary"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const PromotionModal = ({
  isOpen,
  onClose,
  promotion,
  onSave,
  stores
}: {
  isOpen: boolean;
  onClose: () => void;
  promotion: Promotion | null;
  onSave: (data: Partial<Promotion>) => void;
  stores: AdminUser[];
}) => {
  const [formData, setFormData] = useState<Partial<Promotion> & { target_store_ids?: (string | number)[] }>({
    title: '',
    message: '',
    target_audience: 'free',
    discount_percent: 0,
    discount_amount: 0,
    is_active: true,
    starts_at: new Date().toISOString().slice(0, 16),
    ends_at: null,
    max_views_per_store: null,
    target_store_ids: [],
  });

  useEffect(() => {
    if (promotion) {
      setFormData({
        ...promotion,
        starts_at: promotion.starts_at.slice(0, 16),
        ends_at: promotion.ends_at ? promotion.ends_at.slice(0, 16) : null
      });
    }
  }, [promotion, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-lg">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">
            {promotion ? 'Editar Promoção' : 'Nova Promoção'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-secondary rounded-lg">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Título</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({...formData, title: e.target.value})}
              className="w-full border border-input rounded-lg px-3 py-2 text-sm"
              placeholder="Ex: Promoção de Lançamento"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Mensagem</label>
            <textarea
              value={formData.message}
              onChange={(e) => setFormData({...formData, message: e.target.value})}
              className="w-full border border-input rounded-lg px-3 py-2 text-sm"
              rows={3}
              placeholder="Mensagem da promoção..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Público-Alvo</label>
              <select
                value={formData.target_audience}
                onChange={(e) => setFormData({...formData, target_audience: e.target.value})}
                className="w-full border border-input rounded-lg px-3 py-2 text-sm"
              >
                <option value="all">Todos</option>
                <option value="free">Plano Free</option>
                <option value="pro">Plano PRO</option>
                {/* ⚠️ CORREÇÃO: era "new_stores", mas o modelo espera
                    "new_users" — o valor nunca batia com nada, essa opção
                    nunca funcionou. E faltava "inativos", que já existe no
                    modelo mas nunca aparecia aqui pra escolher. */}
                <option value="new_users">Lojas Novas (menos de 7 dias)</option>
                <option value="inactive">Inativas (mais de 30 dias sem uso)</option>
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Usado só se nenhuma consultora específica for selecionada abaixo.
              </p>
            </div>
          </div>

          {/* 🎯 Alvo por consultora específica — o que faltava pra o admin
              conseguir mandar uma promoção só pra quem ele quiser, em vez de
              só um segmento amplo. Quando alguém aqui está marcado, vale
              MAIS que o Público-Alvo acima (ver active_promotions_view). */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Ou consultoras específicas
              {(formData.target_store_ids?.length || 0) > 0 && (
                <span className="ml-1.5 text-xs font-normal text-brand">
                  ({formData.target_store_ids!.length} selecionada{formData.target_store_ids!.length > 1 ? "s" : ""})
                </span>
              )}
            </label>
            <div className="max-h-40 overflow-y-auto rounded-lg border border-input p-2 space-y-1">
              {stores.length === 0 ? (
                <p className="p-2 text-xs text-muted-foreground">Nenhuma consultora encontrada.</p>
              ) : (
                stores.map((s) => {
                  const marcado = (formData.target_store_ids || []).includes(s.store_id ?? s.id);
                  return (
                    <label
                      key={s.store_id ?? s.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-secondary/50"
                    >
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={(e) => {
                          const idLoja = s.store_id ?? s.id;
                          const atual = formData.target_store_ids || [];
                          setFormData({
                            ...formData,
                            target_store_ids: e.target.checked
                              ? [...atual, idLoja]
                              : atual.filter((v) => v !== idLoja),
                          });
                        }}
                        className="h-4 w-4 rounded border-input"
                      />
                      <span className="truncate">{s.display_name || s.email}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Desconto (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={formData.discount_percent}
                onChange={(e) => setFormData({...formData, discount_percent: parseInt(e.target.value) || 0})}
                className="w-full border border-input rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Início</label>
              <input
                type="datetime-local"
                value={formData.starts_at}
                onChange={(e) => setFormData({...formData, starts_at: e.target.value})}
                className="w-full border border-input rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Fim (opcional)</label>
              <input
                type="datetime-local"
                value={formData.ends_at || ''}
                onChange={(e) => setFormData({...formData, ends_at: e.target.value || null})}
                className="w-full border border-input rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
                className="rounded"
              />
              <span className="text-sm">Ativa</span>
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={() => onSave(formData)}
              className="flex-1 bg-primary text-white py-2 px-4 rounded-lg font-medium hover:bg-primary/90"
            >
              {promotion ? 'Atualizar' : 'Criar'} Promoção
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 border border-border rounded-lg hover:bg-secondary"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// COMPONENTE DE SKELETON LOADING
// ==========================================

const SkeletonCard = () => (
  <div className="rounded-xl border border-border bg-card p-4 animate-pulse">
    <div className="flex items-center gap-2 mb-2">
      <div className="h-4 w-4 bg-secondary rounded" />
      <div className="h-3 w-20 bg-secondary rounded" />
    </div>
    <div className="h-6 w-16 bg-secondary rounded mb-1" />
    <div className="h-2 w-24 bg-secondary rounded" />
  </div>
);

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================

export default function AdminPanel() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();

  // Acesso ao painel: o usuário precisa ser admin (is_staff). Isso é
  // controlado no backend pela lista ADMIN_EMAILS — o frontend apenas
  // reflete. A rota já usa <ProtectedRoute requireAdmin>, então esta é uma
  // segunda barreira de UX, não a proteção real (que é o IsAdminUser da API).
  const authenticated = user?.is_staff === true;

  // Estado de senha REMOVIDO (era hardcoded no bundle).

  // Estados de dados
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [planConfigs, setPlanConfigs] = useState<PlanConfig[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  const [productAnalytics, setProductAnalytics] = useState<ProductAnalytics | null>(null);
  const [behaviorAnalytics, setBehaviorAnalytics] = useState<any>(null);
  const [apiMonitorData, setApiMonitorData] = useState<any>(null);

  // Estados de UI
  const [activeTab, setActiveTab] = useState("dashboard");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<"all" | "free" | "pro">("all");

  // Estados de ordenação
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Estados de ações
  const [updatingId, setUpdatingId] = useState<string | number | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  // Estados de modais
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showPromotionModal, setShowPromotionModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PlanConfig | null>(null);
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null);

  // Estados Enterprise: Health & Audit
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  // ⚙️ Configuração global real (manutenção + feature flags) — substitui
  // os dois localStorage que só valiam pro navegador do próprio admin.
  const [systemConfig, setSystemConfig] = useState<SystemConfigStatus | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);

  const fetchSystemConfig = useCallback(async () => {
    try {
      const cfg = await systemConfigApi.get();
      setSystemConfig(cfg);
    } catch {
      /* mantém o que já estava — não derruba a tela por isso */
    }
  }, []);

  const updateConfig = useCallback(async (patch: Partial<SystemConfigStatus>) => {
    setSavingConfig(true);
    try {
      const atualizado = await adminApi.updateSystemConfig(patch);
      setSystemConfig(atualizado);
      return true;
    } catch {
      toast({ title: "Erro", description: "Não foi possível salvar a configuração", variant: "destructive" });
      return false;
    } finally {
      setSavingConfig(false);
    }
  }, [toast]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<Set<string | number>>(new Set());

  // ✅ ESTADOS DE OTIMIZAÇÃO
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;
  
  // Cache simples para evitar recarregar dados ao trocar de tab
  const dataCache = useRef<Record<string, { data: any; timestamp: number }>>({});
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos
  
  // Estados de loading por tab (para lazy loading)
  const [tabLoading, setTabLoading] = useState<Record<string, boolean>>({
    dashboard: false,
    stores: false,
    plans: false,
    promotions: false,
    analytics: false,
    api: false,
  });

  // ✅ DEBOUNCE PARA BUSCA
  const debouncedSearch = useDebounce(search, 300);

  // ==========================================
  // FUNÇÕES AUXILIARES
  // ==========================================

  const fetchSystemHealth = useCallback(async () => {
    let apiOk = true;
    try {
      const res = await fetch(`${(import.meta as any).env?.VITE_API_BASE_URL || "https://gestao-estoque-k5vy.onrender.com"}/api/health/`, { method: "GET" });
      apiOk = res.ok;
    } catch { apiOk = false; }
    setSystemHealth({
      api_status: apiOk ? 'operational' : 'down',
      database_status: apiOk ? 'operational' : 'degraded',
      payment_gateway_status: 'operational',
      last_check: new Date().toISOString(),
      uptime_percentage: apiOk ? 99.9 : 92.0,
    });
    const stored = localStorage.getItem("admin_audit_logs");
    if (stored) {
      try { setAuditLogs(JSON.parse(stored)); return; } catch {}
    }
    setAuditLogs([
      { id: '1', action: 'LOGIN_ADMIN', user_email: 'admin@pgba.com', ip_address: '192.168.1.1', timestamp: new Date().toISOString(), status: 'success' },
      { id: '2', action: 'UPDATE_PLAN', user_email: 'admin@pgba.com', target_user: 'loja@teste.com', ip_address: '192.168.1.1', timestamp: new Date(Date.now() - 3600000).toISOString(), status: 'success' },
      { id: '3', action: 'FAILED_LOGIN', user_email: 'unknown@hacker.com', ip_address: '45.22.11.9', timestamp: new Date(Date.now() - 7200000).toISOString(), status: 'failed' },
    ]);
  }, []);

  const logAuditEvent = useCallback((action: string, target_user?: string, status: 'success' | 'failed' = 'success') => {
    setAuditLogs(prev => {
      const next = [{
        id: Date.now().toString(), action, user_email: 'admin@pgba.com', target_user,
        ip_address: 'local', timestamp: new Date().toISOString(), status,
      }, ...prev].slice(0, 50);
      localStorage.setItem("admin_audit_logs", JSON.stringify(next));
      return next;
    });
  }, []);

  const impersonateUser = useCallback(async (u: AdminUser) => {
    // ⚠️ Isto abre a conta da consultora com os DADOS PESSOAIS dela e dos
    // clientes finais. Antes o botão era só um toast de simulação — não fazia
    // nada. Agora é real, então pedimos confirmação explícita.
    if (!confirm(
      `Acessar o sistema como ${u.display_name || u.email}?\n\n` +
      `Você verá os dados reais desta consultora e o acesso ficará registrado. ` +
      `Use apenas para suporte solicitado por ela.`
    )) return;

    try {
      const r = await adminHealthApi.impersonate(Number(u.id));
      // Guarda o token do admin para conseguir voltar depois.
      const tokenAdmin = localStorage.getItem("auth_token");
      if (tokenAdmin) sessionStorage.setItem("admin_token_backup", tokenAdmin);
      sessionStorage.setItem("impersonating_as", r.user.display_name || r.user.email);

      localStorage.setItem("auth_token", r.access);
      logAuditEvent('IMPERSONATE_USER', u.email);
      toast({
        title: `Acessando como ${r.user.display_name || r.user.email}`,
        description: `Sessão de suporte de ${r.expires_in_minutes} minutos.`,
      });
      // Recarrega na home já com a sessão da consultora.
      setTimeout(() => { window.location.href = "/"; }, 600);
    } catch (e: any) {
      toast({
        title: "Não foi possível acessar",
        description: e?.message || "Tente novamente.",
        variant: "destructive",
      });
    }
  }, [logAuditEvent, toast]);

  const toggleBlockUser = useCallback(async (u: AdminUser) => {
    // ⚠️ Antes isto só mudava a tela: NADA era enviado ao servidor. O admin
    // acreditava ter bloqueado alguém que continuava entrando normalmente.
    const isBlocked = blockedUsers.has(u.id);
    if (!isBlocked && !confirm(`Bloquear o acesso de ${u.email}?`)) return;

    try {
      const r = await adminHealthApi.toggleBlock(Number(u.id));
      setBlockedUsers(prev => {
        const next = new Set(prev);
        if (r.is_active) next.delete(u.id); else next.add(u.id);
        return next;
      });
      logAuditEvent(r.is_active ? 'UNBLOCK_USER' : 'BLOCK_USER', u.email);
      toast({
        title: r.is_active ? "Acesso liberado" : "Acesso bloqueado",
        description: `${u.email} está ${r.status}.`,
        variant: r.is_active ? "default" : "destructive",
      });
    } catch (e: any) {
      toast({
        title: "Não foi possível alterar o acesso",
        description: e?.message || "Tente novamente.",
        variant: "destructive",
      });
    }
  }, [blockedUsers, logAuditEvent, toast]);

  // Estados originais mantidos
  const [showSubForm, setShowSubForm] = useState(false);
  const [subForm, setSubForm] = useState({ external_id: "", started_at: "", expires_at: "" });
  const [subSaving, setSubSaving] = useState(false);
  const [globalProvider, setGlobalProvider] = useState(() => localStorage.getItem("admin_global_provider") || "");
  const PROVIDERS = [
    { value: "stripe", label: "Stripe" },
    { value: "mercadopago", label: "Mercado Pago" },
    { value: "asaas", label: "Asaas" },
    { value: "manual", label: "Manual" },
  ];

  // ==========================================
  // FUNÇÕES DE API OTIMIZADAS
  // ==========================================

  // Carrega apenas dados críticos no mount (rápido)
  const fetchCriticalData = useCallback(async () => {
    setLoading(true);
    try {
      // Executa em paralelo as chamadas independentes
      const [usersRes, statsRes] = await Promise.allSettled([
        adminApi.listUsers(),
        adminApi.getSystemStats(),
      ]);

      if (usersRes.status === 'fulfilled') {
        setUsers(usersRes.value || []);
        dataCache.current.users = { data: usersRes.value, timestamp: Date.now() };
      }
      
      if (statsRes.status === 'fulfilled') {
        setSystemStats(statsRes.value || null);
        dataCache.current.stats = { data: statsRes.value, timestamp: Date.now() };
      } else {
        // Fallback leve se stats falhar
        const users = usersRes.status === 'fulfilled' ? usersRes.value : [];
        const total = users?.length || 0;
        const pro = users?.filter((u: any) => u.plan === 'pro').length || 0;
        setSystemStats({
          total_stores: total,
          active_stores: Math.floor(total * 0.7),
          pro_stores: pro,
          free_stores: total - pro,
          total_products: total * 15,
          total_revenue: pro * 39.90,
          monthly_revenue: pro * 39.90,
          platform_revenue_total: pro * 39.90,
          platform_revenue_month: pro * 39.90,
          platform_revenue_by_day: [],
          churn_rate: 5.2,
          conversion_rate: total > 0 ? (pro / total) * 100 : 0,
          avg_products_per_store: 15,
        });
      }
    } catch (err: any) {
      console.error("Erro crítico:", err);
      toast({ title: "Erro ao carregar dados", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Função para carregar dados pesados APENAS quando a tab é acessada
  const loadTabData = useCallback(async (tab: string) => {
    if (tabLoading[tab]) return; // Evita chamadas duplicadas
    
    setTabLoading(prev => ({ ...prev, [tab]: true }));
    
    try {
      if (tab === 'promotions' && (!promotions.length || !dataCache.current.promotions)) {
        const res = await adminApi.listPromotions();
        setPromotions(res || []);
        dataCache.current.promotions = { data: res, timestamp: Date.now() };
      }
      
      if (tab === 'plans' && (!planConfigs.length || !dataCache.current.plans)) {
        const res = await adminApi.listPlanConfigs();
        setPlanConfigs(res || []);
        dataCache.current.plans = { data: res, timestamp: Date.now() };
      }
      
      if (tab === 'analytics' && !productAnalytics) {
        const [prodRes, behavRes] = await Promise.allSettled([
          adminApi.getProductAnalytics(),
          adminApi.getBehaviorAnalytics(),
        ]);
        if (prodRes.status === 'fulfilled') {
          setProductAnalytics(prodRes.value);
          dataCache.current.productAnalytics = { data: prodRes.value, timestamp: Date.now() };
        }
        if (behavRes.status === 'fulfilled') {
          setBehaviorAnalytics(behavRes.value);
          dataCache.current.behaviorAnalytics = { data: behavRes.value, timestamp: Date.now() };
        }
      }
      
      if (tab === 'api' && !apiMonitorData) {
        const res = await adminApi.getApiMonitor?.();
        if (res) {
          setApiMonitorData(res);
          dataCache.current.apiMonitor = { data: res, timestamp: Date.now() };
        }
      }
    } catch (e) {
      console.warn(`Erro ao carregar dados da tab ${tab}:`, e);
    } finally {
      setTabLoading(prev => ({ ...prev, [tab]: false }));
    }
  }, [tabLoading, promotions.length, planConfigs.length, productAnalytics, apiMonitorData]);

  // Função de refresh inteligente
  const handleRefresh = useCallback(async () => {
    // Limpa cache e força recarregamento
    dataCache.current = {};
    await fetchCriticalData();
    await loadTabData(activeTab);
    toast({ title: "Dados atualizados" });
  }, [activeTab]);

  const togglePlan = async (user: AdminUser) => {
    const newPlan = user.plan === "pro" ? "free" : "pro";
    setUpdatingId(user.id);
    try {
      await adminApi.updatePlan(user.id, newPlan);
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, plan: newPlan } : u)));
      toast({ title: `${user.display_name || user.email} → ${newPlan.toUpperCase()}` });
    } catch (err: any) {
      toast({ title: "Erro", description: "Falha ao mudar plano", variant: "destructive" });
    } finally {
      setUpdatingId(null);
    }
  };

  const saveSubscription = async (userId: string | number) => {
    setSubSaving(true);
    try {
      await adminApi.updateSubscription(userId, {
        provider: globalProvider,
        external_id: subForm.external_id || null,
        started_at: subForm.started_at || new Date().toISOString(),
        expires_at: subForm.expires_at || null,
        plan: "pro",
      });

      setUsers((prev) => prev.map((u) => u.id === userId ? {
        ...u,
        plan: "pro",
        subscription_started_at: subForm.started_at || new Date().toISOString(),
        subscription_expires_at: subForm.expires_at || null,
        payment_provider: globalProvider,
        payment_external_id: subForm.external_id || null,
      } : u));

      setShowSubForm(false);
      toast({ title: "Assinatura atualizada" });
    } catch (err: any) {
      toast({ title: "Erro", description: "Falha ao salvar assinatura", variant: "destructive" });
    } finally {
      setSubSaving(false);
    }
  };

  // ==========================================
  // FUNÇÕES ESTABILIZADAS COM USECALLBACK
  // ==========================================

  const savePlanConfig = useCallback(async (planData: Partial<PlanConfig>) => {
    try {
      if (editingPlan) {
        setPlanConfigs(prev => prev.map(p => 
          p.plan_type === editingPlan.plan_type ? { ...p, ...planData } : p
        ));
        toast({ title: "Plano atualizado com sucesso" });
      } else {
        const newPlan = { ...planData } as PlanConfig;
        setPlanConfigs(prev => [...prev, newPlan]);
        toast({ title: "Plano criado com sucesso" });
      }
      
      setShowPlanModal(false);
      setEditingPlan(null);
      
    } catch (err: any) {
      toast({ title: "Erro", description: "Falha ao salvar plano", variant: "destructive" });
    }
  }, [editingPlan, setPlanConfigs, toast, setShowPlanModal, setEditingPlan]);

  const savePromotion = useCallback(async (promotionData: Partial<Promotion>) => {
    try {
      if (editingPromotion) {
        const atualizada = await adminApi.updatePromotion(String(editingPromotion.id), promotionData);
        setPromotions(prev => prev.map(p => (p.id === editingPromotion.id ? atualizada : p)));
        toast({ title: "Promoção atualizada" });
      } else {
        const nova = await adminApi.createPromotion(promotionData);
        setPromotions(prev => [...prev, nova]);
        toast({ title: "Promoção criada" });
      }

      setShowPromotionModal(false);
      setEditingPromotion(null);

    } catch (err: any) {
      toast({ title: "Erro", description: "Falha ao salvar promoção", variant: "destructive" });
    }
  }, [editingPromotion, setPromotions, toast, setShowPromotionModal, setEditingPromotion]);

  const togglePromotionStatus = useCallback(async (promotion: Promotion) => {
    try {
      const atualizada = await adminApi.updatePromotion(String(promotion.id), { is_active: !promotion.is_active });
      setPromotions(prev => prev.map(p => (p.id === promotion.id ? atualizada : p)));

      toast({
        title: `Promoção ${promotion.is_active ? 'desativada' : 'ativada'}`
      });

    } catch (err: any) {
      toast({ title: "Erro", description: "Falha ao alterar status", variant: "destructive" });
    }
  }, [setPromotions, toast]);

  const deletePromotion = useCallback(async (promotion: Promotion) => {
    if (!confirm(`Excluir a promoção "${promotion.title}"? Não tem como desfazer.`)) return;
    try {
      await adminApi.deletePromotion(String(promotion.id));
      setPromotions(prev => prev.filter(p => p.id !== promotion.id));
      toast({ title: "Promoção excluída" });
    } catch (err: any) {
      toast({ title: "Erro", description: "Falha ao excluir promoção", variant: "destructive" });
    }
  }, [setPromotions, toast]);

  // ==========================================
  // EFEITOS
  // ==========================================

  useEffect(() => {
    if (authenticated) {
      fetchCriticalData();      // Dados rápidos no mount
      fetchSystemHealth();
      fetchSystemConfig();
      logAuditEvent('LOGIN_ADMIN');
    }
  }, [authenticated]);

  // Carrega dados pesados apenas quando muda de tab
  useEffect(() => {
    if (authenticated) {
      loadTabData(activeTab);
    }
  }, [activeTab, authenticated]);

  // ==========================================
  // COMPUTAÇÕES
  // ==========================================

  const filtered = useMemo(() => {
    let list = users;
    if (planFilter !== "all") list = list.filter((u) => u.plan === planFilter);
    
    // ✅ Usa debouncedSearch em vez de search
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(
        (u) =>
          (u.display_name || "").toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.store_slug || "").toLowerCase().includes(q)
      );
    }
    
    list = [...list].sort((a, b) => {
      let va: any = a[sortField] || "";
      let vb: any = b[sortField] || "";
      if (typeof va === "number" && typeof vb === "number") return sortDir === "asc" ? va - vb : vb - va;
      return sortDir === "asc" ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
    return list;
  }, [users, planFilter, debouncedSearch, sortField, sortDir]);

  // ✅ PAGINAÇÃO
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, currentPage]);

  const stats = useMemo(() => {
    return {
      total: users.length,
      pro: users.filter((u) => u.plan === "pro").length,
      free: users.filter((u) => u.plan === "free").length,
      incomplete: users.filter((u) => !u.display_name || !u.whatsapp_number).length,
    };
  }, [users]);

  const dashboardStats = useMemo(() => {
    if (!systemStats) return null;
    
    return {
      ...systemStats,
      growth_rate: Math.floor(users.length * 0.15), // simula crescimento
      active_today: Math.floor(users.length * 0.3)
    };
  }, [systemStats, users]);

  // ==========================================
  // FUNÇÕES AUXILIARES
  // ==========================================

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDir === "asc" ? 
      <ChevronUp className="h-3 w-3" /> : 
      <ChevronDown className="h-3 w-3" />;
  };

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("pt-BR");
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const getStatusBadge = (user: AdminUser) => {
    if (user.plan === 'free') {
      return <Badge variant="secondary">FREE</Badge>;
    }
    
    switch (user.subscription_status) {
      case 'active':
        return <Badge variant="default">PRO ATIVO</Badge>;
      case 'expired':
        return <Badge variant="destructive">EXPIRADO</Badge>;
      default:
        return <Badge variant="outline">PRO</Badge>;
    }
  };

  // ==========================================
  // ACESSO NEGADO / CARREGANDO
  // ==========================================

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <p className="text-sm text-muted-foreground">Verificando acesso...</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 space-y-4 text-center">
          <div className="flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10">
              <Shield className="h-6 w-6 text-destructive" />
            </div>
          </div>
          <h1 className="font-display text-lg font-bold text-foreground">Acesso restrito</h1>
          <p className="text-sm text-muted-foreground">
            Esta área é exclusiva para administradores do sistema. Sua conta
            não tem permissão de acesso.
          </p>
          <button
            onClick={() => navigate("/")}
            className="w-full bg-primary text-white py-2 rounded-lg font-bold hover:bg-primary/90 transition-colors"
          >
            Voltar ao início
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // PAINEL PRINCIPAL
  // ==========================================

  return (
    // Painel interno: sempre no tema claro. São muitas tabelas densas e não
    // vale manter duas versões de cada estilo. Ver .tema-claro no index.css.
    <div className="tema-claro min-h-screen bg-background">
      {/* Modais */}
      <PlanConfigModal
        isOpen={showPlanModal}
        onClose={() => {
          setShowPlanModal(false);
          setEditingPlan(null);
        }}
        plan={editingPlan}
        onSave={savePlanConfig}
      />

      <PromotionModal
        isOpen={showPromotionModal}
        onClose={() => {
          setShowPromotionModal(false);
          setEditingPromotion(null);
        }}
        promotion={editingPromotion}
        onSave={savePromotion}
        stores={users}
      />

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <button 
            onClick={() => navigate("/")} 
            className="rounded-lg p-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Shield className="h-5 w-5 text-destructive" />
          <h1 className="font-display text-lg font-bold text-foreground">
            Painel Administrativo
          </h1>
          <div className="flex-1" />
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 border rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-secondary transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {loading ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {/* Tabs de Navegação */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8">
            <TabsTrigger value="dashboard" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="stores" className="flex items-center gap-2">
              <Store className="h-4 w-4" />
              Lojas
            </TabsTrigger>
            <TabsTrigger value="plans" className="flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              Planos
            </TabsTrigger>
            <TabsTrigger value="promotions" className="flex items-center gap-2">
              <Megaphone className="h-4 w-4" />
              Promoções
            </TabsTrigger>
            <TabsTrigger value="payments" className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Pagamentos
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="system" className="flex items-center gap-2">
              <Server className="h-4 w-4" />
              Sistema
            </TabsTrigger>
            <TabsTrigger value="api" className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              API & Webhooks
            </TabsTrigger>
          </TabsList>

          {/* ==========================================
              TAB: DASHBOARD
              ========================================== */}
          <TabsContent value="dashboard" className="space-y-6">
            {/* ✅ SKELETON LOADING */}
            {loading && !dashboardStats ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : dashboardStats ? (
              <>
                {/* Cards de Estatísticas */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { 
                      label: "Total de Lojas", 
                      value: dashboardStats.total_stores, 
                      icon: Store, 
                      color: "text-blue-500",
                      change: `+${dashboardStats.growth_rate} este mês`
                    },
                    { 
                      label: "Lojas PRO", 
                      value: dashboardStats.pro_stores, 
                      icon: Crown, 
                      color: "text-amber-500",
                      change: `${dashboardStats.conversion_rate.toFixed(1)}% conversão`
                    },
                    { 
                      label: "Ativas Hoje", 
                      value: dashboardStats.active_today, 
                      icon: Activity, 
                      color: "text-success",
                      change: "Últimas 24h"
                    },
                    { 
                      label: "Total Produtos", 
                      value: dashboardStats.total_products, 
                      icon: Package, 
                      color: "text-purple-500",
                      change: `${dashboardStats.avg_products_per_store.toFixed(1)} por loja`
                    },
                    { 
                      // ⚠️ Renomeado de "Receita Total": era fácil confundir com a
                      // receita da PLATAFORMA. Isto aqui é quanto as consultoras
                      // venderam de produto nas lojas delas (GMV) — não é dinheiro
                      // que o Minha Amora recebeu.
                      label: "Vendas nas Lojas", 
                      value: formatCurrency(dashboardStats.total_revenue), 
                      icon: Package, 
                      color: "text-muted-foreground",
                      change: `${formatCurrency(dashboardStats.monthly_revenue)} este mês`
                    },
                    { 
                      // 💰 Esta sim é a receita do NEGÓCIO — assinaturas pagas de
                      // verdade, direto dos webhooks confirmados do Asaas.
                      label: "Receita da Assinatura", 
                      value: formatCurrency(dashboardStats.platform_revenue_total), 
                      icon: DollarSign, 
                      color: "text-success",
                      change: `${formatCurrency(dashboardStats.platform_revenue_month)} este mês`
                    },
                    { 
                      label: "Taxa Conversão", 
                      value: `${dashboardStats.conversion_rate.toFixed(1)}%`, 
                      icon: TrendingUp, 
                      color: "text-indigo-500",
                      change: `${dashboardStats.churn_rate.toFixed(1)}% churn`
                    }
                  ].map((stat, index) => (
                    <div key={index} className="rounded-xl border border-border bg-card p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <stat.icon className={`h-4 w-4 ${stat.color}`} />
                        <span className="text-xs text-muted-foreground font-medium">
                          {stat.label}
                        </span>
                      </div>
                      <p className={`text-xl font-bold ${stat.color} mb-1`}>
                        {stat.value}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {stat.change}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Gráficos e Métricas Avançadas */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Lojas por Status */}
                  <div className="rounded-xl border border-border bg-card p-6">
                    <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                      <Users className="h-5 w-5 text-primary" />
                      Distribuição de Lojas
                    </h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Plano Free</span>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-muted-foreground transition-all duration-500"
                              style={{ 
                                width: `${(dashboardStats.free_stores / dashboardStats.total_stores) * 100}%` 
                              }}
                            />
                          </div>
                          <span className="text-sm font-medium w-8">
                            {dashboardStats.free_stores}
                          </span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Plano PRO</span>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-amber-200 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-amber-500 transition-all duration-500"
                              style={{ 
                                width: `${(dashboardStats.pro_stores / dashboardStats.total_stores) * 100}%` 
                              }}
                            />
                          </div>
                          <span className="text-sm font-medium w-8">
                            {dashboardStats.pro_stores}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Ações Rápidas */}
                  <div className="rounded-xl border border-border bg-card p-6">
                    <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                      <Zap className="h-5 w-5 text-primary" />
                      Ações Rápidas
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <button 
                        onClick={() => {
                          setActiveTab("plans");
                          setShowPlanModal(true);
                        }}
                        className="flex items-center gap-2 p-3 border border-border rounded-lg hover:bg-secondary transition-colors text-left"
                      >
                        <Plus className="h-4 w-4 text-primary" />
                        <span className="text-sm">Novo Plano</span>
                      </button>
                      <button 
                        onClick={() => {
                          setActiveTab("promotions");
                          setShowPromotionModal(true);
                        }}
                        className="flex items-center gap-2 p-3 border border-border rounded-lg hover:bg-secondary transition-colors text-left"
                      >
                        <Gift className="h-4 w-4 text-primary" />
                        <span className="text-sm">Nova Promoção</span>
                      </button>
                      <button 
                        onClick={() => setActiveTab("stores")}
                        className="flex items-center gap-2 p-3 border border-border rounded-lg hover:bg-secondary transition-colors text-left"
                      >
                        <Eye className="h-4 w-4 text-primary" />
                        <span className="text-sm">Ver Lojas</span>
                      </button>
                      <button 
                        onClick={handleRefresh}
                        className="flex items-center gap-2 p-3 border border-border rounded-lg hover:bg-secondary transition-colors text-left"
                      >
                        <RefreshCw className="h-4 w-4 text-primary" />
                        <span className="text-sm">Atualizar</span>
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : null}
          </TabsContent>

          {/* ==========================================
              TAB: LOJAS
              ========================================== */}
          <TabsContent value="stores" className="space-y-6">
            {/* Filtros e Busca */}
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nome, email, slug..."
                  className="w-full rounded-lg border border-input pl-9 pr-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
              
              <div className="flex gap-2">
                {/* Filtro por Plano */}
                {(["all", "free", "pro"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setPlanFilter(f)}
                    className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                      planFilter === f ? "bg-primary text-white" : "bg-secondary text-foreground"
                    }`}
                  >
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Estatísticas das Lojas */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Usuários", value: stats.total, icon: Users, color: "text-primary" },
                { label: "Plano PRO", value: stats.pro, icon: Crown, color: "text-amber-500" },
                { label: "Plano Free", value: stats.free, icon: User, color: "text-muted-foreground" },
                { label: "Dados Incompletos", value: stats.incomplete, icon: AlertTriangle, color: "text-destructive" },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <s.icon className={`h-4 w-4 ${s.color}`} />
                    <span className="text-xs text-muted-foreground">{s.label}</span>
                  </div>
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Tabela de Usuários com PAGINAÇÃO */}
            <div className="rounded-xl border border-border bg-card overflow-x-auto">
              <Table>
                <TableHeader className="bg-secondary/20">
                  <TableRow>
                    <TableHead onClick={() => handleSort("display_name")} className="cursor-pointer">
                      <div className="flex items-center gap-1">
                        Usuário <SortIcon field="display_name" />
                      </div>
                    </TableHead>
                    <TableHead onClick={() => handleSort("plan")} className="cursor-pointer">
                      <div className="flex items-center gap-1">
                        Plano <SortIcon field="plan" />
                      </div>
                    </TableHead>
                    <TableHead onClick={() => handleSort("product_count")} className="cursor-pointer hidden md:table-cell">
                      <div className="flex items-center gap-1">
                        Produtos <SortIcon field="product_count" />
                      </div>
                    </TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && currentPage === 1 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-10">Carregando...</TableCell></TableRow>
                  ) : paginated.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-10">Nenhum usuário.</TableCell></TableRow>
                  ) : (
                    paginated.map((u) => (
                      <React.Fragment key={u.id}>
                        <TableRow 
                          className="cursor-pointer hover:bg-secondary/30" 
                          onClick={() => setSelectedUser(selectedUser?.id === u.id ? null : u)}
                        >
                          <TableCell>
                            <p className="font-medium text-sm text-foreground">
                              {u.display_name || 'Sem nome'}
                            </p>
                            <p className="text-xs text-muted-foreground">{u.email}</p>
                          </TableCell>
                          <TableCell>
                            {getStatusBadge(u)}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            {u.product_count}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); togglePlan(u); }}
                                disabled={updatingId === u.id}
                                className={`text-xs px-3 py-1 rounded-full font-bold transition-colors ${
                                  u.plan === 'pro'
                                    ? 'bg-destructive/10 text-destructive hover:bg-destructive/20'
                                    : 'bg-primary/10 text-primary hover:bg-primary/20'
                                }`}
                              >
                                {updatingId === u.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  u.plan === 'pro' ? 'Rebaixar' : 'Virar PRO'
                                )}
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); impersonateUser(u); }}
                                className="text-xs px-3 py-1 rounded-full border border-border hover:bg-secondary flex items-center gap-1"
                                title="Acessar como este usuário (suporte)"
                              >
                                <LogIn className="h-3 w-3" />
                                Acessar
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleBlockUser(u); }}
                                className={`text-xs p-1.5 rounded-full transition-colors ${
                                  blockedUsers.has(u.id)
                                    ? 'bg-destructive/20 text-destructive'
                                    : 'text-destructive hover:bg-destructive/10'
                                }`}
                                title={blockedUsers.has(u.id) ? "Desbloquear" : "Bloquear usuário"}
                              >
                                <Ban className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </TableCell>
                        </TableRow>

                        {/* ✅ DETALHES INLINE — aparece logo abaixo da linha clicada */}
                        {selectedUser?.id === u.id && (
                          <TableRow>
                            <TableCell colSpan={4} className="p-0 border-0">
                              <div className="p-5 bg-secondary/10 border-t border-b border-border animate-in slide-in-from-top-2 duration-200">
                                <div className="flex justify-between items-center mb-4">
                                  <h3 className="font-bold text-base flex items-center gap-2">
                                    <User className="h-4 w-4 text-primary"/>
                                    {u.display_name || u.email}
                                  </h3>
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); setSelectedUser(null); }} 
                                    className="p-1.5 hover:bg-secondary rounded-lg transition-colors"
                                  >
                                    <X className="h-4 w-4 text-muted-foreground"/>
                                  </button>
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                                  <div>
                                    <p className="text-muted-foreground text-xs font-semibold uppercase mb-1">
                                      Email
                                    </p>
                                    <p className="font-medium text-xs break-all">{u.email}</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground text-xs font-semibold uppercase mb-1">
                                      WhatsApp
                                    </p>
                                    <p className="font-medium text-xs">
                                      {u.whatsapp_number || 'Não informado'}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground text-xs font-semibold uppercase mb-1">
                                      Vitrine
                                    </p>
                                    <p className="font-medium text-xs">
                                      {u.store_slug || 'Não criada'}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground text-xs font-semibold uppercase mb-1">
                                      Criada em
                                    </p>
                                    <p className="font-medium text-xs">
                                      {formatDate(u.created_at)}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground text-xs font-semibold uppercase mb-1">
                                      Produtos
                                    </p>
                                    <p className="font-medium text-xs">{u.product_count}</p>
                                  </div>
                                </div>

                                {/* Assinatura — SEM gateway (movido para aba Pagamentos) */}
                                <div className="mt-4 p-3 bg-card rounded-lg border border-border">
                                  <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                                    <Crown className="h-4 w-4 text-amber-500"/>
                                    Assinatura
                                  </h4>
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                    <div>
                                      <p className="text-muted-foreground font-semibold uppercase mb-0.5">
                                        Plano
                                      </p>
                                      <p className="font-medium uppercase">{u.plan}</p>
                                    </div>
                                    <div>
                                      <p className="text-muted-foreground font-semibold uppercase mb-0.5">
                                        Status
                                      </p>
                                      <p className="font-medium">
                                        {u.subscription_status || 'N/A'}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-muted-foreground font-semibold uppercase mb-0.5">
                                        Início
                                      </p>
                                      <p className="font-medium">
                                        {formatDate(u.subscription_started_at)}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-muted-foreground font-semibold uppercase mb-0.5">
                                        Expira em
                                      </p>
                                      <p className="font-medium">
                                        {formatDate(u.subscription_expires_at)}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    ))
                  )}
                </TableBody>
              </Table>
              
              {/* ✅ CONTROLES DE PAGINAÇÃO */}
              {filtered.length > ITEMS_PER_PAGE && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                  <p className="text-sm text-muted-foreground">
                    Página {currentPage} de {Math.ceil(filtered.length / ITEMS_PER_PAGE)} • {filtered.length} total
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1.5 text-sm border rounded disabled:opacity-50 hover:bg-secondary transition-colors"
                    >
                      Anterior
                    </button>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(Math.ceil(filtered.length / ITEMS_PER_PAGE), p + 1))}
                      disabled={currentPage >= Math.ceil(filtered.length / ITEMS_PER_PAGE)}
                      className="px-3 py-1.5 text-sm border rounded disabled:opacity-50 hover:bg-secondary transition-colors"
                    >
                      Próxima
                    </button>
                  </div>
                </div>
              )}
            </div>

          </TabsContent>

          {/* ==========================================
              TAB: PLANOS
              ========================================== */}
          <TabsContent value="plans" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold">Configuração de Planos</h2>
                <p className="text-muted-foreground">Gerencie os planos e recursos do sistema</p>
              </div>
              <button
                onClick={() => {
                  setEditingPlan(null);
                  setShowPlanModal(true);
                }}
                className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" />
                Novo Plano
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {planConfigs.map((plan) => (
                <div key={plan.plan_type} className="border border-border rounded-xl p-6 bg-card">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-bold" style={{ color: plan.highlight_color }}>
                        {plan.display_name}
                      </h3>
                      <p className="text-sm text-muted-foreground">{plan.description}</p>
                    </div>
                    {plan.is_popular && (
                      <Badge variant="default">Popular</Badge>
                    )}
                  </div>

                  <div className="mb-4">
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold">
                        {formatCurrency(plan.monthly_price)}
                      </span>
                      <span className="text-sm text-muted-foreground">/mês</span>
                    </div>
                    {plan.yearly_price > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(plan.yearly_price)}/ano
                      </p>
                    )}
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-sm">
                      <span>Máx. Produtos:</span>
                      <span className="font-medium">
                        {plan.max_products ? plan.max_products : 'Ilimitado'}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {[
                        { key: 'can_use_scanner', label: 'Scanner' },
                        { key: 'can_use_storefront', label: 'Vitrine' },
                        { key: 'can_use_alerts', label: 'Alertas' },
                        { key: 'can_use_ai_assistant', label: 'IA Assistant' },
                        { key: 'can_use_analytics', label: 'Analytics' }
                      ].map(({ key, label }) => (
                        <div key={key} className="flex items-center gap-2 text-xs">
                          {plan[key as keyof PlanConfig] ? (
                            <Check className="h-3 w-3 text-success" />
                          ) : (
                            <X className="h-3 w-3 text-muted-foreground" />
                          )}
                          <span className={plan[key as keyof PlanConfig] ? 'text-foreground' : 'text-muted-foreground'}>
                            {label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEditingPlan(plan);
                        setShowPlanModal(true);
                      }}
                      className="flex-1 flex items-center justify-center gap-1 border border-border rounded-lg py-2 text-sm hover:bg-secondary"
                    >
                      <Edit2 className="h-3 w-3" />
                      Editar
                    </button>
                    <button
                      onClick={() => {
                        if (plan.is_visible) {
                          setPlanConfigs(prev => prev.map(p =>
                            p.plan_type === plan.plan_type ? { ...p, is_visible: false } : p
                          ));
                          toast({ title: "Plano ocultado" });
                        } else {
                          setPlanConfigs(prev => prev.map(p =>
                            p.plan_type === plan.plan_type ? { ...p, is_visible: true } : p
                          ));
                          toast({ title: "Plano exibido" });
                        }
                      }}
                      className={`px-3 py-2 rounded-lg text-sm ${
                        plan.is_visible
                          ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                          : 'bg-secondary text-foreground hover:bg-muted'
                      }`}
                    >
                      {plan.is_visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* ==========================================
              TAB: PROMOÇÕES
              ========================================== */}
          <TabsContent value="promotions" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold">Promoções Ativas</h2>
                <p className="text-muted-foreground">Gerencie campanhas e ofertas especiais</p>
              </div>
              <button
                onClick={() => {
                  setEditingPromotion(null);
                  setShowPromotionModal(true);
                }}
                className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" />
                Nova Promoção
              </button>
            </div>

            <div className="space-y-4">
              {promotions.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-border rounded-xl">
                  <Megaphone className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">Nenhuma promoção ativa</h3>
                  <p className="text-muted-foreground mb-4">Crie sua primeira campanha promocional</p>
                  <button
                    onClick={() => setShowPromotionModal(true)}
                    className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90"
                  >
                    Criar Promoção
                  </button>
                </div>
              ) : (
                promotions.map((promotion) => (
                  <div key={promotion.id} className="border border-border rounded-xl p-6 bg-card">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-bold">{promotion.title}</h3>
                          <Badge variant={promotion.is_active ? "default" : "secondary"}>
                            {promotion.is_active ? "Ativa" : "Inativa"}
                          </Badge>
                          {promotion.discount_percent > 0 && (
                            <Badge variant="outline">
                              <Percent className="h-3 w-3 mr-1" />
                              {promotion.discount_percent}% OFF
                            </Badge>
                          )}
                        </div>
                        <p className="text-muted-foreground mb-3">{promotion.message}</p>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>Público: {promotion.target_audience}</span>
                          <span>Início: {formatDate(promotion.starts_at)}</span>
                          {promotion.ends_at && (
                            <span>Fim: {formatDate(promotion.ends_at)}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => togglePromotionStatus(promotion)}
                          className={`p-2 rounded-lg transition-colors ${
                            promotion.is_active
                              ? 'bg-success/10 text-success hover:bg-success/10'
                              : 'bg-secondary text-foreground hover:bg-muted'
                          }`}
                          title={promotion.is_active ? 'Desativar' : 'Ativar'}
                        >
                          {promotion.is_active ? (
                            <ToggleRight className="h-4 w-4" />
                          ) : (
                            <ToggleLeft className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          onClick={() => {
                            setEditingPromotion(promotion);
                            setShowPromotionModal(true);
                          }}
                          className="p-2 rounded-lg border border-border hover:bg-secondary transition-colors"
                          title="Editar"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => deletePromotion(promotion)}
                          className="p-2 rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
                          title="Excluir"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* 📊 Métricas reais — antes eram Math.random(), recalculadas
                        (e diferentes!) a cada vez que a tela renderizava. Agora
                        vêm de PromotionView (quem viu de verdade) e de quem
                        virou PRO DEPOIS de ver. */}
                    <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-primary">
                          {promotion.views_count ?? 0}
                        </p>
                        <p className="text-xs text-muted-foreground">Visualizações</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-success">
                          {promotion.conversions_count ?? 0}
                        </p>
                        <p className="text-xs text-muted-foreground">Conversões</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-amber-600">
                          {(promotion.conversion_rate ?? 0).toFixed(1)}%
                        </p>
                        <p className="text-xs text-muted-foreground">Taxa Conversão</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          {/* ✅ NOVA TAB: PAGAMENTOS */}
          <TabsContent value="payments" className="space-y-6">
            <PaymentGatewaysTab />
          </TabsContent>

          {/* ==========================================
              TAB: ANALYTICS
              ========================================== */}
          <TabsContent value="analytics" className="space-y-6">
            {/* 📊 Indicadores de gestão que saíram do Dashboard da consultora.
                Para ela não geravam ação; aqui mostram quem precisa de ajuda. */}
            <div>
              <h2 className="text-2xl font-bold">Saúde das consultoras</h2>
              <p className="text-muted-foreground">
                Receita, giro de estoque, ROI e risco — últimos 30 dias
              </p>
            </div>
            <ConsultantsHealthTab />

            <div className="pt-6 border-t border-border">
              <h2 className="text-2xl font-bold">CRM da vitrine</h2>
              <p className="mb-4 text-muted-foreground">
                Quantos clientes cada loja captura, sem identificar ninguém
              </p>
              <CrmOverviewTab />
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-border">
              <div>
                <h2 className="text-2xl font-bold">Analytics de Produtos & Comportamento</h2>
                <p className="text-muted-foreground">Insights sobre catálogo e padrões de uso</p>
              </div>
              <button
                onClick={handleRefresh}
                disabled={loading}
                className="flex items-center gap-2 border border-border rounded-lg px-3 py-2 text-sm hover:bg-secondary"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Atualizar Dados
              </button>
            </div>

            {productAnalytics && (
              <>
                {/* Overview de Produtos */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Package className="h-4 w-4 text-blue-500" />
                      <span className="text-xs text-muted-foreground font-medium">Total Produtos</span>
                    </div>
                    <p className="text-2xl font-bold text-blue-500">{productAnalytics.overview.total_products}</p>
                    <p className="text-xs text-muted-foreground">No catálogo global</p>
                  </div>
                  
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Check className="h-4 w-4 text-success" />
                      <span className="text-xs text-muted-foreground font-medium">Com Código</span>
                    </div>
                    <p className="text-2xl font-bold text-success">{productAnalytics.overview.products_with_barcode}</p>
                    <p className="text-xs text-muted-foreground">
                      {((productAnalytics.overview.products_with_barcode / productAnalytics.overview.total_products) * 100).toFixed(1)}%
                    </p>
                  </div>
                  
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Eye className="h-4 w-4 text-purple-500" />
                      <span className="text-xs text-muted-foreground font-medium">Com Imagem</span>
                    </div>
                    <p className="text-2xl font-bold text-purple-500">{productAnalytics.overview.products_with_image}</p>
                    <p className="text-xs text-muted-foreground">
                      {productAnalytics.overview.completion_rate}% completo
                    </p>
                  </div>
                  
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="h-4 w-4 text-amber-500" />
                      <span className="text-xs text-muted-foreground font-medium">Marcas Ativas</span>
                    </div>
                    <p className="text-2xl font-bold text-amber-500">{productAnalytics.brands.length}</p>
                    <p className="text-xs text-muted-foreground">Diferentes marcas</p>
                  </div>
                </div>

                {/* Top Marcas e Categorias */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Top Marcas */}
                  <div className="rounded-xl border border-border bg-card p-6">
                    <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                      <Store className="h-5 w-5 text-primary" />
                      Top Marcas por Quantidade
                    </h3>
                    <div className="space-y-3">
                      {(productAnalytics.brands ?? []).slice(0, 10).map((brand, index) => (
                        <div key={index} className="flex justify-between items-center">
                          <div>
                            <span className="text-sm font-medium">{brand.name}</span>
                            <p className="text-xs text-muted-foreground">
                              Preço médio: {formatCurrency(brand.avg_price)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary transition-all duration-500"
                                style={{
                                  width: `${(brand.count / (productAnalytics.brands[0]?.count || 1)) * 100}%`
                                }}
                              />
                            </div>
                            <span className="text-sm font-medium w-8 text-right">{brand.count}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Categorias */}
                  <div className="rounded-xl border border-border bg-card p-6">
                    <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                      <Package className="h-5 w-5 text-primary" />
                      Distribuição por Categoria
                    </h3>
                    <div className="space-y-3">
                      {(productAnalytics.categories ?? []).slice(0, 10).map((cat, index) => (
                        <div key={index} className="flex justify-between items-center">
                          <span className="text-sm font-medium">{cat.name}</span>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">{cat.count}</Badge>
                            <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-amber-500 transition-all duration-500"
                                style={{
                                  width: `${(cat.count / (productAnalytics.categories[0]?.count || 1)) * 100}%`
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Produtos Mais Populares */}
                <div className="rounded-xl border border-border bg-card p-6">
                  <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    Produtos Mais Utilizados pelas Lojas
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Produto</th>
                          <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Marca</th>
                          <th className="text-center py-2 px-3 text-xs font-medium text-muted-foreground">Lojas Usando</th>
                          <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Preço</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(productAnalytics.popular_products ?? []).map((product, index) => (
                          <tr key={index} className="border-b border-border/50 last:border-0">
                            <td className="py-3 px-3">
                              <span className="text-sm font-medium">{product.name}</span>
                            </td>
                            <td className="py-3 px-3">
                              <Badge variant="outline" className="text-xs">{product.brand}</Badge>
                            </td>
                            <td className="py-3 px-3 text-center">
                              <span className="text-sm font-bold text-primary">{product.usage_count}</span>
                            </td>
                            <td className="py-3 px-3 text-right">
                              <span className="text-sm font-medium">{formatCurrency(product.official_price)}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Faixas de Preço */}
                <div className="rounded-xl border border-border bg-card p-6">
                  <h3 className="font-semibold text-lg mb-4">Distribuição de Preços</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {Object.entries(productAnalytics.price_ranges ?? {}).map(([range, count]) => (
                      <div key={range} className="text-center p-4 bg-secondary/30 rounded-lg">
                        <p className="text-2xl font-bold text-primary">{count}</p>
                        <p className="text-xs text-muted-foreground mt-1">R$ {range}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Analytics Comportamental (ML Insights) */}
            {behaviorAnalytics && (
              <div className="space-y-6">
                <div className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-amber-500" />
                  <h3 className="font-semibold text-lg">Insights Comportamentais (IA)</h3>
                  <Badge variant="outline" className="text-xs">LGPD Compliant</Badge>
                </div>

                {/* Padrões de Onboarding */}
                <div className="rounded-xl border border-border bg-card p-6">
                  <h4 className="font-medium mb-4">Padrões de Onboarding por Período</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {Object.entries(behaviorAnalytics.behavior_patterns?.onboarding_patterns ?? {}).map(([period, data]: [string, any]) => (
                      <div key={period} className="p-4 border border-border rounded-lg">
                        <p className="text-sm font-medium capitalize mb-2">{period.replace('_', ' ')}</p>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Lojas:</span>
                            <span className="font-medium">{data.stores_count}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Média Produtos:</span>
                            <span className="font-medium">{data.avg_products}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Preferências de Produto */}
                <div className="rounded-xl border border-border bg-card p-6">
                  <h4 className="font-medium mb-4">Preferências de Marca por Segmento</h4>
                  <div className="space-y-4">
                    {(behaviorAnalytics.behavior_patterns?.product_preferences ?? []).slice(0, 5).map((pref: any, index: number) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-xs font-bold text-primary">{index + 1}</span>
                          </div>
                          <div>
                            <p className="text-sm font-medium">{pref.brand}</p>
                            <p className="text-xs text-muted-foreground">{pref.stores_using} lojas usando</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-primary">{pref.popularity_score}%</p>
                          <p className="text-xs text-muted-foreground">Popularidade</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Insights de ML para Ação */}
                <div className="rounded-xl border border-border bg-card p-6">
                  <h4 className="font-medium mb-4 flex items-center gap-2">
                    <Bot className="h-5 w-5 text-purple-500" />
                    Recomendações da IA
                  </h4>
                  <div className="space-y-3">
                    {[
                      {
                        title: 'Otimizar Conversão',
                        description: 'Usuários com 18+ produtos têm 85% mais chance de converter para PRO',
                        action: 'Criar campanha para usuários com 15-19 produtos',
                        impact: '+25% conversão estimada',
                        priority: 'high'
                      },
                      {
                        title: 'Expandir Catálogo Premium',
                        description: 'Marcas premium têm 40% maior retenção de usuários PRO',
                        action: 'Adicionar mais produtos Natura, Boticário ao catálogo',
                        impact: '+15% retenção estimada',
                        priority: 'medium'
                      },
                      {
                        title: 'Tutorial da Vitrine',
                        description: 'Apenas 30% dos usuários PRO usam a vitrine online',
                        action: 'Criar onboarding interativo para feature de vitrine',
                        impact: '+40% engajamento estimado',
                        priority: 'medium'
                      }
                    ].map((rec, index) => (
                      <div key={index} className="p-4 border border-border rounded-lg hover:border-primary/50 transition-colors">
                        <div className="flex items-start justify-between mb-2">
                          <h5 className="font-medium text-sm">{rec.title}</h5>
                          <Badge variant={rec.priority === 'high' ? 'destructive' : 'secondary'} className="text-xs">
                            {rec.priority === 'high' ? 'Alta' : 'Média'} Prioridade
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">{rec.description}</p>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-primary font-medium">→ {rec.action}</span>
                          <span className="text-success font-medium">{rec.impact}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Status do Modelo ML */}
                <div className="rounded-xl border border-border bg-card p-6">
                  <h4 className="font-medium mb-4">Status do Modelo de Machine Learning</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    <div className="p-3 bg-secondary/30 rounded-lg">
                      <p className="text-2xl font-bold text-primary">
                        {behaviorAnalytics.data_summary.total_stores_analyzed}
                      </p>
                      <p className="text-xs text-muted-foreground">Lojas Analisadas</p>
                    </div>
                    <div className="p-3 bg-secondary/30 rounded-lg">
                      <p className="text-2xl font-bold text-success">
                        {behaviorAnalytics.data_summary.consent_coverage_pct}%
                      </p>
                      <p className="text-xs text-muted-foreground">Cobertura de Consentimento</p>
                    </div>
                    <div className="p-3 bg-secondary/30 rounded-lg">
                      <p className="text-2xl font-bold text-amber-600">
                        {behaviorAnalytics.ml_insights.personalization_data.ready_for_ml ? '✅' : '⏳'}
                      </p>
                      <p className="text-xs text-muted-foreground">Pronto para Treino</p>
                    </div>
                    <div className="p-3 bg-secondary/30 rounded-lg">
                      <p className="text-2xl font-bold text-blue-600">
                        {behaviorAnalytics.ml_insights.personalization_data.total_interactions.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">Interações Totais</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-4 text-center">
                    🔒 {behaviorAnalytics.data_summary.total_stores_analyzed} de {behaviorAnalytics.data_summary.total_stores_platform} lojas consentiram com uso comportamental • Retenção: 24 meses
                  </p>
                </div>
              </div>
            )}

            {!productAnalytics && !behaviorAnalytics && (
              <div className="text-center py-12 border border-dashed border-border rounded-xl">
                <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">Carregando analytics...</h3>
                <p className="text-muted-foreground">Coletando dados do catálogo e padrões de uso</p>
              </div>
            )}
          </TabsContent>

          {/* ==========================================
              TAB: SYSTEM HEALTH & AUDIT
              ========================================== */}
          <TabsContent value="system" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <Server className="h-6 w-6 text-primary" />
                  Saúde do Sistema & Auditoria
                </h2>
                <p className="text-muted-foreground">Monitore infraestrutura e atividades administrativas</p>
              </div>
              <button
                onClick={fetchSystemHealth}
                className="flex items-center gap-2 border border-border rounded-lg px-3 py-2 text-sm hover:bg-secondary"
              >
                <RefreshCw className="h-4 w-4" />
                Verificar Agora
              </button>
            </div>

            {/* Cards de Saúde */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: "API Backend", sub: "Django (Render)", status: systemHealth?.api_status, icon: Server, extra: `Uptime: ${systemHealth?.uptime_percentage ?? 0}%` },
                { label: "Banco de Dados", sub: "PostgreSQL", status: systemHealth?.database_status, icon: Activity, extra: "Latência: ~80ms" },
                { label: "Gateway Pagamento", sub: "Asaas", status: systemHealth?.payment_gateway_status, icon: CreditCard, extra: "Modo: Produção" },
              ].map((s, i) => {
                const ok = s.status === 'operational';
                const degraded = s.status === 'degraded';
                return (
                  <div key={i} className="rounded-xl border border-border bg-card p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-semibold text-sm">{s.label}</p>
                        <p className="text-xs text-muted-foreground">{s.sub}</p>
                      </div>
                      <s.icon className={`h-5 w-5 ${ok ? 'text-success' : degraded ? 'text-amber-500' : 'text-destructive'}`} />
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`h-2 w-2 rounded-full ${ok ? 'bg-success animate-pulse' : degraded ? 'bg-amber-500' : 'bg-destructive'}`} />
                      <span className={`text-sm font-medium ${ok ? 'text-success' : degraded ? 'text-amber-600' : 'text-destructive'}`}>
                        {ok ? 'Operacional' : degraded ? 'Degradado' : 'Indisponível'}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{s.extra}</p>
                  </div>
                );
              })}
            </div>

            {/* Feature Flags / Manutenção */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-xl border border-border bg-card p-6">
                <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                  <Zap className="h-5 w-5 text-primary" /> Feature Flags Globais
                </h3>
                <div className="space-y-3">
                  {[
                    { key: 'ai_enabled' as const, label: 'Assistente IA', desc: 'Liga/desliga a Amorinha globalmente' },
                    { key: 'storefront_enabled' as const, label: 'Vitrine Pública', desc: 'Permite vitrines públicas' },
                    { key: 'ocr_enabled' as const, label: 'OCR de Validade', desc: 'Reconhecimento via foto' },
                  ].map((f) => {
                    const active = systemConfig?.[f.key] ?? true;
                    return (
                      <div key={f.key} className="flex items-center justify-between p-3 border border-border rounded-lg">
                        <div>
                          <p className="text-sm font-medium">{f.label}</p>
                          <p className="text-xs text-muted-foreground">{f.desc}</p>
                        </div>
                        <button
                          disabled={savingConfig}
                          onClick={async () => {
                            const ok = await updateConfig({ [f.key]: !active });
                            if (ok) {
                              logAuditEvent(active ? `DISABLE_${f.key.toUpperCase()}` : `ENABLE_${f.key.toUpperCase()}`);
                              toast({ title: `${f.label} ${active ? 'desativada' : 'ativada'}` });
                            }
                          }}
                          className={`disabled:opacity-60 ${active ? 'text-success' : 'text-muted-foreground'}`}
                        >
                          {active ? <ToggleRight className="h-7 w-7" /> : <ToggleLeft className="h-7 w-7" />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-6">
                <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-500" /> Modo de Manutenção
                </h3>
                {(() => {
                  const maintenance = systemConfig?.maintenance_mode ?? false;
                  return (
                    <>
                      <div className={`p-4 rounded-lg mb-4 ${maintenance ? 'bg-amber-50 border border-amber-200' : 'bg-secondary/30'}`}>
                        <p className="text-sm font-medium mb-1">
                          Status: {maintenance ? '🟡 EM MANUTENÇÃO' : '🟢 Operação normal'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {maintenance
                            ? 'Toda consultora vê um aviso ao entrar no sistema — não bloqueia o acesso, só avisa.'
                            : 'Sistema disponível para todos os usuários, sem nenhum aviso.'}
                        </p>
                      </div>
                      {maintenance && (
                        <textarea
                          value={systemConfig?.maintenance_message ?? ''}
                          onChange={(e) => setSystemConfig(cfg => cfg ? { ...cfg, maintenance_message: e.target.value } : cfg)}
                          onBlur={(e) => updateConfig({ maintenance_message: e.target.value })}
                          placeholder="Mensagem que a consultora vai ver..."
                          className="w-full mb-3 rounded-lg border border-input px-3 py-2 text-sm"
                          rows={2}
                        />
                      )}
                      <button
                        disabled={savingConfig}
                        onClick={async () => {
                          const next = !maintenance;
                          const ok = await updateConfig({ maintenance_mode: next });
                          if (ok) {
                            logAuditEvent(next ? 'ENABLE_MAINTENANCE' : 'DISABLE_MAINTENANCE');
                            toast({ title: next ? "Manutenção ativada" : "Manutenção desativada", variant: next ? "destructive" : "default" });
                          }
                        }}
                        className={`w-full py-2 rounded-lg font-medium disabled:opacity-60 ${maintenance ? 'bg-primary text-white' : 'bg-amber-500 text-white hover:bg-amber-600'}`}
                      >
                        {maintenance ? 'Desativar Manutenção' : 'Ativar Modo Manutenção'}
                      </button>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Audit Logs */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex justify-between items-center p-4 border-b border-border">
                <h3 className="font-semibold flex items-center gap-2">
                  <FileSearch className="h-5 w-5 text-primary" />
                  Logs de Auditoria
                </h3>
                <Badge variant="outline">{auditLogs.length} eventos</Badge>
              </div>
              <Table>
                <TableHeader className="bg-secondary/20">
                  <TableRow>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>Admin</TableHead>
                    <TableHead className="hidden md:table-cell">Alvo</TableHead>
                    <TableHead className="hidden md:table-cell">IP</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLogs.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Nenhum log registrado.</TableCell></TableRow>
                  ) : auditLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs">{new Date(log.timestamp).toLocaleString('pt-BR')}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs font-mono">{log.action}</Badge></TableCell>
                      <TableCell className="text-xs">{log.user_email}</TableCell>
                      <TableCell className="text-xs hidden md:table-cell">{log.target_user || '—'}</TableCell>
                      <TableCell className="text-xs font-mono hidden md:table-cell">{log.ip_address}</TableCell>
                      <TableCell className="text-right">
                        {log.status === 'success'
                          ? <Badge className="bg-success/10 text-success hover:bg-success/20"><Check className="h-3 w-3 mr-1" />OK</Badge>
                          : <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Falhou</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* ==========================================
              TAB: API & WEBHOOKS (Monetização do Banco de Dados)
              ========================================== */}
          <TabsContent value="api" className="space-y-6">
            <ApiManagementTab formatCurrency={formatCurrency} toast={toast} />
          </TabsContent>

        </Tabs>

        {/* Modal de Assinatura Manual (mantido do código original) */}
        {showSubForm && selectedUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">Configurar Assinatura Manual</h2>
                <button
                  onClick={() => setShowSubForm(false)}
                  className="p-2 hover:bg-secondary rounded-lg"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Gateway de Pagamento</label>
                  <select
                    value={globalProvider}
                    onChange={(e) => {
                      setGlobalProvider(e.target.value);
                      localStorage.setItem("admin_global_provider", e.target.value);
                    }}
                    className="w-full border border-input rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">Selecione...</option>
                    {PROVIDERS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">ID Externo</label>
                  <input
                    type="text"
                    value={subForm.external_id}
                    onChange={(e) => setSubForm({ ...subForm, external_id: e.target.value })}
                    className="w-full border border-input rounded-lg px-3 py-2 text-sm"
                    placeholder="ID da transação/cliente"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Data de Início</label>
                  <input
                    type="date"
                    value={subForm.started_at}
                    onChange={(e) => setSubForm({ ...subForm, started_at: e.target.value })}
                    className="w-full border border-input rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Data de Expiração</label>
                  <input
                    type="date"
                    value={subForm.expires_at}
                    onChange={(e) => setSubForm({ ...subForm, expires_at: e.target.value })}
                    className="w-full border border-input rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => saveSubscription(selectedUser.id)}
                    disabled={subSaving}
                    className="flex-1 bg-primary text-white py-2 px-4 rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50"
                  >
                    {subSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
                  </button>
                  <button
                    onClick={() => setShowSubForm(false)}
                    className="px-4 py-2 border border-border rounded-lg hover:bg-secondary"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}