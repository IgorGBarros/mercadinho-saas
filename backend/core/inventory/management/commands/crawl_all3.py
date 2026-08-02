from django.core.management.base import BaseCommand
from django.utils import timezone
from inventory.models import Product, PriceHistory
from seleniumbase import SB
from bs4 import BeautifulSoup
import re
from decimal import Decimal
import random

# 🚀 FUNÇÃO DE INTELIGÊNCIA: Define a categoria para QUALQUER marca
def detect_category(name):
    if not name: return "Geral"
    name_lower = name.lower()
    if any(x in name_lower for x in ['colônia', 'parfum', 'toilette', 'deo corporal', 'perfume']): return "Perfumaria"
    if any(x in name_lower for x in ['shampoo', 'condicionador', 'máscara', 'cabelo']): return "Cabelos"
    if any(x in name_lower for x in ['sabonete', 'hidratante', 'creme', 'óleo', 'desodorante', 'polpa']): return "Corpo e Banho"
    if any(x in name_lower for x in ['batom', 'base', 'corretivo', 'pó', 'rimel', 'delineador', 'palette', 'paleta', 'lápis', 'blush', 'iluminador']): return "Maquiagem"
    if any(x in name_lower for x in ['mamãe', 'bebê', 'infantil', 'criança', 'baby']): return "Infantil"
    if any(x in name_lower for x in ['barba', 'homem', 'masculino', 'men']): return "Homem"
    return "Geral"

