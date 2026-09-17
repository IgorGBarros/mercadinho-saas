"""
inventory/services/gtin.py — resolve um código de barras em um produto.

CASCATA DE BUSCA (para na primeira que responde):

    1. Etiqueta de balança  → PLU no catálogo local. NUNCA vai pra internet.
    2. Catálogo local       → Product por GTIN. Instantâneo.
    3. Cache externo        → ExternalBarcodeCatalog, o que já buscamos antes.
    4. Provedor externo     → Cosmos (pago, traz NCM) ou Open Food Facts (grátis).
    5. Nada                 → cadastro manual, que sempre precisa funcionar.

⚠️ O NÍVEL 4 NUNCA PODE TRAVAR UMA VENDA
Toda chamada externa tem timeout curto e falha em silêncio. Se o Cosmos
estiver fora do ar, o lojista cadastra à mão — o que ele já faria de
qualquer forma. Uma API de catálogo indisponível não pode fechar a loja.

⚠️ POR QUE O CACHE IMPORTA
O Cosmos é cobrado por consulta e tem cota. Um mercadinho reescaneia o
mesmo refrigerante centenas de vezes por mês. Sem o nível 3, você paga
por cada leitura e ainda fica lento.
"""
import logging
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Optional

import requests
from django.conf import settings
from django.utils import timezone

from ..barcode import TipoCodigo, parse

logger = logging.getLogger(__name__)

TIMEOUT = 4  # segundos. O lojista está de pé no balcão esperando.


@dataclass
class Resolucao:
    encontrado: bool = False
    origem: str = 'nenhuma'        # balanca | local | cache | cosmos | openfoodfacts
    product_id: Optional[int] = None
    gtin: Optional[str] = None
    nome: str = ''
    marca: str = ''
    ncm: str = ''
    imagem: str = ''
    # ⚠️ Anotação obrigatória: sem ela o dataclass ignora o atributo e ele
    # vira variável de classe, não campo do __init__.
    peso_kg: Optional[Decimal] = None
    preco: Optional[Decimal] = None
    tipo: str = TipoCodigo.DESCONHECIDO
    erro: str = ''
    avisos: list = field(default_factory=list)


# ══════════════════════════════════════════════════════════════
# Provedores externos
# ══════════════════════════════════════════════════════════════

def _consultar_cosmos(gtin: str) -> Optional[dict]:
    """
    Cosmos (Bluesoft). Pago, mas é o único que devolve **NCM** — o campo
    que sozinho decide se a NFC-e é aceita ou rejeitada. Preencher NCM
    automático e pedir só confirmação ao lojista economiza ele digitar
    oito dígitos para cada um de 400 itens.
    """
    token = getattr(settings, 'COSMOS_TOKEN', '')
    if not token:
        return None
    try:
        r = requests.get(
            f'https://api.cosmos.bluesoft.com.br/gtins/{gtin}.json',
            headers={'X-Cosmos-Token': token, 'User-Agent': 'mercadinho-saas'},
            timeout=TIMEOUT,
        )
        if r.status_code != 200:
            return None
        d = r.json()
        return {
            'nome': (d.get('description') or '').strip(),
            'marca': ((d.get('brand') or {}).get('name') or '').strip(),
            'ncm': ((d.get('ncm') or {}).get('code') or '').replace('.', '').strip(),
            'imagem': d.get('thumbnail') or '',
            'origem': 'cosmos',
        }
    except (requests.RequestException, ValueError) as e:
        logger.warning('Cosmos indisponível para %s: %s', gtin, e)
        return None


def _consultar_openfoodfacts(gtin: str) -> Optional[dict]:
    """
    Open Food Facts. Gratuito e sem cadastro, cobertura boa em alimento
    industrializado brasileiro. Não traz NCM — serve para nome, marca e
    imagem, poupando digitação mesmo sem o Cosmos contratado.
    """
    try:
        r = requests.get(
            f'https://world.openfoodfacts.org/api/v2/product/{gtin}.json',
            headers={'User-Agent': 'mercadinho-saas/1.0'},
            timeout=TIMEOUT,
        )
        if r.status_code != 200:
            return None
        d = r.json()
        if d.get('status') != 1:
            return None
        p = d.get('product') or {}
        nome = (p.get('product_name_pt') or p.get('product_name') or '').strip()
        if not nome:
            return None
        return {
            'nome': nome,
            'marca': (p.get('brands') or '').split(',')[0].strip(),
            'ncm': '',
            'imagem': p.get('image_url') or '',
            'origem': 'openfoodfacts',
        }
    except (requests.RequestException, ValueError) as e:
        logger.warning('Open Food Facts indisponível para %s: %s', gtin, e)
        return None


