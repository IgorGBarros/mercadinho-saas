"""
Recalcula total_orders e total_spent de TODOS os leads a partir dos
carrinhos fechados de verdade — corrige o resíduo de um bug já corrigido:
antes, excluir um pedido não descontava esses números, então quem excluiu
pedidos antes da correção ficou com contadores errados pra sempre (eram só
somados, nunca reconferidos).

Este comando não confia no valor atual do campo — ele IGNORA o que está
salvo e recalcula do zero, contando de verdade quantos Cart(checked_out=True)
cada lead tem e somando os itens. É a fonte da verdade (a tabela de
pedidos), não um ajuste incremental.

Uso:
    python manage.py fix_lead_totals              # simula, mostra o que mudaria
    python manage.py fix_lead_totals --apply       # aplica de verdade
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db.models import Prefetch

from inventory.models import Lead, Cart


class Command(BaseCommand):
    help = "Recalcula total_orders/total_spent de todos os leads a partir dos pedidos fechados reais."

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true',
                            help="Aplica a correção. Sem esta flag, apenas simula.")

    def handle(self, *args, **options):
        aplicar = options['apply']
        modo = "APLICANDO" if aplicar else "SIMULAÇÃO (use --apply para valer)"
        self.stdout.write(f"[{modo}]\n")

        leads = Lead.objects.prefetch_related(
            Prefetch('carts', queryset=Cart.objects.filter(checked_out=True).prefetch_related('items'))
        )

        corrigidos = 0
        for lead in leads:
            pedidos_reais = [c for c in lead.carts.all() if c.items.exists()]
            total_orders_real = len(pedidos_reais)
            total_spent_real = sum(
                (i.price_snapshot * i.quantity for c in pedidos_reais for i in c.items.all()),
                Decimal('0'),
            )

            if lead.total_orders != total_orders_real or lead.total_spent != total_spent_real:
                self.stdout.write(
                    f"  {lead.name} (loja {lead.store_id}): "
                    f"pedidos {lead.total_orders} → {total_orders_real} | "
                    f"gasto R$ {lead.total_spent} → R$ {total_spent_real}"
                )
                corrigidos += 1
                if aplicar:
                    lead.total_orders = total_orders_real
                    lead.total_spent = total_spent_real
                    lead.save(update_fields=['total_orders', 'total_spent'])

        if corrigidos == 0:
            self.stdout.write(self.style.SUCCESS("Nenhum lead com contador incorreto encontrado."))
        elif aplicar:
            self.stdout.write(self.style.SUCCESS(f"\n✅ {corrigidos} lead(s) corrigido(s)."))
        else:
            self.stdout.write(self.style.WARNING(f"\n⚠️ {corrigidos} lead(s) seriam corrigidos. Rode com --apply."))
