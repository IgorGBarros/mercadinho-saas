from django.core.management.base import BaseCommand
from django.utils import timezone
from inventory.models import Product, PriceHistory
from seleniumbase import SB
from bs4 import BeautifulSoup
import re
from decimal import Decimal
import random

# 🚀 FUNÇÃO DE INTELIGÊNCIA MOVIDA PARA DENTRO DO SCRIPT
def detect_category(name):
    """
    Define a categoria baseada em palavras-chave no nome do produto.
    """
    if not name:
        return "Geral"
        
    name_lower = name.lower()
    
    if any(x in name_lower for x in ['colônia', 'parfum', 'toilette', 'deo corporal', 'perfume']): return "Perfumaria"
    if any(x in name_lower for x in ['shampoo', 'condicionador', 'máscara', 'cabelo']): return "Cabelos"
    if any(x in name_lower for x in ['sabonete', 'hidratante', 'creme', 'óleo', 'desodorante', 'polpa']): return "Corpo e Banho"
    if any(x in name_lower for x in ['batom', 'base', 'corretivo', 'pó', 'rimel', 'delineador']): return "Maquiagem"
    if any(x in name_lower for x in ['mamãe', 'bebê', 'infantil', 'criança']): return "Infantil"
    if any(x in name_lower for x in ['barba', 'homem', 'masculino']): return "Homem"
        
    return "Geral"


