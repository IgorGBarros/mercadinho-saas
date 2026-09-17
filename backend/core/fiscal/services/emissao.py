"""
fiscal/services/emissao.py — transmissão da NFC-e.

⚠️ NÃO FALE COM A SEFAZ DIRETAMENTE.
Assinatura de XML, esquemas por estado, contingência, eventos de
cancelamento e inutilização — é mês de trabalho e manutenção eterna, para
um problema que já tem solução comprada. Aqui usamos hub fiscal.

⚠️ CONFIRA O MAPEAMENTO DE CAMPOS CONTRA A DOC DO PROVEDOR.
O payload abaixo segue a estrutura do Focus NFe, mas nomes de campo mudam
entre versões de API. Rode em HOMOLOGAÇÃO e compare o XML gerado antes de
apontar para produção — errar um campo aqui só aparece na rejeição.
"""
import logging
from datetime import timedelta
from decimal import Decimal

import requests
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from ..models import FiscalDocument

logger = logging.getLogger(__name__)

TIMEOUT = 20  # A SEFAZ é lenta. Como é assíncrono, dá para esperar.


def _base_url() -> str:
    homologacao = getattr(settings, 'FOCUS_NFE_AMBIENTE', 'homologacao') != 'producao'
    return ('https://homologacao.focusnfe.com.br/v2'
            if homologacao else 'https://api.focusnfe.com.br/v2')


# ══════════════════════════════════════════════════════════════
# Enfileiramento — chamado logo após a venda fechar
# ══════════════════════════════════════════════════════════════

def enfileirar(sale) -> FiscalDocument:
    """
    Cria o documento em estado PENDENTE. Não transmite nada.

    Chamado de dentro da transação da venda: se a venda der rollback, o
    documento some junto. O worker é quem transmite depois.
    """
    doc, _ = FiscalDocument.objects.get_or_create(
        sale=sale,
        defaults={
            'operator': sale.store.operator,
            'ref': f'venda-{sale.id}',
            'proxima_tentativa': timezone.now(),
        },
    )
    return doc


# ══════════════════════════════════════════════════════════════
# Montagem do payload
# ══════════════════════════════════════════════════════════════

def montar_payload(sale) -> dict:
    """
    Traduz a venda para o formato do provedor.

    ⚠️ Usa os valores CONGELADOS no momento da venda (`unit_price_sold`,
    `unit_cost_at_time`, o NCM do item). Reler do cadastro atual geraria
    nota divergente do que foi efetivamente vendido — e é exatamente isso
    que a fiscalização compara.
    """
    operador = sale.store.operator
    itens = []

    for i, item in enumerate(sale.items.select_related('product'), start=1):
        produto = item.product
        valor_unit = Decimal(item.unit_price_sold)
        quantidade = Decimal(item.quantity)

        itens.append({
            'numero_item': i,
            'codigo_produto': produto.bar_code or str(produto.id),
            'descricao': produto.name[:120],
            'codigo_ncm': produto.ncm,
            'cfop': produto.cfop,
            'unidade_comercial': produto.unidade_com,
            'quantidade_comercial': str(quantidade),
            'valor_unitario_comercial': str(valor_unit),
            'valor_bruto': str((valor_unit * quantidade).quantize(Decimal('0.01'))),
            'unidade_tributavel': produto.unidade_com,
            'quantidade_tributavel': str(quantidade),
            'valor_unitario_tributavel': str(valor_unit),
            'origem': produto.origem,
            # Simples Nacional usa CSOSN; Presumido/Real usam CST.
            **({'icms_situacao_tributaria': produto.csosn}
               if operador.tax_regime == 'simples'
               else {'icms_situacao_tributaria': produto.cst_icms or '00'}),
            'pis_situacao_tributaria': produto.cst_pis,
            'cofins_situacao_tributaria': produto.cst_cofins,
            **({'codigo_cest': produto.cest} if produto.cest else {}),
        })

    return {
        'cnpj_emitente': operador.cnpj,
        'data_emissao': timezone.localtime(sale.created_at).isoformat(),
        'natureza_operacao': 'Venda ao consumidor',
        # 1 = operação presencial. Totem em condomínio é presencial:
        # o comprador está fisicamente na loja.
        'presenca_comprador': '1',
        'modalidade_frete': '9',  # sem frete
        'items': itens,
        'formas_pagamento': [{
            # 17 = PIX. Informar 'dinheiro' numa venda por PIX é
            # divergência fiscal, não detalhe cosmético.
            'forma_pagamento': '17' if sale.payment_method == 'PIX' else '01',
            'valor_pagamento': str(sale.total_amount),
        }],
    }


# ══════════════════════════════════════════════════════════════
# Transmissão
# ══════════════════════════════════════════════════════════════

