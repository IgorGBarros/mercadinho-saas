"""
Serviço de IA (Amorinha) — respostas sobre estoque e vendas da loja.

CORREÇÃO DE SEGURANÇA (P0):
Antes, este arquivo deixava o LLM escrever SQL livre e executava direto no
Postgres (`SQLDatabase.from_uri` + `db.run(clean_sql)`), sem filtrar por loja.
Qualquer consultora autenticada podia, em tese, levar o modelo a gerar uma
consulta que lesse dados de OUTRAS consultoras (client_name de vendas,
e-mails de outros usuários, registros de consentimento, etc.), já que a
única validação era "a query começa com SELECT".

Agora o LLM NUNCA gera nem executa SQL. Ele só escolhe, a partir de uma
lista fechada (FUNCOES_PERMITIDAS), qual consulta pré-definida usar e com
quais parâmetros. O `store` é sempre passado pelo código Python (vem de
request.user.store no view), nunca é algo que o modelo decide — portanto
não existe caminho, nem por prompt injection, para vazar dados de outra loja
por aqui.

CORREÇÃO DE INFRAESTRUTURA:
Antes, isto chamava `Ollama(model="deepseek-r1:14b")` via langchain_community
— um modelo rodando em localhost:11434, que não existe no Render (só existe
na máquina de quem desenvolveu). Em produção, a resposta era sempre um erro
de conexão. Pior: `langchain_community` nem está nos requirements de
produção, então o import deste módulo falhava sozinho, antes mesmo de
tentar falar com o Ollama.

Agora usa a API da Groq (https://groq.com), compatível com o formato da
OpenAI — mesma ideia de prompt, resposta em nuvem de verdade, sem precisar
manter servidor de LLM nenhum. Precisa da variável de ambiente GROQ_API_KEY
configurada no Render (dev e produção podem usar a mesma chave, ou chaves
diferentes — ver README/documentação de deploy).
"""
import json
import logging
import re
from datetime import timedelta

from decimal import Decimal

from django.conf import settings
from django.db.models import F, Sum
from django.db.models.functions import Abs
from django.utils import timezone
from groq import Groq, GroqError

from inventory.models import InventoryItem, StockTransaction

logger = logging.getLogger(__name__)

THINK_TAG_RE = re.compile(r"<think>.*?</think>", flags=re.DOTALL | re.IGNORECASE)

# ⚠️ Modelo: a Groq descontinuou os antigos Llama 3.x de chat. O recomendado
# hoje pra tarefas de raciocínio/uso geral é a linha "gpt-oss". Usamos o
# 20B — as duas tarefas daqui (escolher uma função de uma lista fechada, e
# explicar um resultado numérico em 1-2 frases) são simples o bastante pra
# não precisar do 120B, que custa o dobro por token. Se a qualidade das
# respostas não for boa o suficiente, trocar aqui para "openai/gpt-oss-120b"
# é a única mudança necessária.
GROQ_MODEL = getattr(settings, "GROQ_MODEL", "openai/gpt-oss-20b")

_client = None


def _get_client() -> Groq:
    """
    Client da Groq, criado uma vez só (é thread-safe e reaproveitável).
    Lançar aqui, e não no import do módulo, evita quebrar o site inteiro se
    a variável de ambiente não estiver configurada — só o endpoint da
    Amorinha falha, com uma mensagem clara, em vez do Django não subir.
    """
    global _client
    if _client is None:
        api_key = getattr(settings, "GROQ_API_KEY", None)
        if not api_key:
            raise RuntimeError("GROQ_API_KEY não configurada")
        _client = Groq(api_key=api_key)
    return _client


def _chamar_groq(prompt: str, temperature: float) -> str:
    """Uma chamada simples de texto — o equivalente ao antigo `.invoke(prompt)` do Ollama."""
    resposta = _get_client().chat.completions.create(
        model=GROQ_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=temperature,
        max_tokens=600,
    )
    return resposta.choices[0].message.content or ""


