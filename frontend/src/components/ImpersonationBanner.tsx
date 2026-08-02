// components/ImpersonationBanner.tsx
//
// Faixa fixa exibida enquanto o administrador está acessando a conta de uma
// consultora pelo botão "Acessar" do painel.
//
// ⚠️ Sem este componente o modo suporte vira uma armadilha: ao entrar na
// conta da consultora não existe caminho de volta pela interface — seria
// preciso limpar o localStorage pelo DevTools. O botão abaixo restaura a
// sessão do administrador.
//
// Também serve de aviso permanente: um admin confundir a conta alheia com a
// própria e alterar estoque ou preço de outra pessoa seria difícil de
// desfazer.
import { ShieldAlert, LogOut } from "lucide-react";

export default function ImpersonationBanner() {
  const comoQuem = sessionStorage.getItem("impersonating_as");
  const tokenAdmin = sessionStorage.getItem("admin_token_backup");

  // Fora do modo suporte o componente simplesmente não aparece.
  if (!comoQuem || !tokenAdmin) return null;

  const voltar = () => {
    // Restaura a sessão do administrador e limpa os vestígios do modo suporte.
    localStorage.setItem("auth_token", tokenAdmin);
    sessionStorage.removeItem("admin_token_backup");
    sessionStorage.removeItem("impersonating_as");
    window.location.href = "/admin-panel";
  };

  return (
    <div className="sticky top-0 z-[60] flex flex-wrap items-center justify-between gap-2 bg-amber-500 px-4 py-2 text-xs text-amber-950">
      <span className="flex items-center gap-1.5 font-semibold">
        <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
        Modo suporte — você está vendo a conta de {comoQuem}
      </span>
      <button
        onClick={voltar}
        className="flex items-center gap-1 rounded-full bg-amber-950/15 px-3 py-1 font-semibold transition-colors hover:bg-amber-950/25"
      >
        <LogOut className="h-3 w-3" />
        Voltar para minha conta
      </button>
    </div>
  );
}