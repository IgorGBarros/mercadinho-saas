"""
replenishment/services/motor.py — ponto de pedido e alertas.

    venda_média_diária = saídas do período ÷ DIAS COM ESTOQUE
    ponto_de_pedido    = venda_média_diária × lead_time + estoque_segurança
    sugestão_de_compra = nível_de_recompletamento − estoque_atual

⚠️ O DENOMINADOR É "DIAS COM ESTOQUE", NÃO "DIAS DO PERÍODO".
Este é o erro que mantém mercadinho perpetuamente desabastecido. Se o
refrigerante ficou em falta 10 dos últimos 28 dias, dividir por 28
subestima a demanda em 36% — o sistema então sugere comprar pouco, o
produto falta de novo, o denominador piora, e a estimativa afunda a cada
ciclo. Dividir pelos dias em que havia o que vender corrige o viés.
"""
import logging
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from ..models import Alert, PickList, PickListItem, ReplenishmentRule

logger = logging.getLogger(__name__)

JANELA_DIAS = 28          # 4 semanas: cobre o ciclo semanal completo
DIAS_DEAD_STOCK = 30
DIAS_VALIDADE_CRITICA = 7


# ══════════════════════════════════════════════════════════════
# Velocidade de venda
# ══════════════════════════════════════════════════════════════

def calcular_velocidade(item, janela_dias=JANELA_DIAS) -> Decimal:
    """Unidades vendidas por dia, corrigido por ruptura."""
    from inventory.models import StockTransaction

    desde = timezone.now() - timedelta(days=janela_dias)

    saidas = (
        StockTransaction.objects
        .filter(store=item.store, product=item.product,
                transaction_type='VENDA', created_at__gte=desde)
        .aggregate(total=Sum('quantity'))['total'] or 0
    )
    vendido = abs(saidas)
    if not vendido:
        return Decimal('0')

    dias_com_estoque = _dias_com_estoque(item, desde, janela_dias)
    return (Decimal(vendido) / Decimal(dias_com_estoque)).quantize(Decimal('0.001'))


def _dias_com_estoque(item, desde, janela_dias) -> int:
    """
    Estimativa de quantos dias houve o que vender.

    Aproximação deliberada: contamos os dias em que houve movimento de
    venda e assumimos que os demais também tinham estoque, a menos que o
    item esteja zerado agora. Reconstruir o saldo diário exato exigiria
    varrer todo o razão — caro, e a precisão extra não muda a decisão de
    compra.
    """
    from inventory.models import StockTransaction

    dias_com_venda = (
        StockTransaction.objects
        .filter(store=item.store, product=item.product,
                transaction_type='VENDA', created_at__gte=desde)
        .dates('created_at', 'day')
        .count()
    )

    if (item.total_quantity or 0) > 0:
        return max(janela_dias, 1)

    # Zerado hoje: só os dias com venda são confiáveis.
    return max(dias_com_venda, 1)


@transaction.atomic
def recalcular_regra(item) -> ReplenishmentRule:
    regra, _ = ReplenishmentRule.objects.get_or_create(item=item)
    if not regra.is_auto:
        return regra

    velocidade = calcular_velocidade(item)
    regra.venda_media_diaria = velocidade

    if velocidade > 0:
        # Segurança de meio lead time absorve o pico de fim de semana sem
        # inchar o estoque — mercadinho de condomínio tem espaço curto.
        seguranca = int((velocidade * regra.lead_time_days / 2).to_integral_value()) or 1
        regra.safety_stock = seguranca
        regra.min_qty = int((velocidade * regra.lead_time_days).to_integral_value()) + seguranca
        # Recompletar para ~2 lead times evita viagem de reposição por item.
        regra.max_qty = max(regra.min_qty * 2, regra.min_qty + 1)
    else:
        regra.min_qty = item.min_quantity or 0
        regra.max_qty = max((item.min_quantity or 0) * 2, 1)
        regra.safety_stock = 0

    regra.calculado_em = timezone.now()
    regra.save()
    return regra


# ══════════════════════════════════════════════════════════════
# Alertas
# ══════════════════════════════════════════════════════════════

