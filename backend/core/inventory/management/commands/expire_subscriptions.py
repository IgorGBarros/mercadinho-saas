"""
Rebaixa para FREE as lojas cujo plano PRO venceu há mais de X dias.

Por que existe: nada no sistema devolvia o plano para 'free' quando a
assinatura vencia. Como `plan_config` lê `plan_type=self.plan`, uma
consultora que parasse de pagar continuaria com todos os recursos PRO para
sempre.

O período de carência evita rebaixar quem só teve um atraso normal de
compensação (boleto leva de 1 a 3 dias úteis; cartão pode falhar na primeira
tentativa e ser recobrado pelo Asaas).

Uso:
    python manage.py expire_subscriptions            # simula (não altera nada)
    python manage.py expire_subscriptions --apply    # aplica de verdade
    python manage.py expire_subscriptions --apply --grace-days 10

Agende no Render como Cron Job diário:
    python manage.py expire_subscriptions --apply
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from inventory.models import Store

GRACE_DAYS_PADRAO = 7


class Command(BaseCommand):
    help = "Rebaixa para FREE assinaturas PRO vencidas além do período de carência."

    def add_arguments(self, parser):
        parser.add_argument(
            '--apply', action='store_true',
            help="Aplica as mudanças. Sem esta flag, apenas simula.",
        )
        parser.add_argument(
            '--grace-days', type=int, default=GRACE_DAYS_PADRAO,
            help=f"Dias de tolerância após o vencimento (padrão: {GRACE_DAYS_PADRAO}).",
        )

    def handle(self, *args, **options):
        aplicar = options['apply']
        carencia = options['grace_days']
        agora = timezone.now()
        limite = agora - timedelta(days=carencia)

        # Lojas PRO cujo vencimento já passou do limite de carência.
        # Lojas sem data de vencimento NÃO são tocadas: podem ser cortesias,
        # contas internas ou upgrades manuais feitos pelo painel admin.
        vencidas = Store.objects.filter(
            plan='pro',
            subscription_expires_at__isnull=False,
            subscription_expires_at__lt=limite,
        ).select_related('owner')

        total = vencidas.count()

        if total == 0:
            self.stdout.write(self.style.SUCCESS(
                f"Nenhuma assinatura vencida há mais de {carencia} dias."
            ))
            return

        modo = "APLICANDO" if aplicar else "SIMULAÇÃO (use --apply para valer)"
        self.stdout.write(f"[{modo}] {total} loja(s) com PRO vencido há mais de {carencia} dias:\n")

        for store in vencidas:
            dias_vencido = (agora - store.subscription_expires_at).days
            email = getattr(store.owner, 'email', 'sem email')
            self.stdout.write(
                f"  • loja {store.id} ({email}) — venceu há {dias_vencido} dias "
                f"em {store.subscription_expires_at:%d/%m/%Y}"
            )

            if aplicar:
                store.plan = 'free'
                store.save(update_fields=['plan'])

        if aplicar:
            self.stdout.write(self.style.SUCCESS(
                f"\n✅ {total} loja(s) rebaixada(s) para FREE."
            ))
        else:
            self.stdout.write(self.style.WARNING(
                f"\n⚠️ Nada foi alterado. Rode com --apply para efetivar."
            ))