def _strip_llm_noise(text: str) -> str:
    """Remove blocos de raciocínio (<think>...</think>, comuns em modelos 'reasoning')
    e cercas de markdown antes de tratar a saída do modelo."""
    text = THINK_TAG_RE.sub("", text or "")
    text = text.replace("```json", "").replace("```", "")
    return text.strip()


# ─────────────────────────────────────────────────────────────────────────
# CAMADA DE DADOS — as únicas consultas que o assistente pode executar.
# Todas recebem `store` explicitamente; o LLM nunca vê nem escolhe o `store`.
# Usam o ORM (parametrizado), nunca SQL cru.
# ─────────────────────────────────────────────────────────────────────────

def _buscar_estoque(store, termo: str = "") -> dict:
    qs = InventoryItem.objects.filter(store=store).select_related("product")
    if termo:
        qs = qs.filter(product__name__icontains=termo[:100])
    itens = list(qs.values("product__name", "total_quantity", "sale_price")[:10])
    return {"itens": itens}


def _valor_total_estoque(store) -> dict:
    total = InventoryItem.objects.filter(store=store).aggregate(
        valor=Sum(F("total_quantity") * F("sale_price"))
    )["valor"] or 0
    return {"valor_total_estoque": float(total)}


def _vendas_periodo(store, dias: int = 30) -> dict:
    # ⚠️ Usa StockTransaction, não o modelo Sale (mais antigo) — é a mesma
    # fonte de dados do MEI e dos Relatórios. Manter os três (Amorinha, MEI,
    # Relatórios) na mesma tabela evita a Amorinha dar um número e a tela de
    # Relatórios mostrar outro pro mesmo período.
    dias = max(1, min(int(dias or 30), 365))
    desde = timezone.now() - timedelta(days=dias)
    qs = StockTransaction.objects.filter(store=store, transaction_type="VENDA", created_at__gte=desde)
    agregado = qs.aggregate(
        receita=Sum(F("unit_price") * Abs(F("quantity"))),
        qtd_vendida=Sum(Abs(F("quantity"))),
    )
    return {
        "periodo_dias": dias,
        "quantidade_pedidos": qs.count(),
        "unidades_vendidas": agregado["qtd_vendida"] or 0,
        "valor_total_vendas": float(agregado["receita"] or 0),
    }


def _lucro_periodo(store, dias: int = 30) -> dict:
    """Lucro = receita (preço de venda) menos custo, nas vendas do período."""
    dias = max(1, min(int(dias or 30), 365))
    desde = timezone.now() - timedelta(days=dias)
    qs = StockTransaction.objects.filter(store=store, transaction_type="VENDA", created_at__gte=desde)
    agregado = qs.aggregate(
        receita=Sum(F("unit_price") * Abs(F("quantity"))),
        custo=Sum(F("unit_cost") * Abs(F("quantity"))),
    )
    receita = agregado["receita"] or Decimal("0")
    custo = agregado["custo"] or Decimal("0")
    return {
        "periodo_dias": dias,
        "receita_total": float(receita),
        "custo_total": float(custo),
        "lucro_total": float(receita - custo),
    }


def _produtos_vendidos(store, termo: str = "", dias: int = 30) -> dict:
    """
    Quais produtos foram VENDIDOS no período — cobre tanto "quais produtos
    vendi" (termo vazio, lista os mais vendidos) quanto "vendi algum X"
    (termo="X", filtra por nome). Antes não existia NENHUMA ferramenta que
    respondesse isso — só dava pra saber o que TEM no estoque, não o que
    foi VENDIDO.
    """
    dias = max(1, min(int(dias or 30), 365))
    desde = timezone.now() - timedelta(days=dias)
    qs = StockTransaction.objects.filter(store=store, transaction_type="VENDA", created_at__gte=desde)
    if termo:
        qs = qs.filter(product__name__icontains=termo[:100])

    agrupado = (
        qs.values("product__name")
        .annotate(quantidade=Sum(Abs(F("quantity"))), receita=Sum(F("unit_price") * Abs(F("quantity"))))
        .order_by("-quantidade")[:10]
    )
    return {
        "periodo_dias": dias,
        "termo_buscado": termo or None,
        "produtos_vendidos": [
            {"produto": p["product__name"], "quantidade": p["quantidade"], "receita": float(p["receita"] or 0)}
            for p in agrupado
        ],
    }


