from django.core.management import call_command
from django.core.management.base import BaseCommand
import time

class Command(BaseCommand):
    help = 'Roda o ciclo completo: Descobrir novos produtos -> Atualizar detalhes'

    def handle(self, *args, **kwargs):
        self.stdout.write(self.style.WARNING("🚀 Iniciando Ciclo de Atualização do Estoque..."))

        # 1. Fase de Descoberta (Navega nas categorias)
        self.stdout.write("--- FASE 1: DESCOBERTA ---")
        try:
            call_command('discover_skus')
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Erro na descoberta: {e}"))

        self.stdout.write("⏳ Pausa de 30 segundos para 'esfriar' o IP...")
        time.sleep(30)

        # 2. Fase de Enriquecimento (Pega preços e fotos dos produtos descobertos)
        self.stdout.write("--- FASE 2: ENRIQUECIMENTO ---")
        try:
            # Aqui assumimos que o crawl_natura foi ajustado para pegar do banco
            call_command('crawl_selenium') 
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Erro no enriquecimento: {e}"))

        self.stdout.write(self.style.SUCCESS("✅ Ciclo Completo Finalizado!"))