def _abrir_alerta(unit, *, tipo, chave, titulo, severidade, detalhe='', item=None,
                  device=None, dados=None):
    """Cria ou atualiza. Nunca duplica alerta aberto com a mesma chave."""
    alerta, criado = Alert.objects.get_or_create(
        unit=unit, chave=chave, resolvido_em__isnull=True,
        defaults={
            'tipo': tipo, 'titulo': titulo, 'severidade': severidade,
            'detalhe': detalhe, 'item': item, 'device': device, 'dados': dados or {},
        },
    )
    if not criado:
        alerta.titulo = titulo
        alerta.detalhe = detalhe
        alerta.severidade = severidade
        alerta.dados = dados or {}
        alerta.save(update_fields=['titulo', 'detalhe', 'severidade', 'dados', 'atualizado_em'])
    return alerta


def analisar_unidade(unit) -> dict:
    """Roda os seis alertas. Chamado pelo worker."""
    from inventory.models import InventoryBatch, InventoryItem, StockTransaction
    from tenancy.models import Device

    hoje = timezone.now().date()
    resumo = {t.value: 0 for t in Alert.Tipo}
    chaves_vivas = set()

    itens = InventoryItem.objects.filter(store=unit).select_related('product')

    for item in itens:
        regra = recalcular_regra(item)
        estoque = item.total_quantity or 0

        # 1 ─ Ruptura ativa: cada hora é venda perdida.
        if estoque == 0 and regra.venda_media_diaria > 0:
            chave = f'ruptura_ativa:{item.id}'
            chaves_vivas.add(chave)
            _abrir_alerta(
                unit, tipo=Alert.Tipo.RUPTURA_ATIVA, chave=chave, item=item,
                severidade=Alert.Severidade.URGENTE,
                titulo=f'{item.product.name} zerado',
                detalhe=f'Vende ~{regra.venda_media_diaria}/dia. Cada hora parado é venda perdida.',
                dados={'velocidade': str(regra.venda_media_diaria)},
            )
            resumo[Alert.Tipo.RUPTURA_ATIVA] += 1

        # 2 ─ Ruptura prevista: dá tempo de comprar.
        elif regra.min_qty and estoque <= regra.min_qty:
            cobertura = regra.dias_de_cobertura
            chave = f'ruptura_prevista:{item.id}'
            chaves_vivas.add(chave)
            _abrir_alerta(
                unit, tipo=Alert.Tipo.RUPTURA_PREVISTA, chave=chave, item=item,
                severidade=Alert.Severidade.ATENCAO,
                titulo=f'{item.product.name}: repor {max(regra.max_qty - estoque, 0)} un.',
                detalhe=(f'Estoque {estoque}, ponto de pedido {regra.min_qty}. '
                         + (f'Cobertura de {cobertura:.1f} dias.' if cobertura else '')),
                dados={'sugestao': max(regra.max_qty - estoque, 0),
                       'cobertura_dias': cobertura},
            )
            resumo[Alert.Tipo.RUPTURA_PREVISTA] += 1

        # 3 ─ Dead stock: ocupa prateleira, que é o recurso escasso.
        if estoque > 0 and regra.venda_media_diaria == 0:
            desde = timezone.now() - timedelta(days=DIAS_DEAD_STOCK)
            teve_saida = StockTransaction.objects.filter(
                store=unit, product=item.product,
                transaction_type='VENDA', created_at__gte=desde,
            ).exists()
            if not teve_saida:
                chave = f'dead_stock:{item.id}'
                chaves_vivas.add(chave)
                _abrir_alerta(
                    unit, tipo=Alert.Tipo.DEAD_STOCK, chave=chave, item=item,
                    severidade=Alert.Severidade.INFO,
                    titulo=f'{item.product.name} parado há {DIAS_DEAD_STOCK} dias',
                    detalhe=f'{estoque} un. ocupando prateleira. Considere descontinuar.',
                )
                resumo[Alert.Tipo.DEAD_STOCK] += 1

    # 4 ─ Validade crítica: maior gerador de perda em loja desassistida.
    limite = hoje + timedelta(days=DIAS_VALIDADE_CRITICA)
    vencendo = (InventoryBatch.objects
                .filter(item__store=unit, quantity__gt=0,
                        expiration_date__isnull=False, expiration_date__lte=limite)
                .select_related('item__product'))
    for lote in vencendo:
        dias = (lote.expiration_date - hoje).days
        chave = f'validade:{lote.id}'
        chaves_vivas.add(chave)
        _abrir_alerta(
            unit, tipo=Alert.Tipo.VALIDADE, chave=chave, item=lote.item,
            severidade=Alert.Severidade.URGENTE if dias <= 2 else Alert.Severidade.ATENCAO,
            titulo=(f'{lote.item.product.name}: {lote.quantity} un. '
                    + ('VENCIDO' if dias < 0 else f'vence em {dias} dia(s)')),
            detalhe='Remarque ou promova antes de virar perda.',
            dados={'lote_id': lote.id, 'dias': dias, 'quantidade': lote.quantity},
        )
        resumo[Alert.Tipo.VALIDADE] += 1

    # 5 ─ Totem offline: loja parada é receita zero.
    for device in Device.objects.filter(unit=unit, is_blocked=False):
        if not device.is_online:
            chave = f'device_offline:{device.id}'
            chaves_vivas.add(chave)
            visto = (f'desde {timezone.localtime(device.last_seen):%d/%m %H:%M}'
                     if device.last_seen else 'nunca se conectou')
            _abrir_alerta(
                unit, tipo=Alert.Tipo.DEVICE_OFFLINE, chave=chave, device=device,
                severidade=Alert.Severidade.URGENTE,
                titulo=f'{device} sem comunicação',
                detalhe=f'Último contato: {visto}. Loja parada não vende.',
            )
            resumo[Alert.Tipo.DEVICE_OFFLINE] += 1

    # Fecha o que deixou de valer. Alerta que não some sozinho vira ruído,
    # e ruído faz o lojista parar de olhar o sino.
    fechados = (Alert.objects
                .filter(unit=unit, resolvido_em__isnull=True)
                .exclude(chave__in=chaves_vivas)
                .exclude(tipo=Alert.Tipo.DIVERGENCIA))
    resumo['resolvidos'] = fechados.count()
    fechados.update(resolvido_em=timezone.now())

    return resumo