def _produtos_baixo_estoque(store) -> dict:
    itens = list(
        InventoryItem.objects.filter(store=store, total_quantity__lte=F("min_quantity"))
        .select_related("product")
        .values("product__name", "total_quantity", "min_quantity")[:10]
    )
    return {"produtos_baixo_estoque": itens}


# nome_da_ferramenta -> (função, {parâmetro_aceito: conversor_de_tipo})
# Só o que está aqui pode ser chamado; só esses parâmetros são repassados.
FUNCOES_PERMITIDAS = {
    "buscar_estoque": (_buscar_estoque, {"termo": str}),
    "valor_total_estoque": (_valor_total_estoque, {}),
    "vendas_periodo": (_vendas_periodo, {"dias": int}),
    "lucro_periodo": (_lucro_periodo, {"dias": int}),
    "produtos_vendidos": (_produtos_vendidos, {"termo": str, "dias": int}),
    "produtos_baixo_estoque": (_produtos_baixo_estoque, {}),
}

ROUTER_PROMPT = """Você escolhe qual ferramenta usar para responder a pergunta de uma consultora sobre a loja DELA.

Ferramentas disponíveis:
- buscar_estoque(termo): o que TEM no estoque agora (quantidade, preço). Use termo="" para listar em geral.
- valor_total_estoque(): valor total do estoque parado hoje.
- vendas_periodo(dias): quantas vendas e quanto faturou nos últimos N dias (visão geral, sem detalhar produto).
- produtos_vendidos(termo, dias): quais produtos foram VENDIDOS nos últimos N dias. termo="" lista os mais
  vendidos; termo="nome do produto" responde se um produto específico foi vendido e quanto.
- lucro_periodo(dias): lucro (receita menos custo) das vendas nos últimos N dias.
- produtos_baixo_estoque(): produtos abaixo da quantidade mínima, precisando repor.

Como escolher:
- "o que vendi", "quais produtos vendi", "vendi algum X", "vendi X?" → produtos_vendidos (é sobre o que foi
  VENDIDO, não sobre o estoque atual)
- "lucro", "quanto lucrei", "ganhei quanto" → lucro_periodo
- "tenho X?", "quanto custa X", "quantidade de X" → buscar_estoque (é sobre o que TEM agora)
- período: "esse ano"/"ano todo" → dias=365 · "essa semana" → dias=7 · "hoje" → dias=1 · sem período dito → dias=30
{historico}
Responda APENAS com um JSON, sem explicação, sem markdown, exatamente neste formato:
{{"funcao": "nome_da_ferramenta", "argumentos": {{}}}}

Se a pergunta não for sobre estoque, produtos ou vendas da própria loja, responda:
{{"funcao": null, "argumentos": {{}}}}

Pergunta: {question}
"""

EXPLAIN_PROMPT = """Você é a Amorinha, assistente de estoque.
Explique o resultado abaixo em 1-2 frases curtas, naturais, em português.
Se os dados estiverem vazios ou zerados, diga que não encontrou nada.
NÃO invente números que não estão nos dados.

Pergunta: {question}
Dados: {data}

Resposta:
"""


def _formatar_historico(history: list) -> str:
    """
    Monta o bloco de contexto da conversa pro prompt do roteador — é o que
    permite perguntas de seguimento tipo "e esse ano?" entenderem que ainda
    é sobre o mesmo produto perguntado antes. Sem isso, cada pergunta era
    tratada como se fosse a primeira, sem nenhuma memória.

    Limita a 3 trocas (6 mensagens) e 300 caracteres cada — o suficiente pra
    dar contexto, sem deixar o prompt (e o custo por chamada) crescer sem
    limite numa conversa longa.
    """
    if not history or not isinstance(history, list):
        return ""

    trocas = []
    for item in history[-3:]:
        if not isinstance(item, dict):
            continue
        pergunta = str(item.get("question") or "")[:300]
        resposta = str(item.get("answer") or "")[:300]
        if pergunta and resposta:
            trocas.append(f'Cliente perguntou: "{pergunta}"\nVocê respondeu: "{resposta}"')

    if not trocas:
        return ""

    return (
        "\nConversa até agora, pra entender perguntas de seguimento "
        "(tipo \"e esse ano?\" depois de perguntar sobre um produto):\n"
        + "\n\n".join(trocas) + "\n"
    )


