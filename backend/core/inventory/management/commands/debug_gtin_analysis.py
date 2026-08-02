# inventory/management/commands/debug_gtin_analysis.py
from django.core.management.base import BaseCommand
from inventory.models import Product
from seleniumbase import SB
from bs4 import BeautifulSoup
import re
import unicodedata
from difflib import SequenceMatcher

class Command(BaseCommand):
    help = 'Debug detalhado da análise de GTINs'
    
    def add_arguments(self, parser):
        parser.add_argument('--product-sku', type=str, required=True, help='SKU do produto')
    
    def handle(self, *args, **options):
        product_sku = options['product_sku']
        
        try:
            product = Product.objects.get(natura_sku=product_sku)
        except Product.DoesNotExist:
            self.stdout.write(self.style.ERROR(f"❌ Produto {product_sku} não encontrado"))
            return
        
        self.stdout.write(f"🔍 Análise detalhada: {product.natura_sku} - {product.name}")
        
        # Lista dos GTINs que você encontrou
        gtins_found = [
            '7900000658962', '7908132215077', '7898501062237', '7908371671627', 
            '7908371671610', '7899563271667', '7899563271650', '7898506883851',
            '7898506883844', '7898506883868', '7909883022532', '7899563278994'
        ]
        
        # Vamos analisar cada GTIN individualmente
        with SB(uc=True, headless=False, page_load_strategy="eager") as sb:
            # Fazer a busca
            sb.open("https://cosmos.bluesoft.com.br/")
            sb.sleep(3)
            
            search_term = "Una Blush"
            sb.click("#search-input")
            sb.clear("#search-input")
            sb.type("#search-input", search_term)
            sb.press_keys("#search-input", '\n')
            sb.sleep(5)
            
            page_source = sb.get_page_source()
            soup = BeautifulSoup(page_source, 'html.parser')
            
            self.stdout.write(f"\n📊 ANÁLISE DETALHADA DOS GTINs:")
            self.stdout.write("="*80)
            
            for i, gtin in enumerate(gtins_found[:10], 1):  # Analisar primeiros 10
                self.stdout.write(f"\n🔢 {i}. GTIN: {gtin}")
                
                # Encontrar onde este GTIN aparece na página
                gtin_elements = soup.find_all(text=re.compile(gtin))
                
                for j, elem_text in enumerate(gtin_elements):
                    parent = elem_text.parent
                    if not parent:
                        continue
                    
                    # Pegar contexto mais amplo
                    context_text = ""
                    
                    # Pegar elemento pai e 3 níveis acima
                    current = parent
                    for level in range(4):
                        if current:
                            context_text += " " + current.get_text()
                            current = current.parent
                        else:
                            break
                    
                    # Limpar e mostrar contexto
                    context_clean = re.sub(r'\s+', ' ', context_text).strip()
                    
                    if len(context_clean) > 50:
                        self.stdout.write(f"   📝 Contexto {j+1}: {context_clean[:200]}...")
                        
                        # Verificar se contém palavras do produto
                        product_words = ['una', 'blush', '75', 'ml', 'natura']
                        context_lower = context_clean.lower()
                        
                        matches = [word for word in product_words if word in context_lower]
                        if matches:
                            self.stdout.write(f"   ✅ Palavras encontradas: {matches}")
                        
                        # Verificar se é produto Natura
                        if 'natura' in context_lower:
                            self.stdout.write(f"   🏷️ MARCA: Natura confirmada")
                        
                        # Calcular similaridade
                        similarity = SequenceMatcher(None, 
                                                   product.name.lower(),
                                                   context_clean.lower()).ratio()
                        self.stdout.write(f"   📊 Similaridade: {similarity:.3f}")
                        
                        if similarity > 0.3:
                            self.stdout.write(f"   🎯 CANDIDATO FORTE!")
                
                self.stdout.write("-" * 40)