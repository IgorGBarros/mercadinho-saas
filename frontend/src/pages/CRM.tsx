import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Search, Download, MessageCircle, Trash2, Loader2, Users, CheckCircle2, XCircle, Eye, X, Package, ShoppingBag, QrCode, CreditCard, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { listLeads, getLead, deleteLead, exportLeadsCsv, downloadCsv, updateCartPayment, deleteCart, Lead, Purchase } from "../lib/leads";
import { WA_TEMPLATES, WaTemplateKey, buildWaLink, renderTemplate } from "@/lib/whatsapp";

export default function CRM() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const tenantId = String(user?.id || "");

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // 🔹 Painel de histórico: qual cliente está aberto e os dados dela.
  const [detalheAberto, setDetalheAberto] = useState<Lead | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  // 🔹 Modal de confirmação de exclusão de pedido — substitui o confirm()
  // nativo do navegador (aquele popup feio com a URL do site no título).
  const [pedidoParaExcluir, setPedidoParaExcluir] = useState<Purchase | null>(null);
  const [excluindoPedido, setExcluindoPedido] = useState(false);
  // 🔹 Modal de exclusão de CLIENTE (diferente do de exclusão de pedido) —
  // mesmo padrão, substitui o confirm() nativo.
  const [clienteParaExcluir, setClienteParaExcluir] = useState<Lead | null>(null);
  const [excluindoCliente, setExcluindoCliente] = useState(false);
  // 🔹 Modal de confirmação do envio em massa (quando ela seleciona várias
  // clientes e clica em "Mandar mensagem").
  const [confirmandoEnvioMassa, setConfirmandoEnvioMassa] = useState(false);
  // 🔹 Seleção múltipla: quem vai receber a mensagem em massa.
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [optInFilter, setOptInFilter] = useState<"all" | "yes" | "no">("all");
  const [tplKey, setTplKey] = useState<WaTemplateKey>("welcome");

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const data = await listLeads(tenantId);
      setLeads(data);
    } catch (e: any) {
      toast.error("Erro ao carregar leads", { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const filtered = useMemo(() => {
    return leads.filter((l) => {
      if (optInFilter === "yes" && !l.whatsapp_opt_in) return false;
      if (optInFilter === "no" && l.whatsapp_opt_in) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        l.name.toLowerCase().includes(q) ||
        l.phone.includes(q) ||
        (l.email || "").toLowerCase().includes(q)
      );
    });
  }, [leads, search, optInFilter]);

  const template = WA_TEMPLATES.find((t) => t.key === tplKey) || WA_TEMPLATES[0];

  // 🔹 Abre o painel de histórico de um cliente — busca o detalhe completo
  // (o /crm/leads/<id> já vem com purchase_history embutido).
  const handleVerHistorico = async (l: Lead) => {
    setDetalheAberto(l); // mostra o painel já com o que se tem, enquanto carrega
    setCarregandoDetalhe(true);
    try {
      const completo = await getLead(l.id);
      setDetalheAberto(completo);
    } catch {
      toast.error("Não foi possível carregar o histórico");
    } finally {
      setCarregandoDetalhe(false);
    }
  };

  // 🔹 Marca/desmarca um pedido específico como pago. Sempre manual — não
  // há integração com o WhatsApp nem com meio de pagamento pra confirmar
  // isso sozinho, é a consultora quem sabe se o dinheiro caiu de verdade.
  const handleConfirmarPagamento = async (cartId: number, confirmado: boolean) => {
    try {
      await updateCartPayment(cartId, { payment_confirmed: confirmado });
      // Atualiza o painel aberto sem precisar buscar tudo de novo do servidor
      setDetalheAberto((prev) =>
        prev
          ? {
              ...prev,
              purchase_history: prev.purchase_history?.map((p) =>
                p.cart_id === cartId ? { ...p, payment_confirmed: confirmado } : p
              ),
            }
          : prev
      );
      load(); // a lista principal também mostra o pagamento mais recente
      toast.success(confirmado ? "Pagamento confirmado" : "Confirmação removida");
    } catch {
      toast.error("Não foi possível atualizar o pagamento");
    }
  };

  // 🔹 Exclui um pedido que nunca foi pago. Só o pedido some — a cliente
  // (Lead) continua no CRM, com o resto do histórico intacto.
  // 🔹 Abre o modal de confirmação — não exclui nada ainda.
  const handleExcluirPedido = (pedido: Purchase) => {
    setPedidoParaExcluir(pedido);
  };

  // 🔹 Só executa quando ela confirma no modal. Desconta total_orders e
  // total_spent do lado do backend (crm_cart_update) — aqui só atualiza a
  // tela local depois que o servidor confirmar.
  const confirmarExclusaoPedido = async () => {
    if (!pedidoParaExcluir) return;
    const cartId = pedidoParaExcluir.cart_id;
    setExcluindoPedido(true);
    try {
      await deleteCart(cartId);
      setDetalheAberto((prev) =>
        prev
          ? { ...prev, purchase_history: prev.purchase_history?.filter((p) => p.cart_id !== cartId) }
          : prev
      );
      load(); // atualiza os totais na lista principal também
      toast.success("Pedido excluído");
      setPedidoParaExcluir(null);
    } catch {
      toast.error("Não foi possível excluir o pedido");
    } finally {
      setExcluindoPedido(false);
    }
  };

  const handleWhatsapp = (l: Lead) => {
    if (l.anonymized_at) return toast.error("Lead anonimizado");
    const link = buildWaLink(l.phone, template.body, {
      name: l.name.split(" ")[0],
      seller: user?.name || "sua consultora",
      product: "",
      link: window.location.origin,
      discount: "10% OFF",
    });
    window.open(link, "_blank", "noopener,noreferrer");
  };

  // ⚠️ Removido o "Anonimizar (LGPD)" desta tela: a consultora não tem uso
  // prático pra esse botão — ela não vai decidir sozinha quando anonimizar
  // um cliente. O endpoint de anonimização continua existindo no backend
  // (crm_lead_anonymize), pronto pra ser usado por uma política de retenção
  // automática ou uma ferramenta do administrador mais pra frente.

  // 🔹 Abre o modal — não exclui nada ainda.
  const handleExcluirCliente = (l: Lead) => {
    setClienteParaExcluir(l);
  };

  // 🔹 Só executa quando ela confirma no modal.
  const confirmarExclusaoCliente = async () => {
    if (!clienteParaExcluir) return;
    setExcluindoCliente(true);
    try {
      await deleteLead(clienteParaExcluir.id);
      toast.success("Cliente excluída");
      setClienteParaExcluir(null);
      load();
    } catch {
      toast.error("Não foi possível excluir a cliente");
    } finally {
      setExcluindoCliente(false);
    }
  };

  const handleExport = () => {
    const csv = exportLeadsCsv(filtered);
    downloadCsv(`leads-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast.success("CSV exportado");
  };

  // 🔹 Marca/desmarca uma cliente. Só é possível selecionar quem pode
  // receber mensagem (aceitou WhatsApp e não foi anonimizada) — senão a
  // consultora seleciona 10 pessoas e só 4 recebem, sem entender por quê.
  const podeReceber = (l: Lead) => l.whatsapp_opt_in && !l.anonymized_at;

  const toggleSelecionado = (id: string) => {
    setSelecionados((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id); else novo.add(id);
      return novo;
    });
  };

  const selecionaveisNaTela = filtered.filter(podeReceber);
  const todosSelecionados =
    selecionaveisNaTela.length > 0 && selecionaveisNaTela.every((l) => selecionados.has(l.id));

  const toggleSelecionarTodos = () => {
    setSelecionados((prev) => {
      if (todosSelecionados) {
        // desmarca só quem está visível na tela — não mexe em seleção de outra busca/filtro
        const novo = new Set(prev);
        selecionaveisNaTela.forEach((l) => novo.delete(l.id));
        return novo;
      }
      const novo = new Set(prev);
      selecionaveisNaTela.forEach((l) => novo.add(l.id));
      return novo;
    });
  };

  // 🔹 Abre uma conversa de WhatsApp por cliente selecionada, com o
  // template que ela escolheu lá em cima. Isto NÃO manda a mensagem
  // sozinho — abre a conversa já escrita, e ela aperta enviar em cada uma.
  // Envio de verdade sem toque nenhum exige a API oficial do WhatsApp
  // Business, que é um projeto à parte (painel do administrador).
  // 🔹 Só valida e abre o modal — o envio de verdade fica em confirmarEnvioMassa.
  const handleEnviarSelecionados = () => {
    const alvos = leads.filter((l) => selecionados.has(l.id) && podeReceber(l));
    if (alvos.length === 0) return toast.error("Selecione ao menos uma cliente que aceitou receber mensagem");
    if (alvos.length > 15) {
      return toast.error("Selecione até 15 por vez — o navegador bloqueia muitas janelas abertas de uma vez");
    }
    setConfirmandoEnvioMassa(true);
  };

  const confirmarEnvioMassa = () => {
    const alvos = leads.filter((l) => selecionados.has(l.id) && podeReceber(l));
    alvos.forEach((l, i) => {
      setTimeout(() => {
        const link = buildWaLink(l.phone, template.body, {
          name: l.name.split(" ")[0],
          seller: user?.name || "sua consultora",
          product: "",
          link: window.location.origin,
          discount: "10% OFF",
        });
        window.open(link, "_blank", "noopener,noreferrer");
      }, i * 600);
    });
    setSelecionados(new Set());
    setConfirmandoEnvioMassa(false);
  };


  const optInCount = leads.filter((l) => l.whatsapp_opt_in).length;

  return (
    <>
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Button size="icon" variant="ghost" onClick={() => navigate("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="font-display text-lg font-bold text-foreground">CRM</h1>
            <p className="text-xs text-muted-foreground">Seus leads capturados na vitrine</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4" /> CSV
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard icon={Users} label="Total" value={leads.length} />
          <StatCard icon={CheckCircle2} label="Aceitam receber mensagem" value={optInCount} />
          <StatCard icon={XCircle} label="Anonimizados" value={leads.filter((l) => l.anonymized_at).length} />
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar nome, telefone ou email"
              className="pl-9"
            />
          </div>
          <Select value={optInFilter} onValueChange={(v: any) => setOptInFilter(v)}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as clientes</SelectItem>
              <SelectItem value="yes">Aceitam receber mensagem</SelectItem>
              <SelectItem value="no">Não aceitam</SelectItem>
            </SelectContent>
          </Select>
          <Select value={tplKey} onValueChange={(v: any) => setTplKey(v)}>
            <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="Template" /></SelectTrigger>
            <SelectContent>
              {WA_TEMPLATES.map((t) => (
                <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Barra de ação: só aparece quando ela seleciona alguém */}
        {selecionados.size > 0 && (
          <div className="flex items-center justify-between rounded-xl border border-brand/30 bg-brand/5 px-4 py-2.5">
            <span className="text-sm font-medium text-foreground">
              {selecionados.size} cliente{selecionados.size > 1 ? "s" : ""} selecionada{selecionados.size > 1 ? "s" : ""}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelecionados(new Set())}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Limpar
              </button>
              <Button size="sm" onClick={handleEnviarSelecionados}>
                <MessageCircle className="h-4 w-4" /> Mandar mensagem
              </Button>
            </div>
          </div>
        )}

        {/* Template preview */}
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Preview:</span>{" "}
          {renderTemplate(template.body, {
            name: "Maria",
            seller: user?.name || "Consultora",
            product: "Kaiak",
            link: "https://...",
            discount: "10% OFF",
          })}
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-20 text-center text-sm text-muted-foreground">
            Nenhum lead encontrado.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={todosSelecionados}
                      onChange={toggleSelecionarTodos}
                      title="Selecionar todas que podem receber mensagem"
                      className="h-4 w-4 cursor-pointer rounded border-border"
                    />
                  </th>
                  <th className="px-4 py-3 text-left">Nome</th>
                  <th className="px-4 py-3 text-left">Telefone</th>
                  <th className="px-4 py-3 text-left">Recebe mensagem?</th>
                  <th className="px-4 py-3 text-left">Última visita</th>
                  <th className="px-4 py-3 text-left">Gasto</th>
                  <th className="px-4 py-3 text-left">Pagamento</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => (
                  <tr key={l.id} className="border-t border-border hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selecionados.has(l.id)}
                        onChange={() => toggleSelecionado(l.id)}
                        disabled={!podeReceber(l)}
                        title={podeReceber(l) ? "Selecionar" : "Ela não autorizou receber mensagem"}
                        className="h-4 w-4 cursor-pointer rounded border-border disabled:cursor-not-allowed disabled:opacity-30"
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {l.name}
                      {l.anonymized_at && <Badge variant="outline" className="ml-2 text-xs">anonimizado</Badge>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{l.phone}</td>
                    <td className="px-4 py-3">
                      {l.whatsapp_opt_in ? (
                        <Badge className="bg-emerald-500/15 text-emerald-700">Sim</Badge>
                      ) : (
                        <Badge variant="outline">Não</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(l.last_seen).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-4 py-3 text-xs">R$ {Number(l.total_spent || 0).toFixed(2)}</td>
                    <td className="px-4 py-3">
                      {!l.last_payment_method ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          {l.last_payment_method === "pix" ? (
                            <QrCode className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : (
                            <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                          <span className="text-xs text-foreground">
                            {l.last_payment_method === "pix" ? "PIX" : "Cartão"}
                          </span>
                          {l.last_payment_confirmed ? (
                            <Badge className="bg-emerald-500/15 text-emerald-700 text-[10px]">pago</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">a confirmar</Badge>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Ver histórico de compras"
                          onClick={() => handleVerHistorico(l)}
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={!l.whatsapp_opt_in || !!l.anonymized_at}
                          title={!l.whatsapp_opt_in ? "Ela não autorizou receber mensagem" : "Enviar WhatsApp"}
                          onClick={() => handleWhatsapp(l)}
                          className="h-8 w-8 text-emerald-600"
                        >
                          <MessageCircle className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" title="Excluir" onClick={() => handleExcluirCliente(l)} className="h-8 w-8 text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>

    {/* 🔹 Painel de histórico: o que essa cliente comprou, quando e por
        quanto — o que faltava pra "Meus Clientes" virar uma central de
        verdade, não só uma lista de contatos. */}
    {detalheAberto && (
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
        onClick={() => setDetalheAberto(null)}
      >
        <div
          className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-card p-5 sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-foreground">
                {detalheAberto.name}
                {detalheAberto.anonymized_at && (
                  <Badge variant="outline" className="ml-2 text-xs">anonimizado</Badge>
                )}
              </h2>
              <p className="text-sm text-muted-foreground">{detalheAberto.phone}</p>
              {detalheAberto.email && (
                <p className="text-xs text-muted-foreground">{detalheAberto.email}</p>
              )}
            </div>
            <button
              onClick={() => setDetalheAberto(null)}
              className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Resumo */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-border bg-secondary/30 p-3 text-center">
              <p className="text-lg font-bold text-foreground">{detalheAberto.total_orders}</p>
              <p className="text-[11px] text-muted-foreground">pedidos</p>
            </div>
            <div className="rounded-xl border border-border bg-secondary/30 p-3 text-center">
              <p className="text-lg font-bold text-foreground">
                R$ {Number(detalheAberto.total_spent || 0).toFixed(2)}
              </p>
              <p className="text-[11px] text-muted-foreground">total gasto</p>
            </div>
            <div className="rounded-xl border border-border bg-secondary/30 p-3 text-center">
              <p className="text-xs font-bold text-foreground">
                {/* 🔹 "última visita" em vez de "última compra": esse campo
                    (last_seen) sempre tem valor — atualiza toda vez que a
                    cliente interage na vitrine, mesmo sem fechar pedido — e
                    é o mesmo campo usado nos gatilhos de notificação
                    (carrinho abandonado, etc.). "última compra" ficava "—"
                    sempre que os pedidos eram excluídos. */}
                {detalheAberto.last_seen
                  ? new Date(detalheAberto.last_seen).toLocaleDateString("pt-BR")
                  : "—"}
              </p>
              <p className="text-[11px] text-muted-foreground">última visita</p>
            </div>
          </div>

          {/* Histórico */}
          <div className="mt-5">
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <ShoppingBag className="h-4 w-4" /> Histórico de compras
            </h3>

            {carregandoDetalhe ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-brand" />
              </div>
            ) : !detalheAberto.purchase_history || detalheAberto.purchase_history.length === 0 ? (
              <div className="rounded-xl border border-border bg-card px-4 py-8 text-center">
                <Package className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Nenhum pedido fechado ainda.</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {detalheAberto.purchase_history.map((pedido) => (
                  <li key={pedido.cart_id} className="rounded-xl border border-border p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {new Date(pedido.date).toLocaleDateString("pt-BR")}
                      </span>
                      <span className="text-sm font-semibold text-foreground">
                        R$ {Number(pedido.total).toFixed(2)}
                      </span>
                    </div>
                    <ul className="mt-1.5 space-y-0.5">
                      {pedido.items.map((item, i) => (
                        <li key={i} className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="truncate">{item.quantity}x {item.product_name}</span>
                          <span className="shrink-0">R$ {Number(item.subtotal).toFixed(2)}</span>
                        </li>
                      ))}
                    </ul>

                    {/* 💳 Forma de pagamento que ela declarou + confirmação
                        manual da consultora. Nunca é automático — não há
                        integração com meio de pagamento nenhum ainda. */}
                    <div className="mt-2.5 flex items-center justify-between border-t border-border/60 pt-2.5">
                      <div className="flex items-center gap-1.5">
                        {pedido.payment_method ? (
                          <>
                            {pedido.payment_method === "pix" ? (
                              <QrCode className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : (
                              <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                            <span className="text-xs text-muted-foreground">
                              {pedido.payment_method === "pix" ? "PIX" : "Cartão de crédito"}
                            </span>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">Forma de pagamento não informada</span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {pedido.payment_confirmed ? (
                          <button
                            onClick={() => handleConfirmarPagamento(pedido.cart_id, false)}
                            className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-500/25"
                            title="Clique para desmarcar"
                          >
                            <Check className="h-3 w-3" /> Pago
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => handleConfirmarPagamento(pedido.cart_id, true)}
                              className="rounded-full border border-brand/30 bg-brand/5 px-2.5 py-1 text-[11px] font-medium text-brand hover:bg-brand/10"
                            >
                              Marcar como pago
                            </button>
                            <button
                              onClick={() => handleExcluirPedido(pedido)}
                              title="Ela não pagou — excluir este pedido"
                              className="rounded-full p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    )}
    {/* 🔹 Modal de confirmação de exclusão de pedido — no lugar do confirm()
        nativo do navegador. z-[60] porque abre POR CIMA do painel de
        histórico (que é z-50). */}
    {pedidoParaExcluir && (
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
        onClick={() => !excluindoPedido && setPedidoParaExcluir(null)}
      >
        <div
          className="w-full max-w-sm rounded-2xl bg-card p-5"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10">
            <Trash2 className="h-5 w-5 text-destructive" />
          </div>
          <h3 className="text-center font-display text-base font-bold text-foreground">
            Excluir este pedido?
          </h3>
          <p className="mt-1.5 text-center text-sm text-muted-foreground">
            Pedido de {new Date(pedidoParaExcluir.date).toLocaleDateString("pt-BR")}, no valor de{" "}
            <strong className="text-foreground">R$ {Number(pedidoParaExcluir.total).toFixed(2)}</strong>.
            Ele nunca foi pago, então deixa de contar como venda — os números de pedidos e valor
            gasto da cliente são atualizados automaticamente.
          </p>

          <div className="mt-5 flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              disabled={excluindoPedido}
              onClick={() => setPedidoParaExcluir(null)}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1 bg-destructive text-white hover:bg-destructive/90"
              disabled={excluindoPedido}
              onClick={confirmarExclusaoPedido}
            >
              {excluindoPedido ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir"}
            </Button>
          </div>
        </div>
      </div>
    )}

    {/* 🔹 Modal de exclusão de CLIENTE — mesmo padrão do modal de exclusão
        de pedido, mas com o aviso de que TODO o histórico dela some junto. */}
    {clienteParaExcluir && (
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
        onClick={() => !excluindoCliente && setClienteParaExcluir(null)}
      >
        <div className="w-full max-w-sm rounded-2xl bg-card p-5" onClick={(e) => e.stopPropagation()}>
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10">
            <Trash2 className="h-5 w-5 text-destructive" />
          </div>
          <h3 className="text-center font-display text-base font-bold text-foreground">
            Excluir {clienteParaExcluir.name}?
          </h3>
          <p className="mt-1.5 text-center text-sm text-muted-foreground">
            Isso apaga a cliente e <strong className="text-foreground">todo o histórico de compras</strong> dela
            do CRM. Não tem como desfazer.
          </p>
          <div className="mt-5 flex gap-2">
            <Button variant="outline" className="flex-1" disabled={excluindoCliente} onClick={() => setClienteParaExcluir(null)}>
              Cancelar
            </Button>
            <Button
              className="flex-1 bg-destructive text-white hover:bg-destructive/90"
              disabled={excluindoCliente}
              onClick={confirmarExclusaoCliente}
            >
              {excluindoCliente ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir"}
            </Button>
          </div>
        </div>
      </div>
    )}

    {/* 🔹 Modal de confirmação do envio em massa. */}
    {confirmandoEnvioMassa && (
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
        onClick={() => setConfirmandoEnvioMassa(false)}
      >
        <div className="w-full max-w-sm rounded-2xl bg-card p-5" onClick={(e) => e.stopPropagation()}>
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-brand/10">
            <MessageCircle className="h-5 w-5 text-brand" />
          </div>
          <h3 className="text-center font-display text-base font-bold text-foreground">
            Abrir o WhatsApp para {selecionados.size} cliente{selecionados.size > 1 ? "s" : ""}?
          </h3>
          <p className="mt-1.5 text-center text-sm text-muted-foreground">
            Vai abrir uma conversa por cliente, já com a mensagem escrita. Você ainda precisa
            apertar enviar em cada uma.
          </p>
          <div className="mt-5 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmandoEnvioMassa(false)}>
              Cancelar
            </Button>
            <Button className="flex-1" onClick={confirmarEnvioMassa}>
              Abrir conversas
            </Button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="mt-1 font-display text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}