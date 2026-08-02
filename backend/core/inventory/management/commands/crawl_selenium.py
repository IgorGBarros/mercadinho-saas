from django.core.management.base import BaseCommand
from django.utils import timezone
from inventory.models import Product, PriceHistory
from inventory.scraper import detect_category
from seleniumbase import SB  # <--- Biblioteca Anti-Bloqueio
from bs4 import BeautifulSoup
import re
from decimal import Decimal
import time
import random

class Command(BaseCommand):
    help = 'Crawler Natura via Browser Real (Lógica Validada)'

    def handle(self, *args, **kwargs):
        # EM VEZ DE RANGE FIXO:
        # Pega produtos que têm SKU mas não têm preço (recém-descobertos)
        # OU produtos que não são atualizados há mais de 7 dias
        products = Product.objects.filter(natura_sku__isnull=False).order_by('last_checked_at')
        
        # Limita para não rodar infinito (ex: 50 por vez)
        products = products[:1893] 

        self.stdout.write(self.style.WARNING(f"🕷️ Atualizando {len(products)} produtos do banco..."))

        with SB(uc=True, headless=True) as sb:


             for product in products:
                sku = product.natura_sku # Usa o SKU do banco!
                url = f"https://www.natura.com.br/p/x/NATBRA-{sku}"
                

                
                try:
                    # 1. ACESSAR URL (Via Browser)
                    sb.open(url)
                    
                    # Espera humana (reduz chance de bloqueio)
                    # Antes: sb.sleep(random.uniform(1.5, 3.0))
                    # Agora: (Mais lento, mas não bloqueia)
                    sb.sleep(random.uniform(5.0, 12.0)) 

                    if "Access Denied" in sb.get_page_title():
                        self.stdout.write(self.style.ERROR(f"⛔ Bloqueio Pesado! Pausando por 5 minutos..."))
                        sb.sleep(300) # Espera 5 minutos
                        
                        # Tenta abrir a home de novo para resetar cookies
                        try: sb.open("https://www.natura.com.br/") 
                        except: pass
                        
                        continue # Tenta o mesmo SKU de novo ou pula

                    # 2. EXTRAIR HTML
                    page_source = sb.get_page_source()
                    soup = BeautifulSoup(page_source, 'html.parser')

                    # --- SUA LÓGICA DE EXTRAÇÃO MANTIDA ---

                    # A. VERIFICAÇÃO DE ERRO
                    if soup.find(string=re.compile(r"Ops\.\.\. Não encontramos")):
                        self.stdout.write(self.style.NOTICE(f"💨 SKU {sku} não existe."))
                        continue

                    # B. EXTRAIR NOME
                    title_tag = soup.find('h1', class_="text-2xl", tabindex="0")
                    if not title_tag:
                        # Fallback sem tabindex (às vezes o browser muda isso)
                        title_tag = soup.find('h1', class_="text-2xl")
                    
                    if not title_tag:
                        continue
                    
                    name = title_tag.text.strip()
                    
                    # C. EXTRAIR PREÇO
                    price = Decimal('0.00')
                    price_tag = soup.find('span', class_="text-xl font-medium", id="product-price")
                    
                    if price_tag:
                        raw_text = price_tag.get_text().strip()
                        match = re.search(r'(\d{1,3}(\.\d{3})*,\d{2})', raw_text)
                        if match:
                            clean_price = match.group(1).replace('.', '').replace(',', '.')
                            price = Decimal(clean_price)

                    # D. EXTRAIR IMAGEM
                    image_url = None
                    img_tag = soup.find('img', src=re.compile(r'production\.na01\.natura\.com'))
                    if img_tag:
                        image_url = img_tag.get('src')
                        # Limpeza opcional
                        if image_url: image_url = image_url.split('?')[0]

                    # E. SALVAR NO BANCO
                    category = detect_category(name)
                    cost_price = price * Decimal('0.70')

                    product, created = Product.objects.update_or_create(
                        natura_sku=str(sku),
                        defaults={
                            'name': name,
                            'official_price': price,
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
                    img_status = "🖼️" if image_url else "❌"
                    self.stdout.write(self.style.SUCCESS(f"{status} [{sku}] {name} | R$ {price} | {img_status}"))

                except Exception as e:
                    self.stdout.write(self.style.ERROR(f"❌ Erro SKU {sku}: {e}"))

        self.stdout.write(self.style.SUCCESS("✅ Finalizado!"))