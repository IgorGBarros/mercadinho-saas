# inventory/management/commands/cosmos_debug.py
from django.core.management.base import BaseCommand
from seleniumbase import SB
from bs4 import BeautifulSoup
import time

class Command(BaseCommand):
    help = 'Debug da estrutura do site Cosmos'
    
    def handle(self, *args, **options):
        self.stdout.write(self.style.WARNING("🔍 Analisando estrutura do Cosmos..."))
        
        with SB(uc=True, headless=False, page_load_strategy="eager") as sb:  # headless=False para ver
            try:
                # Ir para página inicial
                sb.open("https://cosmos.bluesoft.com.br/")
                sb.sleep(5)
                
                # Salvar screenshot
                sb.save_screenshot("cosmos_homepage.png")
                self.stdout.write("📸 Screenshot salvo: cosmos_homepage.png")
                
                # Salvar HTML completo
                with open("cosmos_homepage.html", "w", encoding="utf-8") as f:
                    f.write(sb.get_page_source())
                self.stdout.write("💾 HTML salvo: cosmos_homepage.html")
                
                # Analisar elementos de busca
                soup = BeautifulSoup(sb.get_page_source(), 'html.parser')
                
                # Procurar todos os inputs
                inputs = soup.find_all('input')
                self.stdout.write(f"\n📝 Encontrados {len(inputs)} campos input:")
                for i, inp in enumerate(inputs):
                    attrs = {k: v for k, v in inp.attrs.items()}
                    self.stdout.write(f"   {i+1}. {attrs}")
                
                # Procurar elementos com texto "buscar" ou "pesquisar"
                search_texts = soup.find_all(text=lambda text: text and any(word in text.lower() for word in ['buscar', 'pesquisar', 'search']))
                self.stdout.write(f"\n🔍 Elementos com texto de busca:")
                for text in search_texts[:10]:
                    parent = text.parent
                    self.stdout.write(f"   - '{text.strip()}' em <{parent.name}> {parent.attrs}")
                
                # Procurar por modals ou dropdowns
                modals = soup.find_all(['div'], class_=lambda x: x and any(word in x.lower() for word in ['modal', 'dropdown', 'search']))
                self.stdout.write(f"\n🎭 Possíveis modals/dropdowns:")
                for modal in modals:
                    self.stdout.write(f"   - <{modal.name}> class='{modal.get('class')}'")
                
                # Tentar clicar em elementos que podem abrir busca
                search_triggers = [
                    'button[class*="search"]',
                    'a[class*="search"]',
                    '[data-toggle="search"]',
                    '.search-icon',
                    '.fa-search',
                    'button[aria-label*="search"]',
                    'button[aria-label*="buscar"]'
                ]
                
                for trigger in search_triggers:
                    try:
                        if sb.is_element_present(trigger):
                            self.stdout.write(f"✅ Encontrado trigger: {trigger}")
                            sb.click(trigger)
                            sb.sleep(2)
                            
                            # Verificar se apareceu campo de busca
                            new_inputs = sb.find_elements('input')
                            self.stdout.write(f"   📝 Inputs após clique: {len(new_inputs)}")
                            
                            # Salvar estado após clique
                            sb.save_screenshot(f"cosmos_after_{trigger.replace('[', '_').replace(']', '_')}.png")
                            break
                    except Exception as e:
                        continue
                
                # Tentar busca direta por URL
                self.stdout.write("\n🔗 Testando URLs de busca direta:")
                test_urls = [
                    "https://cosmos.bluesoft.com.br/search?q=natura-11309",
                    "https://cosmos.bluesoft.com.br/pesquisar/?q=Ilía Secreto 50 ml",
                    "https://cosmos.bluesoft.com.br/produtos?search=natura-11309",
                    "https://cosmos.bluesoft.com.br/?q=natura-11309",
                    "https://cosmos.bluesoft.com.br/marcas/natura-11309",
                ]
                
                for url in test_urls:
                    try:
                        sb.open(url)
                        sb.sleep(3)
                        
                        current_url = sb.get_current_url()
                        title = sb.get_title()
                        
                        self.stdout.write(f"   📍 {url}")
                        self.stdout.write(f"      → {current_url}")
                        self.stdout.write(f"      📄 {title}")
                        
                        # Verificar se tem resultados
                        page_text = sb.get_page_source()
                        if 'natura' in page_text.lower():
                            self.stdout.write(f"      ✅ Contém 'natura'")
                            sb.save_screenshot(f"cosmos_search_result.png")
                            
                            with open("cosmos_search_result.html", "w", encoding="utf-8") as f:
                                f.write(page_text)
                        else:
                            self.stdout.write(f"      ❌ Não contém 'natura'")
                            
                    except Exception as e:
                        self.stdout.write(f"      ❌ Erro: {e}")
                
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"❌ Erro geral: {e}"))
        
        self.stdout.write(self.style.SUCCESS("🏁 Debug concluído! Verifique os arquivos gerados."))