from django.core.management.base import BaseCommand
from django.utils import timezone
from inventory.models import Product
from inventory.scraper import detect_category
from seleniumbase import SB
from bs4 import BeautifulSoup
import re
import random

class Command(BaseCommand):
    help = 'Robô Faxineiro: Corrige produtos que foram salvos como "Access Denied"'

    def handle(self, *args, **kwargs):
        # 1. Encontra todos os produtos corrompidos
        lixo = Product.objects.filter(name__icontains="Access Denied")
        total = lixo.count()
        
        if total == 0:
            self.stdout.write(self.style.SUCCESS("🎉 Nenhum produto 'Access Denied' encontrado! O banco está limpo."))
            return
            
        self.stdout.write(self.style.WARNING(f"🧹 Iniciando faxina em {total} produtos corrompidos..."))

        def get_brand_and_url(sku, category):
            if sku.startswith("NATBRA"):
                return "Natura", f"https://www.natura.com.br/p/x/{sku}", "NATBRA"
            elif sku.startswith("AVNBRA"):
                return "Avon", f"https://www.avon.com.br/p/x/{sku}", "AVNBRA"
            elif category == "Eudora":
                return "Eudora", f"https://www.eudora.com.br/p/x/{sku}", None
            elif category == "Quem Disse Berenice":
                return "Quem Disse Berenice", f"https://www.quemdisseberenice.com.br/p/x/{sku}", None
            else:
                return "O Boticário", f"https://www.boticario.com.br/p/x/{sku}", None

        with SB(uc=True, headless=True, page_load_strategy="eager") as sb:
            sb.driver.set_page_load_timeout(20)

            for product in lixo:
                if not product.natura_sku:
                    product.name = f"Produto Desconhecido (Ref: {product.id})"
                    product.save()
                    self.stdout.write(self.style.NOTICE(f"⚠️ Produto sem SKU renomeado para Desconhecido."))
                    continue

                brand, url, prefix = get_brand_and_url(product.natura_sku, product.category)
                self.stdout.write(f"🔍 Consertando SKU {product.natura_sku} ({brand})...")

                try:
                    sb.open(url)
                    sb.sleep(random.uniform(2.5, 4.5))
                    
                    if "Access Denied" in sb.get_page_title() or "Access Denied" in sb.get_page_source():
                        self.stdout.write(self.style.ERROR(f"⛔ Continua bloqueado. Tentando novamente mais tarde."))
                        continue
                        
                    soup = BeautifulSoup(sb.get_page_source(), 'html.parser')
                    name = None
                    description_text = None

                    if brand in ["Natura", "Avon"]:
                        title_tag = soup.find('h1')
                        if title_tag:
                            name = title_tag.text.strip()
                        elif prefix:
                            p_tag = soup.find(string=re.compile(rf'cod\. {prefix}-', re.I))
                            if p_tag and p_tag.parent.find_previous_sibling('p'): 
                                name = p_tag.parent.find_previous_sibling('p').text.strip()
                                
                        desc_tag = soup.find('div', id=re.compile(r'description', re.I)) or soup.find('div', class_=re.compile(r'description', re.I))
                        if desc_tag: description_text = desc_tag.get_text(separator='\n', strip=True)

                    else:
                        name_tag = soup.find('h1')
                        if name_tag: name = name_tag.text.strip()
                        
                        desc_tag = soup.find('div', class_=re.compile(r'product-description'))
                        if desc_tag: description_text = desc_tag.get_text(separator='\n', strip=True)

                    if name and "Access Denied" not in name:
                        product.name = name[:255]
                        product.category = detect_category(name)
                        if description_text and "Access Denied" not in description_text:
                            product.description = description_text
                        product.last_checked_at = timezone.now()
                        product.save()
                        self.stdout.write(self.style.SUCCESS(f"   ✅ Consertado: {name}"))
                    else:
                        self.stdout.write(self.style.ERROR(f"   ❌ Não foi possível achar o nome real na página."))

                except Exception as e:
                    self.stdout.write(self.style.ERROR(f"❌ Erro de conexão: {e}"))
                    sb.sleep(2)

        self.stdout.write(self.style.SUCCESS("🎉 Faxina finalizada!"))