"""
WSGI config for core project.
"""
import os
import sys
import time
from django.core.wsgi import get_wsgi_application

# ✅ Log de inicialização COM FLUSH (crítico para Render capturar)
start_time = time.time()
print(f"🚀 WSGI starting - PID: {os.getpid()}", flush=True, file=sys.stderr)
print(f"🔍 Python: {sys.version}", flush=True, file=sys.stderr)
print(f"🔍 PORT: {os.environ.get('PORT', 'NOT SET')}", flush=True, file=sys.stderr)
print(f"🔍 RENDER: {os.environ.get('RENDER', 'NOT SET')}", flush=True, file=sys.stderr)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

try:
    print("📦 Loading Django...", flush=True, file=sys.stderr)
    application = get_wsgi_application()
    load_time = time.time() - start_time
    print(f"✅ Django loaded in {load_time:.2f}s", flush=True, file=sys.stderr)
    
    # ✅ Teste rápido de conexão com banco (apenas em DEBUG)
    if os.environ.get('DEBUG', 'False').lower() == 'true':
        try:
            from django.db import connection
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
            print("✅ Database OK", flush=True, file=sys.stderr)
        except Exception as e:
            print(f"⚠️ DB warning: {e}", flush=True, file=sys.stderr)
    
except Exception as e:
    print(f"❌ Failed to load Django: {e}", flush=True, file=sys.stderr)
    import traceback
    traceback.print_exc(file=sys.stderr)
    sys.stderr.flush()
    raise

print(f"🎯 WSGI ready - Total: {time.time() - start_time:.2f}s", flush=True, file=sys.stderr)