def registrar_divergencia(item, contado, *, observacao=''):
    """
    Contagem cega não bateu com o sistema.

    O indicador nº 1 de loja desassistida: a diferença é furto, erro de
    baixa ou avaria não registrada. Não se resolve sozinho — por isso este
    alerta é o único que `analisar_unidade` nunca fecha automaticamente.
    """
    sistema = item.total_quantity or 0
    diferenca = contado - sistema
    if diferenca == 0:
        return None

    return _abrir_alerta(
        item.store, tipo=Alert.Tipo.DIVERGENCIA,
        chave=f'divergencia:{item.id}:{timezone.now():%Y%m%d%H%M}',
        item=item, severidade=Alert.Severidade.URGENTE,
        titulo=f'{item.product.name}: contagem {contado}, sistema {sistema}',
        detalhe=observacao or 'Investigar furto, erro de baixa ou avaria não registrada.',
        dados={'sistema': sistema, 'contado': contado, 'diferenca': diferenca},
    )


# ══════════════════════════════════════════════════════════════
# Romaneio
# ══════════════════════════════════════════════════════════════

@transaction.atomic
def gerar_picklist(unit, responsavel=None):
    """
    Transforma as sugestões num romaneio para o repositor.

    Reaproveita um romaneio aberto em vez de criar outro: dois romaneios
    simultâneos da mesma unidade levariam a repor em dobro.
    """
    from inventory.models import InventoryItem

    aberto = PickList.objects.filter(
        unit=unit, status__in=[PickList.Status.ABERTO, PickList.Status.EM_ROTA]
    ).first()
    picklist = aberto or PickList.objects.create(unit=unit, responsavel=responsavel)

    itens = InventoryItem.objects.filter(store=unit).select_related('product', 'replenishment')
    criados = 0

    for item in itens:
        regra = getattr(item, 'replenishment', None)
        if not regra or not regra.min_qty:
            continue

        estoque = item.total_quantity or 0
        if estoque > regra.min_qty:
            continue

        sugestao = max(regra.max_qty - estoque, 0)
        if not sugestao:
            continue

        _, novo = PickListItem.objects.update_or_create(
            picklist=picklist, item=item,
            defaults={
                'quantidade_sugerida': sugestao,
                'estoque_no_momento': estoque,
                'cobertura_dias': regra.dias_de_cobertura,
            },
        )
        criados += int(novo)

    logger.info('Romaneio %s da unidade %s: %s itens novos.', picklist.id, unit.id, criados)
    return picklist