def transmitir(doc: FiscalDocument) -> FiscalDocument:
    """
    Envia ao provedor. Nunca levanta exceção: registra e agenda retry.

    Quem chama é um worker em background. Uma exceção aqui derrubaria o
    lote inteiro de notas pendentes por causa de uma só.
    """
    token = getattr(settings, 'FOCUS_NFE_TOKEN', '')
    if not token:
        doc.agendar_retry('FOCUS_NFE_TOKEN não configurado.', 'sem_token')
        return doc

    if not doc.operator.cnpj:
        # Não adianta tentar de novo: falta cadastro, não é falha de rede.
        doc.status = FiscalDocument.Status.REJEITADO
        doc.erro = 'Operador sem CNPJ cadastrado.'
        doc.save(update_fields=['status', 'erro'])
        return doc

    pendencias = _pendencias_fiscais(doc.sale)
    if pendencias:
        doc.status = FiscalDocument.Status.REJEITADO
        doc.erro = f'Cadastro incompleto: {"; ".join(pendencias)}'
        doc.codigo_erro = 'cadastro_incompleto'
        doc.save(update_fields=['status', 'erro', 'codigo_erro'])
        logger.warning('NFC-e %s barrada antes de transmitir: %s', doc.ref, doc.erro)
        return doc

    try:
        r = requests.post(
            f'{_base_url()}/nfce',
            params={'ref': doc.ref},
            json=montar_payload(doc.sale),
            auth=(token, ''),
            timeout=TIMEOUT,
        )
    except requests.RequestException as e:
        logger.warning('NFC-e %s: falha de comunicação (%s)', doc.ref, e)
        doc.agendar_retry(str(e), 'rede')
        return doc

    doc.transmitido_em = timezone.now()

    try:
        corpo = r.json()
    except ValueError:
        doc.agendar_retry(f'Resposta ilegível (HTTP {r.status_code}).', 'resposta_invalida')
        return doc

    return _aplicar_resposta(doc, r.status_code, corpo)


def _aplicar_resposta(doc, http_status, corpo) -> FiscalDocument:
    situacao = (corpo.get('status') or '').lower()

    if situacao == 'autorizado':
        doc.status = FiscalDocument.Status.AUTORIZADO
        doc.chave_acesso = corpo.get('chave_nfe', '') or ''
        doc.protocolo = corpo.get('numero_protocolo', '') or ''
        doc.numero = str(corpo.get('numero') or '')
        doc.serie = str(corpo.get('serie') or '')
        doc.xml_url = corpo.get('caminho_xml_nota_fiscal') or ''
        doc.danfe_url = corpo.get('caminho_danfe') or ''
        doc.qrcode_url = corpo.get('qrcode_url') or ''
        doc.autorizado_em = timezone.now()
        doc.erro = ''
        doc.proxima_tentativa = None
        doc.save()
        logger.info('NFC-e %s autorizada. Chave %s', doc.ref, doc.chave_acesso)
        return doc

    if situacao in ('processando_autorizacao', 'processando'):
        # A SEFAZ recebeu mas ainda não respondeu. Consultar depois —
        # NÃO retransmitir, ou você duplica a nota.
        doc.status = FiscalDocument.Status.PROCESSANDO
        doc.proxima_tentativa = timezone.now() + timedelta(seconds=30)
        doc.save(update_fields=['status', 'proxima_tentativa', 'transmitido_em'])
        return doc

    if situacao == 'erro_autorizacao':
        # ⚠️ Rejeição não é falha de rede. Tentar de novo com o mesmo
        # cadastro errado dá o mesmo erro para sempre — o lojista precisa
        # ver a pendência e corrigir.
        doc.status = FiscalDocument.Status.REJEITADO
        doc.codigo_erro = str(corpo.get('status_sefaz') or '')
        doc.erro = corpo.get('mensagem_sefaz') or 'Rejeitada pela SEFAZ.'
        doc.proxima_tentativa = None
        doc.save()
        logger.warning('NFC-e %s rejeitada (%s): %s', doc.ref, doc.codigo_erro, doc.erro)
        return doc

    doc.agendar_retry(
        corpo.get('mensagem') or f'HTTP {http_status}',
        str(corpo.get('codigo') or http_status),
    )
    return doc


def consultar(doc: FiscalDocument) -> FiscalDocument:
    """Consulta o resultado de uma nota que ficou em PROCESSANDO."""
    token = getattr(settings, 'FOCUS_NFE_TOKEN', '')
    try:
        r = requests.get(
            f'{_base_url()}/nfce/{doc.ref}', auth=(token, ''), timeout=TIMEOUT
        )
        corpo = r.json()
    except (requests.RequestException, ValueError) as e:
        doc.agendar_retry(str(e), 'consulta')
        return doc
    return _aplicar_resposta(doc, r.status_code, corpo)


def _pendencias_fiscais(sale) -> list:
    """
    Barra antes de gastar uma chamada no provedor.

    Rejeição por NCM ausente é o erro mais comum e o mais bobo: a checagem
    local é instantânea e evita ida à SEFAZ, cota queimada e um registro
    de rejeição que assusta o lojista.
    """
    faltando = []
    for item in sale.items.select_related('product'):
        p = item.product
        if not p.is_fiscally_ready:
            faltando.append(f'{p.name} ({", ".join(p.fiscal_pendencies)})')
    return faltando


@transaction.atomic
def processar_pendentes(limite=50):
    """
    Worker. Rodar por cron: `manage.py emitir_notas_pendentes`.

    Cada documento é tratado isoladamente — uma nota problemática não pode
    impedir as outras de saírem.
    """
    agora = timezone.now()
    pendentes = (
        FiscalDocument.objects
        .select_for_update(skip_locked=True)
        .filter(
            status__in=[FiscalDocument.Status.PENDENTE, FiscalDocument.Status.PROCESSANDO],
            proxima_tentativa__lte=agora,
        )
        .order_by('proxima_tentativa')[:limite]
    )

    resultado = {'autorizadas': 0, 'rejeitadas': 0, 'reagendadas': 0}
    for doc in pendentes:
        antes = doc.status
        doc = consultar(doc) if antes == FiscalDocument.Status.PROCESSANDO else transmitir(doc)

        if doc.status == FiscalDocument.Status.AUTORIZADO:
            resultado['autorizadas'] += 1
        elif doc.status == FiscalDocument.Status.REJEITADO:
            resultado['rejeitadas'] += 1
        else:
            resultado['reagendadas'] += 1
    return resultado
