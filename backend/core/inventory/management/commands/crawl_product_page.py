from django.core.management.base import BaseCommand
from django.utils import timezone
from inventory.models import Product, PriceHistory
from inventory.scraper import detect_category
import requests
from bs4 import BeautifulSoup
import time
import random
import re
import json
from decimal import Decimal

class Command(BaseCommand):
    help = 'Crawler Cirúrgico - Extração via JSON-LD da Página de Produto'

    def handle(self, *args, **kwargs):
        # Defina o intervalo de SKUs para varrer
        start_sku = 38854 
        end_sku = 38860 

        self.stdout.write(self.style.WARNING(f"🕷️ Iniciando Crawler de Página: SKUs {start_sku} a {end_sku}..."))

        session = requests.Session()

        for sku in range(start_sku, end_sku + 1):
            # URL Mágica: O site da Natura resolve qualquer slug antes do /NATBRA-
            # Usamos 'p' (placeholder) para o nome, o importante é o ID no final
            url = f"https://www.natura.com.br/p/p/NATBRA-{sku}"
            
            try:
                headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Referer': 'https://www.google.com/'
                }
                
                # Delay para não tomar Block
                time.sleep(random.uniform(2.0, 4.0))
                
                resp = session.get(url, headers=headers, timeout=15)
                
                # Se redirecionou para a home ou deu 404, o produto não existe
                if resp.status_code != 200 or "natura.com.br/p/" not in resp.url:
                    self.stdout.write(self.style.NOTICE(f"💨 SKU {sku} não existe ou página inválida."))
                    continue

                soup = BeautifulSoup(resp.text, 'html.parser')

                # --- ESTRATÉGIA 1: JSON-LD (Mina de Ouro) ---
                # No seu print aparece: <script id="product-schema.org" type="application/ld+json">
                script_json = soup.find('script', id='product-schema.org')
                
                product_data = {}
                
                if script_json:
                    try:
                        data = json.loads(script_json.string)
                        # O JSON geralmente tem: name, image, offers.price
                        product_data['name'] = data.get('name')
                        product_data['image'] = data.get('image')
                        product_data['description'] = data.get('description')
                        
                        # Preço pode estar dentro de 'offers'
                        offers = data.get('offers', {})
                        if isinstance(offers, dict):
                            product_data['price'] = offers.get('price')
                        elif isinstance(offers, list) and len(offers) > 0:
                            product_data['price'] = offers[0].get('price')
                            
                        print(f"🔍 JSON Detectado: {product_data.get('name')}")
                    except:
                        pass

                # --- ESTRATÉGIA 2: HTML FALLBACK (Se o JSON falhar) ---
                if not product_data.get('name'):
                    # Pega o H1 (Baseado no seu print)
                    h1 = soup.find('h1')
                    if h1:
                        product_data['name'] = h1.get_text().strip()

                if not product_data.get('price'):
                    # Tenta achar o preço no HTML usando Regex
                    # Procura por "R$ 116,90"
                    price_text = soup.find(string=re.compile(r'R\$\s*\d+'))
                    if price_text:
                        clean = re.sub(r'[^\d,]', '', price_text).replace(',', '.')
                        product_data['price'] = clean

                # --- PROCESSAMENTO DOS DADOS ---
                name = product_data.get('name', f"Produto {sku}")
                
                # Conversão de Preço
                try:
                    price = Decimal(str(product_data.get('price', '0.00')))
                except:
                    price = Decimal('0.00')

                # Extração de Volume (ml/g) do Nome
                volume = self.extract_volume(name)
                
                # Detecção de Categoria
                category = detect_category(name)
                
                # Custo Estimado
                cost_price = price * Decimal('0.70')

                # --- SALVAR NO BANCO ---
                if price > 0:
                    product, created = Product.objects.update_or_create(
                        natura_sku=str(sku),
                        defaults={
                            'name': name,
                            'category': category,
                            'sale_price': price,
                            'cost_price': cost_price,
                            'description': f"{name}\nRef: {sku}\nVolume: {volume}",
                            'last_checked_at': timezone.now(),
                            'last_checked_price': price
                        }
                    )
                    
                    PriceHistory.objects.create(product=product, price=price)
                    
                    status = "✨ Novo" if created else "🔄 Atualizado"
                    self.stdout.write(self.style.SUCCESS(f"{status}: [{sku}] {name} ({volume}) | R$ {price}"))
                else:
                    self.stdout.write(self.style.WARNING(f"⚠️ Nome achado, mas sem preço: {name}"))

            except Exception as e:
                self.stdout.write(self.style.ERROR(f"❌ Erro SKU {sku}: {e}"))

    def extract_volume(self, text):
        """Extrai 200ml, 100g do título"""
        if not text: return ""
        match = re.search(r'(\d+[\.,]?\d*)\s*(ml|g|kg|l)', text, re.IGNORECASE)
        if match:
            return f"{match.group(1)}{match.group(2).lower()}"
        return ""