"""
Worker de reposição. Rodar de hora em hora.

    0 * * * * cd /app && python manage.py analisar_estoque

Enquanto não houver Celery, cron resolve — o projeto já usa esse padrão
(expire_subscriptions). Reposição não é tempo real: uma hora de latência
não muda a decisão de compra.
"""
from django.core.management.base import BaseCommand

from inventory.models import Store
from replenishment.services.motor import analisar_unidade, gerar_picklist


class Command(BaseCommand):
    help = 'Recalcula ponto de pedido, gera alertas e monta romaneios.'

    def add_arguments(self, parser):
        parser.add_argument('--unit', type=int, help='Analisar só esta unidade.')
        parser.add_argument('--picklist', action='store_true', help='Gerar romaneio junto.')

    def handle(self, *args, **opts):
        unidades = Store.objects.filter(is_active=True)
        if opts.get('unit'):
            unidades = unidades.filter(pk=opts['unit'])

        for unidade in unidades:
            r = analisar_unidade(unidade)
            linha = ' '.join(f'{k}={v}' for k, v in r.items() if v)
            self.stdout.write(f'{unidade.name}: {linha or "nada a reportar"}')

            if opts.get('picklist'):
                pl = gerar_picklist(unidade)
                self.stdout.write(
                    self.style.SUCCESS(f'  romaneio #{pl.id}: {pl.items.count()} itens')
                )
