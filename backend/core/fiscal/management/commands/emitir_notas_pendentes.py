"""
Worker de emissão de NFC-e.

Rodar por cron a cada 2 minutos. Enquanto não houver Celery, é assim que
a nota sai — e é suficiente: a emissão é assíncrona por natureza, ninguém
está esperando na frente do totem.

    */2 * * * * cd /app && python manage.py emitir_notas_pendentes
"""
from django.core.management.base import BaseCommand

from fiscal.services.emissao import processar_pendentes


class Command(BaseCommand):
    help = 'Transmite e consulta NFC-e pendentes.'

    def add_arguments(self, parser):
        parser.add_argument('--limite', type=int, default=50)

    def handle(self, *args, **opts):
        r = processar_pendentes(limite=opts['limite'])
        self.stdout.write(self.style.SUCCESS(
            f"autorizadas={r['autorizadas']} "
            f"rejeitadas={r['rejeitadas']} "
            f"reagendadas={r['reagendadas']}"
        ))
