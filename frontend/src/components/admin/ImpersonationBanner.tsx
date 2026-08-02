// components/ImpersonationBanner.tsx
// Faixa fixa exibida enquanto o admin está acessando a conta de uma
// consultora. Existe por dois motivos:
//   1. Sem ela não há como VOLTAR para a conta de admin — ficaria preso.
//   2. Deixa impossível esquecer que os dados na tela são de outra pessoa.
//      Um admin confundir a conta alheia com a própria e alterar estoque ou
//      preço de alguém seria um estrago difícil de desfazer.
import { ShieldAlert, LogOut } from "lucide-react";

export default function ImpersonationBanner() {
  const comoQuem = sessionStorage.getItem("impersonating_as");
  const tokenAdmin = sessionStorage.getItem("admin_token_backup");

  if (!comoQuem || !tokenAdmin) return null;

  const sair = () => {
    // Restaura a sessão do admin e limpa os vestígios do modo suporte.
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
        onClick={sair}
        className="flex items-center gap-1 rounded-full bg-amber-950/15 px-3 py-1 font-semibold transition-colors hover:bg-amber-950/25"
      >
        <LogOut className="h-3 w-3" />
        Voltar para minha conta
      </button>
    </div>
  );
}