// lib/ui.ts
// Classes padronizadas de botão.
//
// Por que este arquivo existe: uma varredura encontrou **23 combinações
// diferentes** de tamanho entre os botões do app (py-2, py-2.5, py-3, py-3.5,
// py-4, com px e text variando junto). O resultado é o que se vê na tela —
// botões grandes ao lado de botões pequenos, sem critério.
//
// Use estas constantes em vez de montar classes na mão:
//
//   import { btn } from "../lib/ui";
//   <button className={btn.primario}>Salvar</button>
//   <button className={btn.secundario}>Cancelar</button>
//   <button className={`${btn.base} ${btn.md} ${btn.contorno}`}>Filtrar</button>
//
// Regra de tamanho:
//   lg  → ação principal da tela (Salvar, Assinar, Finalizar)
//   md  → ações comuns (Filtrar, Baixar relatório, Adicionar)
//   sm  → ações auxiliares dentro de listas e cabeçalhos

/** Base comum: alinhamento, transição e estado desabilitado. */
const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold " +
  "transition-opacity disabled:opacity-60 disabled:cursor-not-allowed";

const tamanhos = {
  sm: "px-3 py-2 text-xs",
  md: "px-4 py-2.5 text-sm",
  lg: "px-5 py-3 text-sm",
} as const;

const variantes = {
  /** Ação principal — fundo da marca. */
  solido: "bg-brand text-white hover:opacity-90",
  /** Ação secundária — contorno neutro. */
  contorno: "border border-border bg-card text-foreground hover:bg-secondary",
  /** Ação secundária com destaque de marca. */
  suave: "border border-brand/30 bg-brand/5 text-brand hover:bg-brand/10",
  /** Ação destrutiva. */
  perigo: "bg-destructive text-white hover:opacity-90",
  /** Sem fundo — para ações discretas. */
  fantasma: "text-muted-foreground hover:bg-secondary hover:text-foreground",
} as const;

export const btn = {
  base,
  ...tamanhos,
  ...variantes,

  /** Atalhos prontos para os casos mais comuns. */
  primario: `${base} ${tamanhos.lg} ${variantes.solido}`,
  secundario: `${base} ${tamanhos.md} ${variantes.contorno}`,
  acao: `${base} ${tamanhos.md} ${variantes.suave}`,
  discreto: `${base} ${tamanhos.sm} ${variantes.fantasma}`,
  /** Ocupa a largura toda — típico de formulário no celular. */
  primarioBloco: `${base} w-full ${tamanhos.lg} ${variantes.solido}`,
} as const;

/** Tamanhos padrão do indicador de carregamento. */
export const spinner = {
  /** Dentro de um botão ou linha de texto. */
  inline: "h-4 w-4 animate-spin",
  /** Bloco ou seção carregando. */
  bloco: "h-6 w-6 animate-spin text-brand",
  /** Página inteira. */
  pagina: "h-8 w-8 animate-spin text-brand",
} as const;