"""
Configura o modelo de teste gratuito: preços dos planos e trial para as lojas
que já existem.

Duas tarefas, ambas seguras de repetir:

1. Define os preços do PRO (mensal e anual) e DESLIGA os recursos do plano
   `free`. No modelo de teste, o `free` deixa de ser um plano utilizável e
   passa a ser apenas o estado "teste expirado" — é o que força a assinatura.

2. Concede o período de teste às lojas que já existem e nunca tiveram um.
   Sem isso, quem se cadastrou ANTES do trial existir ficaria travado sem
   nunca ter experimentado o produto completo.

Uso:
    python manage.py setup_trial                    # simula, não altera nada
    python manage.py setup_trial --apply            # aplica
    python manage.py setup_trial --apply --skip-existing   # só os preços
"""
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from inventory.models import PlanConfig, Store

# R$ 39,90/mês. No anual, 20% de desconto sobre 12 meses:
#   39,90 × 12 = 478,80  →  −20%  =  383,04  (equivale a R$ 31,92/mês)
PRECO_MENSAL = Decimal('39.90')
PRECO_ANUAL = Decimal('383.04')


class Command(BaseCommand):
    help = "Configura preços do plano PRO e concede o teste às lojas existentes."

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true',
                            help="Aplica as mudanças. Sem esta flag, apenas simula.")
        parser.add_argument('--skip-existing', action='store_true',
                            help="Não concede o teste às lojas já cadastradas.")

    def handle(self, *args, **options):
        aplicar = options['apply']
        dias = getattr(settings, 'TRIAL_DAYS', 14)
        modo = "APLICANDO" if aplicar else "SIMULAÇÃO (use --apply para valer)"
        self.stdout.write(f"[{modo}]\n")

        economia = (PRECO_MENSAL * 12) - PRECO_ANUAL
        self.stdout.write("Planos:")

        # ── PRO ──
        pro = PlanConfig.objects.filter(plan_type='pro').first()
        if pro:
            self.stdout.write(
                f"  PRO: R$ {pro.monthly_price}/mês, R$ {pro.yearly_price}/ano"
                f"  →  R$ {PRECO_MENSAL}/mês, R$ {PRECO_ANUAL}/ano"
            )
            if aplicar:
                pro.monthly_price = PRECO_MENSAL
                pro.yearly_price = PRECO_ANUAL
                pro.is_visible = True
                pro.save(update_fields=['monthly_price', 'yearly_price', 'is_visible'])
        else:
            self.stdout.write(f"  PRO: criar com R$ {PRECO_MENSAL}/mês, R$ {PRECO_ANUAL}/ano")
            if aplicar:
                PlanConfig.objects.create(
                    plan_type='pro', display_name='PRO',
                    description='Acesso completo',
                    monthly_price=PRECO_MENSAL, yearly_price=PRECO_ANUAL,
                    max_products=None, can_use_scanner=True,
                    can_use_storefront=True, can_use_alerts=True,
                    can_use_ai_assistant=True, can_use_analytics=True,
                    is_visible=True, sort_order=1,
                )
        self.stdout.write(
            f"  → no anual a consultora economiza R$ {economia:.2f} "
            f"(R$ {PRECO_ANUAL / 12:.2f}/mês)"
        )

        # ── FREE vira o estado "teste expirado" ──
        free = PlanConfig.objects.filter(plan_type='free').first()
        if free:
            self.stdout.write(
                "  FREE: recursos DESLIGADOS — passa a ser o estado de teste expirado"
            )
            if aplicar:
                free.can_use_scanner = False
                free.can_use_storefront = False
                free.can_use_alerts = False
                free.can_use_ai_assistant = False
                free.can_use_analytics = False
                free.max_products = 0
                free.is_visible = False
                free.save()

        # ── Lojas existentes ──
        if options['skip_existing']:
            self.stdout.write("\nLojas existentes: ignoradas (--skip-existing)")
        else:
            agora = timezone.now()
            sem_trial = Store.objects.filter(
                trial_ends_at__isnull=True
            ).exclude(plan='pro').select_related('owner')

            total = sem_trial.count()
            self.stdout.write(f"\nLojas sem teste e sem assinatura: {total}")
            if total:
                self.stdout.write(f"  → conceder {dias} dias a partir de agora:")
                for s in sem_trial[:20]:
                    email = getattr(s.owner, 'email', 'sem email')
                    self.stdout.write(f"     loja {s.id} ({email})")
                if total > 20:
                    self.stdout.write(f"     ... e mais {total - 20}")

                if aplicar:
                    sem_trial.update(
                        trial_started_at=agora,
                        trial_ends_at=agora + timedelta(days=dias),
                    )

        if aplicar:
            self.stdout.write(self.style.SUCCESS("\n✅ Configuração aplicada."))
            self.stdout.write(
                "⚠️  Assinantes atuais continuam pagando o valor da assinatura já "
                "criada no Asaas. Mudar o preço aqui vale para NOVOS checkouts."
            )
        else:
            self.stdout.write(self.style.WARNING("\n⚠️ Nada alterado. Rode com --apply."))