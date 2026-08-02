# backend/core/inventory/firebase_utils.py
"""
Inicialização do Firebase Admin SDK — compartilhada entre o login da
consultora (FirebaseLoginView) e o login social do desenvolvedor
(apps/developers). Antes vivia só dentro de FirebaseLoginView; extraído
pra cá pra não ter a mesma lógica (e a mesma correção de caracteres de
controle no JSON de credenciais) duplicada em dois lugares — um conserto
feito num não valeria pro outro.
"""
import json
import logging
import os

import firebase_admin
from firebase_admin import credentials

logger = logging.getLogger(__name__)


def init_firebase_safe() -> bool:
    """
    Inicializa Firebase com correção agressiva de caracteres.
    Retorna True se sucesso, False se falhou (NUNCA lança exceção).
    """
    try:
        if firebase_admin._apps:
            return True

        creds_json = os.environ.get("FIREBASE_CREDENTIALS")
        if not creds_json:
            logger.error("❌ FIREBASE_CREDENTIALS não configurada")
            return False

        # 🔧 CORREÇÃO AGRESSIVA DE CARACTERES
        creds_json = creds_json.replace('\\\\', '\x00BSLASH\x00')
        creds_json = (creds_json
            .replace('\n', '\\n')
            .replace('\r', '\\r')
            .replace('\t', '\\t')
            .replace('\b', '\\b')
            .replace('\f', '\\f')
        )
        creds_json = creds_json.replace('\x00BSLASH\x00', '\\\\')

        creds_dict = json.loads(creds_json)

        required = ['type', 'project_id', 'private_key', 'client_email']
        missing = [k for k in required if k not in creds_dict]
        if missing:
            logger.error(f"❌ Firebase JSON missing: {missing}")
            return False

        cred = credentials.Certificate(creds_dict)
        firebase_admin.initialize_app(cred, {'projectId': creds_dict.get('project_id')})
        logger.info("✅ Firebase inicializado com sucesso")
        return True

    except json.JSONDecodeError as e:
        pos = getattr(e, 'pos', '?')
        logger.error(f"❌ JSON decode error at pos {pos}: {str(e)[:150]}")
        return False
    except Exception as e:
        logger.error(f"❌ Firebase init error: {type(e).__name__}: {str(e)[:150]}")
        return False
