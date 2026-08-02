// pages/Auth.tsx — VERSÃO COM LGPD E SEGURANÇA
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, Lock, User, Loader2, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useToast } from '../components/ui/use-toast'; // ✅ Importar useToast original para evitar dependência circular
import { useConsent, PURPOSES } from "../hooks/useConsent"; // ✅ Import correto
import logoMinhaAmora from "../assets/logo-minhaamora.png";

// Versão do termo de consentimento (mudar quando atualizar a política)
const CONSENT_VERSION = "v1.0_2026-05";

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // ✅ Estados LGPD - UNIFICADOS (removido duplicado)
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [consentError, setConsentError] = useState("");

  const { toast } = useToast();
  const navigate = useNavigate();
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const { recordConsent } = useConsent(); // ✅ Hook de consentimento

  // ✅ Validação de senha forte (mínimo LGPD + segurança)
  const validatePassword = (pwd: string): { valid: boolean; error?: string } => {
    if (pwd.length < 8) return { valid: false, error: "Mínimo 8 caracteres" };
    if (!/[A-Z]/.test(pwd)) return { valid: false, error: "Deve conter letra maiúscula" };
    if (!/[0-9]/.test(pwd)) return { valid: false, error: "Deve conter número" };
    return { valid: true };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setConsentError("");

    // ✅ Validações para CADASTRO
    if (!isLogin) {
      // Validar consentimento LGPD (obrigatório)
      if (!consentAccepted) {
        setConsentError("É necessário aceitar a Política de Privacidade para criar sua conta.");
        return;
      }

      // Validar senha forte
      const pwdValidation = validatePassword(password);
      if (!pwdValidation.valid) {
        toast({
          title: "Senha fraca",
          description: pwdValidation.error,
          variant: "destructive",
        });
        return;
      }
    }

    setLoading(true);
    try {
      if (isLogin) {
        await signIn(email, password);
        navigate("/");
      } else {
        // 1. Criar usuário
        await signUp(email, password, name);
        
        // 2. ✅ Registrar consentimento LGPD via API (após cadastro bem-sucedido)
        const consentSuccess = await recordConsent(
          [PURPOSES.ESSENTIAL, PURPOSES.AUTH, PURPOSES.SERVICE],
          email.toLowerCase()
        );
        
        if (consentSuccess) {
          toast({ 
            title: "Conta criada!", 
            description: "Bem-vindo ao Minha Amora 🍇" 
          });
        } else {
          // Consentimento falhou, mas usuário foi criado (log para auditoria)
          console.warn("Usuário criado, mas consentimento LGPD falhou");
        }
        
        navigate("/");
      }
    } catch (err: any) {
      // ✅ Mensagem genérica para evitar enumeration (LGPD + segurança)
      toast({
        title: "Erro",
        description: "Credenciais inválidas ou erro ao criar conta",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      
      // ⚠️ CORREÇÃO: antes, este fluxo fazia POST /consent/ com apenas as
      // finalidades essenciais em TODO login Google ("consentimento
      // implícito"). Dois problemas: (1) consentimento implícito não existe
      // na LGPD — precisa ser manifestação ativa; (2) com a deduplicação por
      // supersede no backend, esse registro "só essenciais" REVOGAVA o
      // consentimento completo que o usuário já tinha dado (ai_features,
      // ai_training etc. sumiam a cada login). Quem coleta consentimento
      // faltante é o PostAuthConsentModal, que aparece sozinho na primeira
      // vez — aqui não registramos nada.
      
      navigate("/");
    } catch (err: any) {
      toast({
        title: "Erro no Google Sign-In",
        description: "Falha ao entrar com Google",
        variant: "destructive",
      });
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-soft px-4">
      <div className="w-full max-w-sm space-y-6">
        {/* ─── Logo + Branding ─── */}
        <div className="flex flex-col items-center gap-3">
          <img
            src={logoMinhaAmora}
            alt="Minha Amora"
            className="h-20 w-20 rounded-2xl object-contain shadow-md"
          />
          <div className="text-center">
            <h1 className="font-display text-2xl font-bold text-foreground">
              Minha Amora
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {isLogin ? "Entre na sua conta" : "Crie sua conta gratuita"}
            </p>
          </div>
        </div>

        {/* ─── Google Sign-In ─── */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={googleLoading}
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-card py-3 text-sm font-medium text-foreground shadow-sm transition-all hover:shadow-md active:scale-[0.98] disabled:opacity-50"
        >
          {googleLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
          )}
          Continuar com Google
        </button>

        {/* ─── Divider ─── */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-brand-soft px-2 text-muted-foreground">ou</span>
          </div>
        </div>

        {/* ─── Form ─── */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div className="relative">
              <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand/50" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome"
                required={!isLogin}
                className="w-full rounded-xl border border-brand/15 bg-card py-3 pl-10 pr-4 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </div>
          )}

          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand/50" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              required
              className="w-full rounded-xl border border-brand/15 bg-card py-3 pl-10 pr-4 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand/50" />
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Senha"
              required
              minLength={8}
              title="Mínimo 8 caracteres, 1 maiúscula e 1 número"
              className="w-full rounded-xl border border-brand/15 bg-card py-3 pl-10 pr-10 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-brand"
              tabIndex={-1}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
            {/* ✅ Dica de senha forte */}
            {!isLogin && password.length > 0 && (
              <p className="text-[10px] text-muted-foreground mt-1 ml-1">
                Use 8+ caracteres, maiúscula e número 🔐
              </p>
            )}
          </div>

          {/* ✅ CHECKBOX LGPD - Apenas no cadastro */}
          {!isLogin && (
            <div className="space-y-2">
              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={consentAccepted}
                  onChange={(e) => {
                    setConsentAccepted(e.target.checked);
                    if (e.target.checked) setConsentError("");
                  }}
                  required
                  className="mt-0.5 rounded border-brand/30 text-brand focus:ring-brand/20"
                />
                <span>
                  Concordo com o tratamento dos meus dados pessoais para criação e gestão da conta, 
                  conforme a{" "}
                  <a 
                    href="/privacy" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-brand hover:underline font-medium"
                  >
                    Política de Privacidade
                  </a>
                  {" "}e{" "}
                  <a 
                    href="/terms" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-brand hover:underline font-medium"
                  >
                    Termos de Uso
                  </a>
                  .
                </span>
              </label>
              
              {/* ✅ Mensagem de erro de consentimento */}
              {consentError && (
                <p className="text-[10px] text-destructive flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" />
                  {consentError}
                </p>
              )}
              
              {/* ✅ Resumo do que será coletado */}
              <details className="text-[10px] text-muted-foreground">
                <summary className="cursor-pointer hover:text-foreground">
                  O que coletamos? ▼
                </summary>
                <ul className="mt-1 ml-1 space-y-0.5 list-disc">
                  <li>Email e nome para autenticação</li>
                  <li>Dados de estoque e vendas para funcionalidade do app</li>
                  <li>IP e dispositivo para segurança (anonimizados)</li>
                  <li>Analytics de uso apenas com consentimento explícito</li>
                </ul>
              </details>
            </div>
          )}

          {/* ─── Botão Principal ─── */}
          <button
            type="submit"
            disabled={loading || (!isLogin && !consentAccepted)} // ✅ Desabilita se não aceitou
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-bold text-white shadow-lg shadow-brand/25 transition-all hover:opacity-90 hover:shadow-brand/40 active:scale-[0.98] disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {isLogin ? "Entrar" : "Criar Conta"}
          </button>
        </form>

        {/* ─── Toggle Login/Cadastro ─── */}
        <p className="text-center text-sm text-muted-foreground">
          {isLogin ? "Não tem conta?" : "Já tem conta?"}{" "}
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setConsentAccepted(false);
              setConsentError("");
            }}
            className="font-semibold text-brand hover:underline"
          >
            {isLogin ? "Criar conta" : "Fazer login"}
          </button>
        </p>

        {/* ─── Footer com Links Legais ─── */}
        <div className="text-center space-y-1">
          <p className="text-[10px] text-muted-foreground/50">
            100% gratuito para começar · Sem cartão de crédito
          </p>
          <div className="flex items-center justify-center gap-2 text-[10px]">
            <a 
              href="/privacidade" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-brand transition-colors"
            >
              Política de Privacidade
            </a>
            <span className="text-muted-foreground/30">•</span>
            <a 
              href="/termos" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-brand transition-colors"
            >
              Termos de Uso
            </a>
            <span className="text-muted-foreground/30">•</span>
            <a 
              href="mailto:privacidade@minhaamora.com.br"
              className="text-muted-foreground hover:text-brand transition-colors"
            >
              DPO
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}