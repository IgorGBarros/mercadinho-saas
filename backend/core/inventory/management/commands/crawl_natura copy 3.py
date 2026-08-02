from django.core.management.base import BaseCommand
from django.utils import timezone
from inventory.models import Product, PriceHistory, CrawlerLog
from inventory.scraper import detect_category
import cloudscraper  # <--- A MÁGICA
from bs4 import BeautifulSoup
import time
import random
import re
from decimal import Decimal
from concurrent.futures import ThreadPoolExecutor, as_completed

class Command(BaseCommand):
    help = 'Crawler Natura Blindado (CloudScraper)'

    def handle(self, *args, **kwargs):
        start_sku = 38848
        end_sku = 72000 
        max_workers =1 # Com cloudscraper podemos tentar subir um pouco

        self.stdout.write(self.style.WARNING(f"🕷️ Iniciando Crawler Blindado: {start_sku} a {end_sku}..."))

        # Cria um scraper que imita o Chrome
        self.scraper = cloudscraper.create_scraper(browser={'browser': 'chrome', 'platform': 'windows', 'mobile': False})

        skus_to_check = range(start_sku, end_sku + 1)
        
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {executor.submit(self.process_sku, sku): sku for sku in skus_to_check}
            
            for future in as_completed(futures):
                try:
                    future.result()
                except Exception as e:
                    print(f"💥 Crash: {e}")

        self.stdout.write(self.style.SUCCESS("✅ Finalizado!"))

    def process_sku(self, sku):
        url = f"https://www.natura.com.br/p/x/NATBRA-{sku}"
        
        try:
            time.sleep(random.uniform(1.5, 4.0)) # Delay ainda é bom
            
            # Usa o cloudscraper no lugar de requests
            resp = self.scraper.get(url, timeout=30)
            
            if resp.status_code == 200:
                soup = BeautifulSoup(resp.text, 'html.parser')
                
                # ... (Lógica de Extração Igual à Anterior) ...
                # Copie daqui para baixo a lógica de BeautifulSoup que já estava funcionando
                
                if soup.find(string=re.compile(r"Ops\.\.\. Não encontramos")):
                    return

                title_tag = soup.find('h1', class_="text-2xl") # sem tabindex pois varia
                if not title_tag: return
                name = title_tag.text.strip()
                
                price = Decimal('0.00')
                # Tenta vários IDs de preço
                price_tag = soup.find('span', id="product-price") or soup.find('span', id="product-price-por")
                
                if price_tag:
                    raw_text = price_tag.get_text().strip()
                    match = re.search(r'(\d{1,3}(\.\d{3})*,\d{2})', raw_text)
                    if match:
                        clean_price = match.group(1).replace('.', '').replace(',', '.')
                        price = Decimal(clean_price)

                image_url = None
                img_tag = soup.find('img', src=re.compile(r'production\.na01'))
                if img_tag: image_url = img_tag.get('src').split('?')[0]

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
                print(f"{status} [{sku}] {name} | R$ {price}")
            
            elif resp.status_code == 403:
                print(f"⛔ 403 (Cloudflare pegou SKU {sku})")
            
        except Exception as e:
            # Erros de conexão silenciosos
            pass