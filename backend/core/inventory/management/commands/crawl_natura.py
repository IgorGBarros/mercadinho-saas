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

class Command(BaseCommand):
    help = 'Crawler Natura Completo (Com Imagens)'

    def handle(self, *args, **kwargs):
        # Defina o intervalo ou pegue do banco (ex: Product.objects.filter(image_url__isnull=True))
        start_sku = 39014
        end_sku = 73000 

        self.stdout.write(self.style.WARNING(f"🕷️ Iniciando Crawler: {start_sku} a {end_sku}..."))

        ua_list = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15'
        ]

        for sku in range(start_sku, end_sku + 1):
            url = f"https://www.natura.com.br/p/x/NATBRA-{sku}"
            
            try:
                headers = {'User-Agent': random.choice(ua_list)}
                time.sleep(random.uniform(1.2, 2.5))
                
                resp = requests.get(url, headers=headers, timeout=10, allow_redirects=True)
                
                if resp.status_code == 200:
                    soup = BeautifulSoup(resp.text, 'html.parser')
                    
                    # 1. VERIFICAÇÃO DE ERRO
                    if soup.find(string=re.compile(r"Ops\.\.\. Não encontramos")):
                        self.stdout.write(self.style.NOTICE(f"💨 SKU {sku} não existe."))
                        continue

                    # 2. EXTRAIR NOME
                    title_tag = soup.find('h1', class_="text-2xl", tabindex=0)
                    if not title_tag:
                        continue
                    name = title_tag.text.strip()
                    
                    # 3. EXTRAIR PREÇO
                    price = Decimal('0.00')
                    price_tag = soup.find('span', class_="text-xl font-medium", tabindex="0", id="product-price")
                    
                    if price_tag:
                        raw_text = price_tag.get_text().strip()
                        match = re.search(r'(\d{1,3}(\.\d{3})*,\d{2})', raw_text)
                        if match:
                            clean_price = match.group(1).replace('.', '').replace(',', '.')
                            price = Decimal(clean_price)

                    # 4. EXTRAIR IMAGEM (A novidade!)
                    # Procuramos uma tag <img> cujo 'src' contenha o domínio de mídia da Natura
                    image_url = None
                    img_tag = soup.find('img', src=re.compile(r'production\.na01\.natura\.com'))
                    
                    if img_tag:
                        image_url = img_tag.get('src')
                        # Limpeza opcional: remover parâmetros de redimensionamento para pegar a original
                        # Ex: tira o "?sw=600&q=80" do final
                        # image_url = image_url.split('?')[0] 

                    # 5. SALVAR NO BANCO
                    category = detect_category(name)
                    cost_price = price * Decimal('0.70')

                    product, created = Product.objects.update_or_create(
                        natura_sku=str(sku),
                        defaults={
                            'name': name,
                            'sale_price': price,
                            'cost_price': cost_price,
                            'category': category,
                            'image_url': image_url, # <--- Salvando a imagem aqui
                            'bar_code': None,
                            'last_checked_at': timezone.now(),
                            'last_checked_price': price,
                            'description': f"{name}\nRef: {sku}"
                        }
                    )
                    
                    if price > 0:
                        PriceHistory.objects.create(product=product, price=price)
                    
                    status = "✨" if created else "🔄"
                    img_status = "🖼️" if image_url else "❌"
                    self.stdout.write(self.style.SUCCESS(f"{status} [{sku}] {name} | R$ {price} | {image_url}"))
                
                else:
                    self.stdout.write(self.style.ERROR(f"❌ Erro HTTP {resp.status_code}"))

            except Exception as e:
                self.stdout.write(self.style.ERROR(f"❌ Erro SKU {sku}: {str(e)}"))

        self.stdout.write(self.style.SUCCESS("✅ Finalizado!"))