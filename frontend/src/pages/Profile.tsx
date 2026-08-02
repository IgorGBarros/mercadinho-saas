// pages/Profile.tsx — VERSÃO REFATORADA COM TEMA DINÂMICO
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, User, Mail, Phone, Store, Crown, Calendar,
  CreditCard, Save, Loader2, CheckCircle2, AlertTriangle, Copy, Check, ExternalLink,
} from "lucide-react";
import { profileApi, Profile as ProfileType } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { usePlan } from "../hooks/usePlan";
import { useToast } from '../components/ui/use-toast'; // ✅ Importar useToast original para evitar dependência circular
import { Badge } from "../components/ui/badge";

export default function Profile() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isPro } = usePlan();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [profile, setProfile] = useState<ProfileType | null>(null);

  const [form, setForm] = useState({
    display_name: "",
    whatsapp_number: "",
    store_slug: "",
  });

  useEffect(() => {
    if (!user) return;

    profileApi
      .get()
      .then((data) => {
        setProfile(data);
        setForm({
          display_name: data.display_name || user.name || "",
          whatsapp_number: data.whatsapp_number || "",
          store_slug: data.store_slug || "",
        });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [user]);

  const missingFields = [
    !form.display_name && "Nome",
    !form.whatsapp_number && "WhatsApp",
  ].filter(Boolean);

  const completionPercent = Math.round(
    ([form.display_name, form.whatsapp_number, user?.email, form.store_slug].filter(
      Boolean
    ).length /
      4) *
      100
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        display_name: form.display_name?.trim() || "",
        whatsapp_number: form.whatsapp_number?.trim() || "",
        store_slug: form.store_slug?.trim().toLowerCase() || "",
      };
      const updated = await profileApi.update(payload as any);
      setProfile(updated);
      toast({ title: "Perfil atualizado com sucesso!" });
    } catch (err: any) {
      console.error("Erro ao salvar perfil:", err);
      toast({
        title: "Erro ao salvar",
        description:
          err.message ||
          "Este nome de vitrine já está em uso ou ocorreu um erro no servidor.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
      </div>
    );
  }

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
            Meu Perfil
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-6 py-6 space-y-5">
        {/* ══════════════════════════════════════════
            COMPLETION BANNER
            ══════════════════════════════════════════ */}
        {missingFields.length > 0 && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-destructive">
                Complete seu perfil
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Preencha os campos obrigatórios para aproveitar todos os
                recursos: {missingFields.join(", ")}.
              </p>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            PROFILE CARD
            ══════════════════════════════════════════ */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-5">
          <div className="flex items-center gap-4">
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
                isPro ? "bg-brand/10" : "bg-secondary"
              }`}
            >
              {isPro ? (
                <Crown className="h-7 w-7 text-brand" />
              ) : (
                <User className="h-7 w-7 text-muted-foreground" />
              )}
            </div>
            <div>
              <p className="text-lg font-bold text-foreground">
                {form.display_name || "Sem nome"}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge
                  variant={isPro ? "default" : "secondary"}
                  className="text-[10px] uppercase"
                >
                  {isPro ? "PRO" : "FREE"}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {completionPercent}% completo
                </span>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                completionPercent === 100 ? "bg-success" : "bg-brand"
              }`}
              style={{ width: `${completionPercent}%` }}
            />
          </div>
        </div>

        {/* ══════════════════════════════════════════
            EDITABLE FIELDS
            ══════════════════════════════════════════ */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h2 className="font-display text-sm font-semibold text-foreground">
            Informações Pessoais
          </h2>

          <div>
            <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <User className="h-3.5 w-3.5" /> Nome de Exibição
              {!form.display_name && (
                <AlertTriangle className="h-3 w-3 text-destructive" />
              )}
            </label>
            <input
              type="text"
              value={form.display_name}
              onChange={(e) =>
                setForm((p) => ({ ...p, display_name: e.target.value }))
              }
              placeholder="Seu nome completo"
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Mail className="h-3.5 w-3.5" /> Email
            </label>
            <div className="mt-1 flex items-center gap-2 rounded-lg border border-input bg-secondary/30 px-3 py-2">
              <p className="text-sm text-foreground">{user?.email}</p>
              <CheckCircle2 className="h-3.5 w-3.5 text-brand ml-auto" />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Phone className="h-3.5 w-3.5" /> WhatsApp (com DDD)
              {!form.whatsapp_number && (
                <AlertTriangle className="h-3 w-3 text-destructive" />
              )}
            </label>
            <input
              type="tel"
              value={form.whatsapp_number}
              onChange={(e) =>
                setForm((p) => ({ ...p, whatsapp_number: e.target.value }))
              }
              placeholder="5511999999999"
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Usado para clientes contatarem pela vitrine
            </p>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Store className="h-3.5 w-3.5" /> Slug da Vitrine
            </label>
            <div className="mt-1 flex items-center gap-1">
              <span className="text-xs text-muted-foreground">/vitrine/</span>
              <input
                type="text"
                value={form.store_slug}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    store_slug: e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9-]/g, ""),
                  }))
                }
                placeholder="maria-natura"
                className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════
            LINK DA VITRINE
            ══════════════════════════════════════════ */}
        {form.store_slug && (
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h2 className="font-display text-sm font-semibold text-foreground flex items-center gap-2">
              <Store className="h-4 w-4 text-brand" /> Sua Vitrine
            </h2>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={`${window.location.origin}/vitrine/${form.store_slug}`}
                className="flex-1 rounded-lg border border-input bg-secondary/30 px-3 py-2 text-xs font-mono text-muted-foreground outline-none"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(
                    `${window.location.origin}/vitrine/${form.store_slug}`
                  );
                  setCopied(true);
                  toast({ title: "Link copiado!" });
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-secondary text-foreground hover:bg-secondary/80"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-brand" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
              <a
                href={`/vitrine/${form.store_slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-secondary text-foreground hover:bg-secondary/80"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            SUBSCRIPTION INFO
            ══════════════════════════════════════════ */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h2 className="font-display text-sm font-semibold text-foreground flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-brand" /> Assinatura
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-secondary/30 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Crown className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                  Plano
                </span>
              </div>
              <Badge
                variant={isPro ? "default" : "secondary"}
                className="text-xs uppercase"
              >
                {isPro ? "PRO" : "FREE"}
              </Badge>
            </div>
            <div className="rounded-lg bg-secondary/30 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Calendar className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                  Status
                </span>
              </div>
              <Badge
                variant={isPro ? "default" : "secondary"}
                className="text-xs"
              >
                {isPro ? "Ativa" : "Sem assinatura"}
              </Badge>
            </div>
          </div>

          {!isPro && (
            <button
              onClick={() => navigate("/plans")}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              <Crown className="h-4 w-4" /> Fazer Upgrade para PRO
            </button>
          )}

          {isPro && (
            <button
              onClick={() => navigate("/plans")}
              className="text-xs text-brand hover:underline font-medium"
            >
              Ver detalhes do plano →
            </button>
          )}
        </div>

        {/* ══════════════════════════════════════════
            SAVE BUTTON
            ══════════════════════════════════════════ */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Salvar Perfil
        </button>
      </main>
    </div>
  );
}