from django.core.management.base import BaseCommand
from django.utils import timezone
from inventory.models import Product, PriceHistory
from inventory.scraper import detect_category # Certifique-se de que essa função existe
from seleniumbase import SB
from bs4 import BeautifulSoup
import re
from decimal import Decimal
import random

class Command(BaseCommand):
    help = 'Crawler Natura via Browser Real para atualizar preços e descrições'

    def handle(self, *args, **kwargs):
        # Pega até 1900 produtos que têm SKU, ordenados pelos mais desatualizados primeiro
        products = Product.objects.filter(natura_sku__isnull=False).order_by('last_checked_at')[:2730]
        
        self.stdout.write(self.style.WARNING(f"🕷️ Iniciando atualização de {len(products)} produtos..."))
        
        with SB(uc=True, headless=True) as sb:
             for product in products:
                sku = product.natura_sku
                url = f"https://www.natura.com.br/p/x/NATBRA-{sku}"
                
                try:
                    # 1. ACESSAR URL
                    sb.open(url)
                    
                    # Pausa aleatória para simular humano
                    sb.sleep(random.uniform(5.0, 10.0)) 
                    
                    if "Access Denied" in sb.get_page_title():
                        self.stdout.write(self.style.ERROR(f"⛔ Bloqueio Pesado! Pausando por 5 minutos..."))
                        sb.sleep(300) # Espera 5 minutos
                        try: sb.open("https://www.natura.com.br/") 
                        except: pass
                        continue
                        
                    # 2. EXTRAIR HTML
                    page_source = sb.get_page_source()
                    soup = BeautifulSoup(page_source, 'html.parser')
                    
                    # A. VERIFICAÇÃO DE PRODUTO INEXISTENTE
                    if soup.find(string=re.compile(r"Ops\.\.\. Não encontramos")):
                        self.stdout.write(self.style.NOTICE(f"💨 SKU {sku} não existe mais no site."))
                        continue
                        
                    # B. EXTRAIR NOME
                    title_tag = soup.find('h1', class_="text-2xl", tabindex="0") or soup.find('h1', class_="text-2xl")
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
                        if image_url: image_url = image_url.split('?')[0]
                        
                    # E. EXTRAIR DESCRIÇÃO (Tentativa de pegar a descrição real do site)
                    description_text = None
                    # Procura por divs que geralmente guardam a descrição na Natura
                    desc_tag = soup.find('div', id=re.compile(r'description', re.I)) or soup.find('div', class_=re.compile(r'description', re.I))
                    if desc_tag:
                        description_text = desc_tag.get_text(separator='\n', strip=True)

                    # F. ATUALIZAR O PRODUTO NO BANCO DE DADOS (SEGURANÇA TOTAL)
                    # Alteramos diretamente o objeto já carregado na memória, preservando o bar_code!
                    product.name = name
                    product.official_price = price
                    product.category = detect_category(name)
                    product.last_checked_at = timezone.now()
                    product.last_checked_price = price
                    
                    # Atualiza imagem só se encontrou uma nova
                    if image_url:
                        product.image_url = image_url
                        
                    # Atualiza a descrição com o texto do site ou cria um fallback se estiver vazia
                    if description_text:
                        product.description = description_text
                    elif not product.description:
                        product.description = f"{name}\nRef: {sku}"
                        
                    product.save() # Salva as alterações sem apagar o que a consultora já preencheu
                    
                    # G. HISTÓRICO DE PREÇOS
                    if price > 0:
                        PriceHistory.objects.create(product=product, price=price)
                    
                    img_status = "🖼️" if image_url else "❌"
                    self.stdout.write(self.style.SUCCESS(f"✅ [{sku}] {name} | R$ {price} | {img_status}"))
                    
                except Exception as e:
                    self.stdout.write(self.style.ERROR(f"❌ Erro SKU {sku}: {e}"))
                    
        self.stdout.write(self.style.SUCCESS("✅ Crawler Finalizado!"))