class Command(BaseCommand):
    help = 'Super Crawler Intercalado: Natura, Avon, O Boticário, Eudora e Quem Disse Berenice'

    def handle(self, *args, **kwargs):
        # 🚀 CONFIGURAÇÃO DAS 6 MARCAS COM DOMÍNIOS EXATOS
        STORES = [
            {"brand": "Natura", "list_url": "https://www.natura.com.br/c/todos-produtos", "domain": "www.natura.com.br", "prefix": "NATBRA"},
            {"brand": "Avon", "list_url": "https://www.avon.com.br/c/todos-produtos", "domain": "www.avon.com.br", "prefix": "AVNBRA"},
            {"brand": "O Boticário", "list_url": "https://www.boticario.com.br/todos-os-produtos/", "domain": "www.boticario.com.br", "prefix": None},
            {"brand": "Quem Disse Berenice", "list_url": "https://www.quemdisseberenice.com.br/todos-produtos-site/", "domain": "www.quemdisseberenice.com.br", "prefix": None},
            {"brand": "Eudora", "list_url": "https://www.eudora.com.br/site-todo/", "domain": "www.eudora.com.br", "prefix": None},
            {
                "brand": "Mary Kay",
                "list_urls": [
                    "https://loja.marykay.com.br/cuidados-Faciais",
                    "https://loja.marykay.com.br/maquiagem",
                    "https://loja.marykay.com.br/cuidados-corporais",
                    "https://loja.marykay.com.br/fragrancias",
                    "https://loja.marykay.com.br/presentes",
                    "https://loja.marykay.com.br/promocoes"
                ],
                "domain": "loja.marykay.com.br", 
                "prefix": None
            }
        ]

        self.stdout.write(self.style.WARNING("🕷️ Iniciando Super Crawler Intercalado (Anti-Bloqueio)..."))
        
        empty_pages = {store["brand"]: 0 for store in STORES}
        
        MAX_PAGES = 10
        with SB(uc=True, headless=True, page_load_strategy="eager") as sb:
            
            # 🚀 CORREÇÃO CRÍTICA DO TIMEOUT: Usando o atributo correto do WebDriver
            sb.driver.set_page_load_timeout(25) 
            
            page = 1
            while page <= MAX_PAGES:
                self.stdout.write(self.style.WARNING(f"\n--- 📂 LENDO PÁGINA {page} DE {MAX_PAGES} DE TODAS AS MARCAS ---"))
                discovered_links = []
                
                # ==========================================
                # 1. PASSO DE DESCOBERTA
                # ==========================================
                for store in STORES:
                    if empty_pages[store['brand']] >= 3:
                        continue
                    
                    urls_to_visit = store.get('list_urls') or [store.get('list_url')]
                    
                    for base_url in urls_to_visit:
                        if not base_url: continue
                        
                        url = f"{base_url}?page={page}"
                        if len(urls_to_visit) > 1:
                            self.stdout.write(f"🔍 Vasculhando: {store['brand']} ({base_url.split('/')[-1]})...")
                        else:
                            self.stdout.write(f"🔍 Vasculhando: {store['brand']}...")
                        
                        try:
                            sb.open(url)
                            sb.wait_for_element("body", timeout=15)
                            sb.sleep(1)
                            
                            sb.execute_script("if(document.body){window.scrollTo(0, document.body.scrollHeight * 0.3);}")
                            sb.sleep(1)
                            sb.execute_script("if(document.body){window.scrollTo(0, document.body.scrollHeight * 0.8);}")
                            sb.sleep(2)
                            
                            if "Access Denied" in sb.get_page_title():
                                self.stdout.write(self.style.ERROR(f"⛔ Bloqueio na {store['brand']}! Pulando..."))
                                continue
                                
                            soup = BeautifulSoup(sb.get_page_source(), 'html.parser')
                            links_loja = []
                            
                            if store['brand'] in ["Natura", "Avon"]:
                                product_cards = soup.find_all('a', href=re.compile(rf"{store['prefix']}-\d+"))
                                for a in product_cards:
                                    href = a.get('href')
                                    if href and href not in [link['url'] for link in links_loja]:
                                        full_url = href if href.startswith('http') else f"https://{store['domain']}{href if href.startswith('/') else '/' + href}"
                                        links_loja.append({"url": full_url, "brand": store['brand'], "prefix": store['prefix']})
                            else:
                                product_cards = soup.find_all('a', href=True)
                                for a in product_cards:
                                    href = a.get('href')
                                    if not href or href == '/' or href.startswith('#') or 'javascript' in href: 
                                        continue
                                        
                                    is_product = False
                                    if store['brand'] == "Mary Kay":
                                        if len(href) > 15 and 'login' not in href and 'account' not in href:
                                            is_product = True
                                    else:
                                        if '/p' in href:
                                            is_product = True
                                            
                                    if is_product:
                                        full_url = href if href.startswith('http') else f"https://{store['domain']}{href if href.startswith('/') else '/' + href}"
                                        if full_url not in [link['url'] for link in links_loja]:
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
                        sb.sleep(random.uniform(2.5, 4.5)) 
                        
                        products_to_save = []
                        
                        # ----------------------------------------------------
                        # LÓGICA: NATURA / AVON
                        # ----------------------------------------------------
                        if brand in ["Natura", "Avon"]:
                            soup = BeautifulSoup(sb.get_page_source(), 'html.parser')
                            prefix = item.get("prefix")
                            sku, name, price, image_url, description_text = None, None, Decimal('0.00'), None, None
                            
                            sku_match = re.search(rf'{prefix}-(\d+)', product_url)
                            if sku_match: sku = sku_match.group(1)
                            
                            title_tag = soup.find('h1')
                            if not title_tag:
                                p_tag = soup.find(string=re.compile(rf'cod\. {prefix}-', re.I))
                                if p_tag and p_tag.parent.find_previous_sibling('p'): name = p_tag.parent.find_previous_sibling('p').text.strip()
                            else: name = title_tag.text.strip()
                            
                            price_tag = soup.find(['div', 'span'], id="product-price")
                            if price_tag:
                                aria_label = price_tag.get('aria-label', '')
                                match = re.search(r'(\d{1,3}(\.\d{3})*,\d{2})', aria_label) or re.search(r'(\d{1,3}(\.\d{3})*,\d{2})', price_tag.text)
                                if match: price = Decimal(match.group(1).replace('.', '').replace(',', '.'))
                                
                            img_tag = soup.find('img', src=re.compile(r'production\.na01\.natura\.com|avon'))
                            if img_tag and img_tag.has_attr('src'): image_url = img_tag.get('src').split('?')[0]
                                
                            desc_tag = soup.find('div', id=re.compile(r'description', re.I)) or soup.find('div', class_=re.compile(r'description', re.I))
                            if desc_tag: description_text = desc_tag.get_text(separator='\n', strip=True)

                            if sku:
                                products_to_save.append({"sku": sku, "name": name, "price": price, "image_url": image_url, "desc": description_text})

                        # ----------------------------------------------------
                        # LÓGICA: MARY KAY
                        # ----------------------------------------------------
                        elif brand == "Mary Kay":
                            sb.wait_for_element('body', timeout=15)
                            sb.sleep(2)
                            
                            num_variations = sb.execute_script("return document.querySelectorAll('div[role=\"button\"][class*=\"skuSelectorItem\"]').length;")
                            
                            if num_variations > 0:
                                for i in range(num_variations):
                                    sb.execute_script(f"document.querySelectorAll('div[role=\"button\"][class*=\"skuSelectorItem\"]')[{i}].click();")
                                    sb.sleep(1.5) 
                                    
                                    soup = BeautifulSoup(sb.get_page_source(), 'html.parser')
                                    
                                    sku_tag = soup.find(class_=re.compile(r'product-identifier__value'))
                                    sku = sku_tag.text.strip() if sku_tag else None
                                    if not sku: continue

                                    base_name_tag = soup.find(class_=re.compile(r'productBrand'))
                                    base_name = base_name_tag.text.strip() if base_name_tag else "Produto Mary Kay"
                                    
                                    color_tag = soup.find(class_=re.compile(r'skuSelectorSelectorImageValue'))
                                    color_name = color_tag.text.strip() if color_tag else ""
                                    
                                    full_name = f"{base_name} - {color_name}" if color_name else base_name
                                    
                                    price = Decimal('0.00')
                                    int_tag = soup.find(class_=re.compile(r'currencyInteger'))
                                    frac_tag = soup.find(class_=re.compile(r'currencyFraction'))
                                    if int_tag and frac_tag:
                                        price = Decimal(f"{int_tag.text.strip()}.{frac_tag.text.strip()}")
                                        
                                    image_url = None
                                    img_tag = soup.find('img', class_=re.compile(r'productImageTag--main'))
                                    if img_tag and img_tag.has_attr('src'):
                                        image_url = img_tag['src'].split('?')[0] 
                                        
                                    products_to_save.append({"sku": sku, "name": full_name, "price": price, "image_url": image_url, "desc": f"Descoberto na Mary Kay - Cor: {color_name}"})
                            else:
                                soup = BeautifulSoup(sb.get_page_source(), 'html.parser')
                                sku_tag = soup.find(class_=re.compile(r'product-identifier__value'))
                                sku = sku_tag.text.strip() if sku_tag else None
                                
                                if sku:
                                    name_tag = soup.find(class_=re.compile(r'productBrand'))
                                    name = name_tag.text.strip() if name_tag else f"Produto Mary Kay - {sku}"
                                    
                                    price = Decimal('0.00')
                                    int_tag = soup.find(class_=re.compile(r'currencyInteger'))
                                    frac_tag = soup.find(class_=re.compile(r'currencyFraction'))
                                    if int_tag and frac_tag:
                                        price = Decimal(f"{int_tag.text.strip()}.{frac_tag.text.strip()}")
                                        
                                    image_url = None
                                    img_tag = soup.find('img', class_=re.compile(r'productImageTag--main'))
                                    if img_tag and img_tag.has_attr('src'):
                                        image_url = img_tag['src'].split('?')[0]
                                    
                                    products_to_save.append({"sku": sku, "name": name, "price": price, "image_url": image_url, "desc": "Descoberto na Mary Kay"})

                        # ----------------------------------------------------
                        # LÓGICA: GRUPO BOTICÁRIO
                        # ----------------------------------------------------
                        else:
                            soup = BeautifulSoup(sb.get_page_source(), 'html.parser')
                            sku, name, price, image_url, description_text = None, None, Decimal('0.00'), None, None
                            
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
                                if raw_img and not raw_img.startswith('data:image'): image_url = raw_img
                                    
                            desc_tag = soup.find('div', class_=re.compile(r'product-description'))
                            if desc_tag: description_text = desc_tag.get_text(separator='\n', strip=True)

                            if sku:
                                products_to_save.append({"sku": sku, "name": name, "price": price, "image_url": image_url, "desc": description_text})

                        # ----------------------------------------------------
                        # SALVAMENTO SEGURO
                        # ----------------------------------------------------
                        for p_data in products_to_save:
                            d_sku = p_data['sku']
                            d_name = p_data['name'] or f"Produto {brand} - {d_sku}"
                            d_price = p_data['price']
                            d_image = p_data['image_url']
                            d_desc = p_data['desc']
                            
                            # 🚀 TRAVA DE SEGURANÇA 2: Hard Block contra lixo
                            if "Access Denied" in d_name or "Access Denied" in str(d_desc):
                                continue
                            
                            smart_category = detect_category(d_name)
                            
                            product, created = Product.objects.get_or_create(
                                natura_sku=str(d_sku),
                                defaults={
                                    'name': d_name[:255],
                                    'brand': brand,                 
                                    'category': smart_category,     
                                    'official_price': d_price,
                                    'bar_code': None, 
                                    'image_url': d_image,
                                    'description': d_desc or f"Descoberto no site {brand}",
                                    'last_checked_at': timezone.now(),
                                    'last_checked_price': d_price
                                }
                            )
                            
                            if not created:
                                product.name = d_name[:255]
                                product.brand = brand               
                                product.category = smart_category   
                                product.official_price = d_price
                                product.last_checked_at = timezone.now()
                                product.last_checked_price = d_price
                                if d_image: product.image_url = d_image
                                if d_desc: product.description = d_desc
                                product.save()
                                
                            if d_price > 0:
                                PriceHistory.objects.create(product=product, price=d_price)
                                
                            status = "✨" if created else "🔄"
                            img_status = "🖼️" if d_image else "❌"
                            self.stdout.write(self.style.SUCCESS(f"{status} [{brand}] {d_sku} ({smart_category}) - {d_name[:25]}... | R$ {d_price} | {img_status}"))

                    except Exception as e:
                        # Falha silenciosa no produto para não derrubar o bot
                        self.stdout.write(self.style.ERROR(f"❌ Erro ao ler {brand} - {product_url}: {e}"))
                        sb.sleep(1.5)

                page += 1
                
        self.stdout.write(self.style.SUCCESS("🎉 Super Varredura Intercalada (6 Marcas) Finalizada com Sucesso!"))