// pages/ApiDevAuth.tsx
//
// Login/cadastro do produto de API — completamente separado de /auth (que
// é da consultora). Ninguém que loga aqui vira consultora, e vice-versa.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Eye, EyeOff, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from '../components/ui/use-toast'; // ✅ Importar useToast original para evitar dependência circular
import { devApi, setDevTokens } from "../lib/devApi";
import { getFirebaseAuth, getGoogleProvider, getGithubProvider, signInWithPopup } from "../lib/firebase";

export default function ApiDevAuth() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [modo, setModo] = useState<"login" | "cadastro">("login");
  const [carregando, setCarregando] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [empresa, setEmpresa] = useState("");

  // Depois do cadastro, a chave completa só aparece UMA VEZ — este estado
  // segura ela na tela até a pessoa confirmar que copiou.
  const [chaveGerada, setChaveGerada] = useState<string | null>(null);
  const [copiada, setCopiada] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCarregando(true);
    try {
      if (modo === "login") {
        const res = await devApi.login({ email, password: senha });
        setDevTokens(res.access, res.refresh);
        navigate("/api/dashboard");
      } else {
        const res = await devApi.register({ email, password: senha, name: nome, company_name: empresa });
        setDevTokens(res.access, res.refresh);
        setChaveGerada(res.api_key); // segura na tela antes de navegar
      }
    } catch (err: any) {
      toast({ title: "Erro", description: err.message || "Tente novamente.", variant: "destructive" });
    } finally {
      setCarregando(false);
    }
  };

  const [carregandoSocial, setCarregandoSocial] = useState<"google" | "github" | null>(null);

  const handleSocialLogin = async (provedor: "google" | "github") => {
    setCarregandoSocial(provedor);
    try {
      const auth = getFirebaseAuth();
      const provider = provedor === "google" ? getGoogleProvider() : getGithubProvider();
      const resultado = await signInWithPopup(auth, provider);
      const idToken = await resultado.user.getIdToken();

      const res = await devApi.firebaseLogin(idToken);
      setDevTokens(res.access, res.refresh);

      if (res.created) {
        // Conta nova via social não passa pela tela de "guarde sua chave"
        // — o backend não devolve a chave completa nesse fluxo. Ela pode
        // ver o prefixo e gerar outra a qualquer momento no painel.
        toast({ title: "Conta criada!", description: "Sua chave gratuita já está pronta no painel." });
      }
      navigate("/api/dashboard");
    } catch (err: any) {
      toast({
        title: "Erro no login social",
        description: err.message || "Tente novamente ou use e-mail e senha.",
        variant: "destructive",
      });
    } finally {
      setCarregandoSocial(null);
    }
  };

  const copiarChave = () => {
    if (!chaveGerada) return;
    navigator.clipboard.writeText(chaveGerada);
    setCopiada(true);
    setTimeout(() => setCopiada(false), 2000);
  };

  // 🔑 Tela intermediária: mostra a chave uma única vez antes de seguir pro
  // painel. Sem isso, ela sairia do cadastro sem nunca ter visto a chave
  // completa (dali em diante, só o prefixo aparece).
  if (chaveGerada) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6">
          <h1 className="font-display text-lg font-bold text-foreground">Conta criada! 🎉</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Esta é a única vez que sua chave completa aparece. Guarde agora — depois só o prefixo fica visível.
          </p>
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-secondary/30 p-3">
            <code className="flex-1 overflow-x-auto text-xs">{chaveGerada}</code>
            <button onClick={copiarChave} className="shrink-0 rounded-lg p-1.5 hover:bg-secondary" title="Copiar">
              {copiada ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <Button className="mt-5 w-full" onClick={() => navigate("/api/dashboard")}>
            Já guardei, ir para o painel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <button
          onClick={() => navigate("/api")}
          className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>

        <div className="rounded-2xl border border-border bg-card p-6">
          <h1 className="font-display text-xl font-bold text-foreground">
            {modo === "login" ? "Entrar" : "Criar conta de desenvolvedor"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {modo === "login" ? "Acesse seu painel de API." : "Ganhe uma chave gratuita na hora."}
          </p>

          {/* 🔑 Login social — mesmo projeto Firebase que a consultora já
              usa. Funciona pra login E cadastro: primeiro acesso cria a
              conta automaticamente, com chave gratuita inclusa. */}
          <div className="mt-5 space-y-2">
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              disabled={carregandoSocial !== null}
              onClick={() => handleSocialLogin("google")}
            >
              {carregandoSocial === "google" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              )}
              Continuar com Google
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              disabled={carregandoSocial !== null}
              onClick={() => handleSocialLogin("github")}
            >
              {carregandoSocial === "github" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58 0-.29-.01-1.04-.02-2.04-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.21.08 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.48 5.92.43.37.81 1.1.81 2.22 0 1.61-.01 2.9-.01 3.29 0 .32.22.7.83.58C20.56 21.8 24 17.3 24 12c0-6.63-5.37-12-12-12z"/>
                </svg>
              )}
              Continuar com GitHub
            </Button>
          </div>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">ou com e-mail</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {modo === "cadastro" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="nome">Nome</Label>
                  <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="empresa">Empresa (opcional)</Label>
                  <Input id="empresa" value={empresa} onChange={(e) => setEmpresa(e.target.value)} />
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="senha">Senha</Label>
              <div className="relative">
                <Input
                  id="senha"
                  type={mostrarSenha ? "text" : "password"}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  required
                  minLength={modo === "cadastro" ? 8 : undefined}
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {mostrarSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {modo === "cadastro" && (
                <p className="text-xs text-muted-foreground">Mínimo 8 caracteres, com pelo menos uma letra, um número e um caractere especial (ex: !@#$%&*).</p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={carregando}>
              {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : modo === "login" ? "Entrar" : "Criar conta"}
            </Button>
          </form>

          <button
            onClick={() => setModo(modo === "login" ? "cadastro" : "login")}
            className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
          >
            {modo === "login" ? "Não tem conta? Cadastre-se" : "Já tem conta? Entrar"}
          </button>
        </div>
      </div>
    </div>
  );
}