def query_database_with_llm(user_question: str, store, history: list = None) -> str:
    """
    `store`: instância de inventory.models.Store do usuário autenticado.
    Deve vir SEMPRE de request.user.store (no view) — nunca de input do
    usuário ou de algo que o LLM produza.

    `history`: últimas trocas da conversa (lista de {"question", "answer"}),
    usada só para o roteador entender perguntas de seguimento. Não afeta
    quais ferramentas existem nem o que elas podem consultar — é só
    contexto de linguagem, o isolamento por loja continua sendo feito 100%
    pelo `store` vindo do código.
    """
    if store is None:
        return "Não encontrei uma loja associada à sua conta."

    user_question = (user_question or "").strip()[:500]
    if not user_question:
        return "Pode reformular sua pergunta?"

    try:
        # PASSO 1: o modelo escolhe UMA ferramenta da lista fechada (não SQL)
        historico_fmt = _formatar_historico(history)
        raw_route = _chamar_groq(
            ROUTER_PROMPT.format(question=user_question, historico=historico_fmt), temperature=0.0
        )
        clean_route = _strip_llm_noise(raw_route)

        try:
            route = json.loads(clean_route)
        except (json.JSONDecodeError, TypeError):
            match = re.search(r"\{.*\}", clean_route, flags=re.DOTALL)
            route = json.loads(match.group(0)) if match else {}

        funcao_nome = route.get("funcao") if isinstance(route, dict) else None
        argumentos = route.get("argumentos") if isinstance(route, dict) else {}
        argumentos = argumentos if isinstance(argumentos, dict) else {}

        if not funcao_nome or funcao_nome not in FUNCOES_PERMITIDAS:
            return "Desculpe, só posso responder sobre estoque, produtos e vendas da sua loja."

        funcao, parametros_aceitos = FUNCOES_PERMITIDAS[funcao_nome]

        # Só repassa argumentos que estão na allowlist da função, já convertidos.
        # Qualquer coisa fora disso (nome de tabela, outro store_id, etc.) é
        # simplesmente ignorada — o modelo não tem como injetar parâmetros novos.
        kwargs = {}
        for nome_param, conversor in parametros_aceitos.items():
            if nome_param in argumentos:
                try:
                    kwargs[nome_param] = conversor(argumentos[nome_param])
                except (TypeError, ValueError):
                    pass

        # PASSO 2: executa a função real, sempre com o store vindo do código
        dados = funcao(store, **kwargs)

        # PASSO 3: transforma o resultado estruturado em resposta natural
        final_prompt = EXPLAIN_PROMPT.format(question=user_question, data=json.dumps(dados, default=str))
        raw_answer = _chamar_groq(final_prompt, temperature=0.3)
        final_answer = _strip_llm_noise(raw_answer)

        if len(final_answer) < 5:
            return f"Encontrei o seguinte resultado: {dados}"

        return final_answer

    except RuntimeError:
        # GROQ_API_KEY não configurada — erro de configuração, não do usuário.
        logger.error("Amorinha: GROQ_API_KEY não configurada no ambiente")
        return "A assistente está temporariamente indisponível. Tente novamente mais tarde."
    except GroqError:
        # Rate limit, chave inválida, indisponibilidade momentânea da Groq etc.
        logger.exception("Amorinha: erro na chamada à API da Groq")
        return "Desculpe, tive um problema para me conectar. Tente novamente em instantes."
    except Exception:
        logger.exception("Erro no assistente de IA (query_database_with_llm)")
        return "Desculpe, tive um problema técnico ao processar sua pergunta."