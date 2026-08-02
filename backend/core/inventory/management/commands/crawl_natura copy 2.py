from django.core.management.base import BaseCommand
from django.utils import timezone
from inventory.models import Product, PriceHistory
from inventory.scraper import detect_category
import requests
from bs4 import BeautifulSoup
import time
import random
import re
from decimal import Decimal
from concurrent.futures import ThreadPoolExecutor, as_completed

class Command(BaseCommand):
    help = 'Crawler Natura Turbo (Multi-Thread)'

    def handle(self, *args, **kwargs):
        start_sku = 10000
        end_sku = 390000# Teste com 1000 itens primeiro
        max_workers = 5 # Número de requisições simultâneas (Cuidado: >10 pode dar bloqueio)

        self.stdout.write(self.style.WARNING(f"🕷️ Iniciando Crawler Turbo ({max_workers} threads): SKUs {start_sku} a {end_sku}..."))

        skus_to_check = range(start_sku, end_sku + 1)
        
        # Inicia o Pool de Threads
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {executor.submit(self.process_sku, sku): sku for sku in skus_to_check}
            
            for future in as_completed(futures):
                sku = futures[future]
                try:
                    future.result() # Pega o resultado ou erro
                except Exception as e:
                    self.stdout.write(self.style.ERROR(f"❌ Erro Thread SKU {sku}: {e}"))

        self.stdout.write(self.style.SUCCESS("✅ Finalizado!"))

    def process_sku(self, sku):
        """Função que roda em cada Thread isoladamente"""
        
        url = f"https://www.natura.com.br/p/x/NATBRA-{sku}"
        
        # Headers rotativos básicos
        ua_list = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15'
        ]
        headers = {'User-Agent': random.choice(ua_list)}

        try:
            # Delay menor porque estamos em threads, mas ainda necessário
            time.sleep(random.uniform(0.5, 1.5))
            
            resp = requests.get(url, headers=headers, timeout=10)
            
            if resp.status_code == 200:
                soup = BeautifulSoup(resp.text, 'html.parser')
                
                # 1. VERIFICAÇÃO DE ERRO
                if soup.find(string=re.compile(r"Ops\.\.\. Não encontramos")):
                    # self.stdout.write(f"💨 {sku} não existe.") # Comentei pra não poluir o log
                    return

                # 2. EXTRAIR NOME
                title_tag = soup.find('h1', class_="text-2xl", tabindex="0")
                # Fallback sem tabindex
                if not title_tag: title_tag = soup.find('h1', class_="text-2xl")
                
                if not title_tag: return
                name = title_tag.text.strip()
                
                # 3. EXTRAIR PREÇO
                price = Decimal('0.00')
                price_tag = soup.find('span', id="product-price")
                
                if price_tag:
                    raw_text = price_tag.get_text().strip()
                    match = re.search(r'(\d{1,3}(\.\d{3})*,\d{2})', raw_text)
                    if match:
                        clean_price = match.group(1).replace('.', '').replace(',', '.')
                        price = Decimal(clean_price)

                # 4. EXTRAIR IMAGEM
                image_url = None
                img_tag = soup.find('img', src=re.compile(r'production\.na01\.natura\.com'))
                if img_tag:
                    image_url = img_tag.get('src').split('?')[0]

                # 5. SALVAR NO BANCO (Django ORM é thread-safe para writes simples)
                category = detect_category(name)
                cost_price = price * Decimal('0.70')

                product, created = Product.objects.update_or_create(
                    natura_sku=str(sku),
                    defaults={
                        'name': name,
                        'sale_price': price,
                        'cost_price': cost_price,
                        'category': category,
                        'image_url': image_url,
                        'bar_code': None,
                        'last_checked_at': timezone.now(),
                        'last_checked_price': price,
                        'description': f"{name}\nRef: {sku}"
                    }
                )
                
                if price > 0:
                    PriceHistory.objects.create(product=product, price=price)
                
                status = "✨" if created else "🔄"
                # Usar print simples em threads evita quebra de linha do stdout.write
                print(f"{status} [{sku}] {name} | R$ {price}| {image_url}")
            
            elif resp.status_code == 403:
                print(f"⛔ 403 Bloqueado SKU {sku}")
            
        except Exception as e:
            print(f"❌ Erro SKU {sku}: {str(e)}")