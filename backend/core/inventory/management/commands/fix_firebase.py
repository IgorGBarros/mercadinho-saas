# fix_firebase.py
#
# Utilitário para converter o JSON de credenciais de service account do
# Firebase em uma única linha (com \n escapados), pronto para colar na
# variável de ambiente FIREBASE_CREDENTIALS do Render.
#
# ⚠️ SEGURANÇA: este arquivo JÁ TEVE uma chave privada real colada dentro
# (agora removida). NUNCA cole credenciais aqui — elas iriam para o Git e
# ficariam expostas no histórico para sempre. Em vez disso, salve o JSON
# original num arquivo local `firebase_credentials.json` (que está no
# .gitignore) e rode este script apontando para ele.
#
# Uso:
#   python fix_firebase.py firebase_credentials.json
#
import json
import re
import sys


def fix_firebase_json(json_str):
    """
    Corrige quebras de linha reais na private_key para \\n escapados,
    então minifica o JSON para uma linha.
    """
    pattern = r'("private_key"\s*:\s*")(.+?)("\s*[,}])'

    def escape_match(match):
        prefix = match.group(1)
        key_content = match.group(2)
        suffix = match.group(3)
        escaped = (key_content
            .replace('\\', '\\\\')
            .replace('\n', '\\n')
            .replace('\r', '\\r')
            .replace('\t', '\\t')
        )
        return prefix + escaped + suffix

    fixed = re.sub(pattern, escape_match, json_str, flags=re.DOTALL)
    # Valida e minifica
    parsed = json.loads(fixed)
    return json.dumps(parsed, separators=(',', ':'))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python fix_firebase.py <caminho_do_json>")
        print("Ex.: python fix_firebase.py firebase_credentials.json")
        print("\n⚠️ NUNCA cole a chave dentro deste arquivo — use um arquivo")
        print("   local (firebase_credentials.json) que esteja no .gitignore.")
        sys.exit(1)

    path = sys.argv[1]
    try:
        with open(path, "r", encoding="utf-8") as f:
            raw_json = f.read()
        result = fix_firebase_json(raw_json)
        print("✅ JSON corrigido e minificado!")
        print("📋 Copie a linha abaixo e cole no Render → FIREBASE_CREDENTIALS:\n")
        print(result)
        print(f"\n📏 Tamanho: {len(result)} caracteres")
    except FileNotFoundError:
        print(f"❌ Arquivo não encontrado: {path}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Erro: {e}")
        print("\n💡 Dica: verifique se o JSON original está completo e válido.")
        sys.exit(1)