class Command(BaseCommand):
    help = 'Super Crawler Intercalado: Natura, Avon, O Boticário, Eudora e Quem Disse Berenice'

    def handle(self, *args, **kwargs):
        # 🚀 CONFIGURAÇÃO DAS 5 MARCAS
        STORES = [
            {
                "brand": "Natura",
                "list_url": "https://www.natura.com.br/c/todos-produtos",
                "domain": "natura.com.br",
                "prefix": "NATBRA"
            },
            {
                "brand": "Avon",
                "list_url": "https://www.avon.com.br/c/todos-produtos",
                "domain": "avon.com.br",
                "prefix": "AVNBRA"
            },
            {
                "brand": "O Boticário",
                "list_url": "https://www.boticario.com.br/todos-os-produtos/",
                "domain": "boticario.com.br",
                "prefix": None
            },
            {
                "brand": "Quem Disse Berenice",
                "list_url": "https://www.quemdisseberenice.com.br/todos-produtos-site/",
                "domain": "quemdisseberenice.com.br",
                "prefix": None
            },
            {
                "brand": "Eudora",
                "list_url": "https://www.eudora.com.br/site-todo/",
                "domain": "eudora.com.br",
                "prefix": None
            }
        ]

        self.stdout.write(self.style.WARNING("🕷️ Iniciando Super Crawler Intercalado (Anti-Bloqueio)..."))

        empty_pages = {store["brand"]: 0 for store in STORES}

        with SB(uc=True, headless=True) as sb:
            page = 1

            while True:
                self.stdout.write(self.style.WARNING(f"\n--- 📂 LENDO PÁGINA {page} DE TODAS AS MARCAS ---"))
                discovered_links = []

                # ==========================================
                # 1. PASSO DE DESCOBERTA (Pega os links)
                # ==========================================
                for store in STORES:
                    if empty_pages[store['brand']] >= 3:
                        continue

                    url = f"{store['list_url']}?page={page}"
                    self.stdout.write(f"🔍 Vasculhando: {store['brand']}...")
                    
                    try:
                        sb.open(url)
                        sb.execute_script("window.scrollTo(0, document.body.scrollHeight * 0.3);")
                        sb.sleep(1)
                        sb.execute_script("window.scrollTo(0, document.body.scrollHeight * 0.8);")
                        sb.sleep(2)

                        if "Access Denied" in sb.get_page_title():
                            self.stdout.write(self.style.ERROR(f"⛔ Bloqueio na {store['brand']}! Pulando..."))
                            continue

                        soup = BeautifulSoup(sb.get_page_source(), 'html.parser')
                        links_loja = []

                        # Regra de extração de links
                        if store['brand'] in ["Natura", "Avon"]:
                            product_cards = soup.find_all('a', href=re.compile(rf"{store['prefix']}-\d+"))
                            for a in product_cards:
                                href = a.get('href')
                                if href and href not in [link['url'] for link in links_loja]:
                                    full_url = href if href.startswith('http') else f"https://www.{store['domain']}{href}"
                                    links_loja.append({"url": full_url, "brand": store['brand'], "prefix": store['prefix']})
                        else:
                            product_cards = soup.find_all('a', href=re.compile(rf"{store['domain']}/.*"))
                            for a in product_cards:
                                href = a.get('href')
                                if href and '/p' in href and href not in [link['url'] for link in links_loja]:
                                    full_url = href if href.startswith('http') else f"https://www.{store['domain']}{href}"
                                    links_loja.append({"url": full_url, "brand": store['brand']})
                        
                        if not links_loja:
                            empty_pages[store['brand']] += 1
                        else:
                            empty_pages[store['brand']] = 0
                            discovered_links.extend(links_loja)
                            self.stdout.write(self.style.SUCCESS(f"   ✅ Encontrados {len(links_loja)} links em {store['brand']}"))
                            
                    except Exception as e:
                        self.stdout.write(self.style.ERROR(f"❌ Erro ao listar {store['brand']}: {e}"))

                if all(count >= 3 for count in empty_pages.values()):
                    self.stdout.write(self.style.SUCCESS("🏁 Fim das páginas encontrado em todos os catálogos."))
                    break

                if not discovered_links:
                    page += 1
                    continue

                # ==========================================
                # 2. PASSO DE ENRIQUECIMENTO
                # ==========================================
                random.shuffle(discovered_links)
                self.stdout.write(self.style.WARNING(f"\n🛒 Iniciando extração profunda de {len(discovered_links)} produtos embaralhados..."))
                
                for item in discovered_links:
                    product_url = item["url"]
                    brand = item["brand"]
                    
                    try:
                        sb.open(product_url)
                        sb.sleep(random.uniform(3.0, 5.5)) 
                        
                        soup = BeautifulSoup(sb.get_page_source(), 'html.parser')
                        
                        sku = None
                        name = None
                        price = Decimal('0.00')
                        image_url = None
                        description_text = None

                        if brand in ["Natura", "Avon"]:
                            prefix = item.get("prefix")
                            sku_match = re.search(rf'{prefix}-(\d+)', product_url)
                            if sku_match: sku = sku_match.group(1)
                            
                            title_tag = soup.find('h1')
                            if not title_tag:
                                p_tag = soup.find(string=re.compile(rf'cod\. {prefix}-', re.I))
                                if p_tag and p_tag.parent.find_previous_sibling('p'):
                                    name = p_tag.parent.find_previous_sibling('p').text.strip()
                            else:
                                name = title_tag.text.strip()
                            
                            price_tag = soup.find(['div', 'span'], id="product-price")
                            if price_tag:
                                aria_label = price_tag.get('aria-label', '')
                                match = re.search(r'(\d{1,3}(\.\d{3})*,\d{2})', aria_label)
                                if not match:
                                    match = re.search(r'(\d{1,3}(\.\d{3})*,\d{2})', price_tag.text)
                                if match: 
                                    price = Decimal(match.group(1).replace('.', '').replace(',', '.'))
                                
                            img_tag = soup.find('img', src=re.compile(r'production\.na01\.natura\.com|avon'))
                            if img_tag and img_tag.has_attr('src'):
                                image_url = img_tag.get('src').split('?')[0]
                                
                            desc_tag = soup.find('div', id=re.compile(r'description', re.I)) or soup.find('div', class_=re.compile(r'description', re.I))
                            if desc_tag: description_text = desc_tag.get_text(separator='\n', strip=True)

                        else:
                            sku_div = soup.find('div', class_=re.compile(r'product-sku'))
                            if sku_div:
                                raw_sku = sku_div.text.replace('Cod:', '').replace('"', '').strip()
                                if raw_sku: sku = raw_sku
                                
                            name_tag = soup.find('h1')
                            if name_tag: name = name_tag.text.strip()
                            
                            price_div = soup.find('div', class_=re.compile(r'nproduct-price-value'))
                            if price_div and price_div.has_attr('content'):
                                try: price = Decimal(price_div['content'])
                                except: pass
                                
                            img_tag = soup.find('img', class_=re.compile(r'product-image'))
                            if img_tag:
                                raw_img = img_tag.get('data-zoom-image') or img_tag.get('data-src') or img_tag.get('src')
                                if raw_img and not raw_img.startswith('data:image'):
                                    image_url = raw_img
                                    
                            desc_tag = soup.find('div', class_=re.compile(r'product-description'))
                            if desc_tag: description_text = desc_tag.get_text(separator='\n', strip=True)

                        if not sku:
                            continue 
                        if not name:
                            name = f"Produto {brand} - {sku}"

                        # 🚀 SALVAMENTO NO BANCO DE DADOS (COM BRAND E CATEGORY INTELIGENTE)
                        product, created = Product.objects.get_or_create(
                            natura_sku=str(sku),
                            defaults={
                                'name': name[:255],
                                'brand': brand,                        # 🚀 A MARCA
                                'category': detect_category(name),     # 🚀 A CATEGORIA INTELIGENTE
                                'official_price': price,
                                'bar_code': None,
                                'image_url': image_url,
                                'description': description_text or f"Descoberto no site {brand}",
                                'last_checked_at': timezone.now(),
                                'last_checked_price': price
                            }
                        )

                        if not created:
                            product.name = name[:255]
                            product.brand = brand                      # 🚀 ATUALIZA A MARCA
                            product.category = detect_category(name)   # 🚀 ATUALIZA A CATEGORIA
                            product.official_price = price
                            product.last_checked_at = timezone.now()
                            product.last_checked_price = price
                            if image_url: product.image_url = image_url
                            if description_text: product.description = description_text
                            product.save()

                        if price > 0:
                            PriceHistory.objects.create(product=product, price=price)

                        status = "✨" if created else "🔄"
                        img_status = "🖼️" if image_url else "❌"
                        
                        # Mostra a Marca e a Categoria nova no log!
                        self.stdout.write(self.style.SUCCESS(f"{status} [{brand}] {sku} ({product.category}) - {name[:25]}... | R$ {price} {img_status}"))

                    except Exception as e:
                        self.stdout.write(self.style.ERROR(f"❌ Erro ao ler {brand} - {product_url}: {e}"))
                        sb.sleep(3)

                page += 1
                
        self.stdout.write(self.style.SUCCESS("🎉 Super Varredura Intercalada (5 Marcas) Finalizada!"))