# ⚠️ Resolvidos por NOME a cada chamada, não guardados numa tupla.
# Guardar as funções congela a referência no import, e aí nem o teste
# consegue trocar o provedor por um mock, nem dá pra reordenar em runtime.
ORDEM_PROVEDORES = ('_consultar_cosmos', '_consultar_openfoodfacts')


def _provedores():
    import sys
    modulo = sys.modules[__name__]
    return [getattr(modulo, nome) for nome in ORDEM_PROVEDORES]


# ══════════════════════════════════════════════════════════════
# Cascata
# ══════════════════════════════════════════════════════════════

def resolver(codigo: str, *, buscar_externo: bool = True, **layout) -> Resolucao:
    """
    Args:
        codigo: o que o leitor entregou.
        buscar_externo: False mantém tudo local (útil no totem offline).
        **layout: digitos_plu, digitos_valor, modo, casas_peso — repassados
                  ao parser, vindos da configuração da unidade.
    """
    from ..models import ExternalBarcodeCatalog, Product

    leitura = parse(codigo, **layout)

    if not leitura.valido and leitura.tipo == TipoCodigo.DESCONHECIDO:
        return Resolucao(tipo=leitura.tipo, erro=leitura.erro)

    # ── 1. Balança: resolve por PLU, jamais pela internet ──────────────
    if leitura.tipo in (TipoCodigo.BALANCA_PESO, TipoCodigo.BALANCA_PRECO):
        res = Resolucao(
            tipo=leitura.tipo, peso_kg=leitura.peso_kg, preco=leitura.preco
        )
        if not leitura.valido:
            res.erro = leitura.erro
            return res

        p = Product.objects.filter(requires_scale=True, scale_plu=leitura.plu).first()
        if p:
            res.encontrado = True
            res.origem = 'balanca'
            res.product_id = p.id
            res.nome = p.name
            res.marca = p.brand or ''
            res.ncm = p.ncm
        else:
            res.erro = f'PLU {leitura.plu} não cadastrado nesta loja.'
        return res

    if not leitura.valido:
        return Resolucao(tipo=leitura.tipo, erro=leitura.erro)

    gtin = leitura.gtin
    res = Resolucao(tipo=TipoCodigo.GTIN, gtin=gtin)

    # ── 2. Catálogo local ──────────────────────────────────────────────
    p = Product.objects.filter(bar_code=gtin).first()
    if p:
        res.encontrado = True
        res.origem = 'local'
        res.product_id = p.id
        res.nome = p.name
        res.marca = p.brand or ''
        res.ncm = p.ncm
        res.imagem = p.image_url or ''
        if not p.is_fiscally_ready:
            res.avisos = [f'Pendência fiscal: {", ".join(p.fiscal_pendencies)}']
        return res

    # ── 3. Cache de buscas anteriores ──────────────────────────────────
    cache = ExternalBarcodeCatalog.objects.filter(gtin=gtin).first()
    if cache:
        res.encontrado = True
        res.origem = 'cache'
        res.nome = cache.description
        res.marca = cache.brand
        return res

    if not buscar_externo:
        res.erro = 'Não encontrado localmente (busca externa desativada).'
        return res

    # ── 4. Provedores externos ─────────────────────────────────────────
    for provedor in _provedores():
        dados = provedor(gtin)
        if not dados:
            continue

        # Grava no cache para não pagar/esperar de novo pelo mesmo código.
        ExternalBarcodeCatalog.objects.update_or_create(
            gtin=gtin,
            defaults={
                'brand': dados['marca'][:100],
                'description': dados['nome'][:255],
                'source': dados['origem'],
                'matched': False,
            },
        )
        res.encontrado = True
        res.origem = dados['origem']
        res.nome = dados['nome']
        res.marca = dados['marca']
        res.ncm = dados['ncm']
        res.imagem = dados['imagem']
        if not dados['ncm']:
            res.avisos = ['NCM não veio da consulta — preencha antes de emitir NFC-e.']
        return res

    # ── 5. Cadastro manual ─────────────────────────────────────────────
    res.erro = 'Produto não encontrado. Cadastre manualmente.'
    return res


def criar_produto_da_resolucao(res: Resolucao, **extras):
    """
    Cria o Product a partir do que a consulta trouxe.

    Não sobrescreve produto existente: quem já está no catálogo tem preço,
    NCM conferido e histórico — uma consulta externa não pode passar por
    cima disso.
    """
    from ..models import Product

    if not res.gtin:
        raise ValueError('Resolução sem GTIN não gera produto.')

    produto, criado = Product.objects.get_or_create(
        bar_code=res.gtin,
        defaults={
            'name': res.nome or f'Produto {res.gtin}',
            'brand': res.marca or None,
            'ncm': res.ncm or '',
            'image_url': res.imagem or None,
            'last_checked_at': timezone.now(),
            **extras,
        },
    )
    return produto, criado
