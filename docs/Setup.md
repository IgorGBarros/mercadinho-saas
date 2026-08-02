Perfeito, excelente direção. 🎯  
A partir de agora vamos **construir o ambiente completo de desenvolvimento** e **documentar tudo passo a passo**, garantindo que você tenha um **guia técnico reutilizável** para o projeto *Natura Inventory*.

🧾 **Importante:**  
Todo comando, biblioteca ou estrutura que criarmos será registrado e formatado para ser incluído posteriormente na **documentação oficial do projeto**.  
O guia será compatível com **Windows 11 (PowerShell/CMD)**.

---

## 📘 CAPÍTULO 1 — Configuração Inicial do Projeto

### 🎯 Objetivo
Criar o monorepo local com estrutura padrão:
```
natura_inventory/
├── backend/    # Django + PostgreSQL + LangChain
├── frontend/   # React + Vite + TypeScript + Tailwind
└── docs/       # Documentação central
```

---

### 📋 Pré‑requisitos (Windows 11)

Antes de tudo, confirmamos as ferramentas básicas.

```powershell
# Verificar Python
python --version

# Verificar Node/NPM
node --version
npm --version

# Verificar Git
git --version
```

Se faltar alguma, instale:
- **Python:** https://www.python.org/downloads/windows/
- **Node.js:** https://nodejs.org/en/download/
- **Git:** https://git-scm.com/download/win

---

### 🛠️ Criar a pasta raiz do projeto

```powershell
mkdir natura_inventory
cd natura_inventory
```

Este comando cria a pasta principal onde ficará backend, frontend e docs.

📘 **Adicionar à documentação:**
> **Passo 1:** Criar diretório base `natura_inventory` para agrupar módulos backend e frontend.

---

## 📘 CAPÍTULO 2 — Backend (Django + DRF + LangChain + PostgreSQL)

### 🔹 Criar ambiente virtual

```powershell
python -m venv venv
venv\Scripts\activate
```

📘 **Documentação:**
> **Passo 2:** Criar e ativar ambiente virtual Python (Windows usa `venv\Scripts\activate`).

---

### 🔹 Instalar dependências backend

```powershell
pip install django djangorestframework psycopg2-binary langchain langchain-community
```

📘 **Documentação:**
> **Passo 3:** Instala pacotes essenciais para o backend: Django, DRF, Postgres connector e LangChain.

---

### 🔹 Criar projeto Django

```powershell
django-admin startproject core backend
cd backend
python manage.py startapp inventory
python manage.py startapp ai
```

📘 **Documentação:**
> **Passo 4:** Inicia projeto Django “core” e apps: `inventory` (estoque) e `ai` (integração LLM).

---

### 🔹 Adicionar arquivos extras
```powershell
cd ai
echo. > services.py
echo. > prompts.py
echo. > urls.py
cd ../inventory
echo. > serializers.py
cd ../
```

📘 **Documentação:**
> **Passo 5:** Criação dos módulos `services.py`, `prompts.py`, `urls.py` e `serializers.py` para implementação futura.

---

### 🔹 Criar arquivo `requirements.txt`
```powershell
type nul > requirements.txt
notepad requirements.txt
```
Conteúdo:
```
Django==5.0
djangorestframework==3.15
psycopg2-binary==2.9.9
langchain==0.2.12
langchain-community==0.0.32
```

📘 **Documentação:**
> **Passo 6:** Adiciona arquivo de requisitos para reprodução do ambiente.

---

### 🔹 Testar servidor Django
```powershell
python manage.py migrate
python manage.py runserver
```
Acesse `http://127.0.0.1:8000/`.

📘 **Documentação:**
> **Passo 7:** Executa migrações iniciais e valida funcionamento do servidor Django.

---

## 📘 CAPÍTULO 3 — Frontend (React + Vite + TypeScript + Tailwind + Axios + Zustand + React Query + React Router)

### 🔹 Criar projeto Vite com TypeScript
No diretório principal `natura_inventory`:

```powershell
npm create vite@latest frontend -- --template react-ts
```

📘 **Documentação:**
> **Passo 8:** Cria projeto React + Vite + TypeScript (template oficial recomendado).

---

### 🔹 Instalar dependências adicionais

```powershell
cd frontend
npm install axios @tanstack/react-query zustand react-router-dom
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

📘 **Documentação:**
> **Passo 9:** Instala bibliotecas de estado (Zustand), query caching (React Query), roteamento e Tailwind para estilização.

---

### 🔹 Configurar Tailwind
Abra `tailwind.config.js` e substitua o conteúdo:
```js
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
```

📘 **Documentação:**
> **Passo 10:** Configuração padrão do Tailwind para escanear componentes TypeScript e habilitar utilitários CSS.

---

### 🔹 Estrutura de diretórios do frontend

```powershell
mkdir src\components src\pages src\hooks src\services
echo. > src\components\ChatAssistant.tsx
echo. > src\services\api.ts
```

📘 **Documentação:**
> **Passo 11:** Cria estrutura modular de desenvolvimento frontend para futuro layout e integração com API Django.

---

### 🔹 Criar serviço de API base (`src/services/api.ts`)
```ts
import axios from "axios";

export const api = axios.create({
  baseURL: "http://127.0.0.1:8000/api",
});
```

📘 **Documentação:**
> **Passo 12:** Define cliente Axios apontando para API Django (porta 8000).

---

### 🔹 Criar componente ChatAssistant (`src/components/ChatAssistant.tsx`)
Mesmo exemplo do passo anterior que contém input, histórico e comunicação com `/api/chat/ask/`.

📘 **Documentação:**
> **Passo 13:** Implementa primeiro widget de chat (frontend ↔ backend).

---

### 🔹 Testar frontend
```powershell
npm run dev
```
Acesse `http://127.0.0.1:5173`.

📘 **Documentação:**
> **Passo 14:** Executa build dev do frontend e valida integração básica.

---

## 📘 CAPÍTULO 4 — Estrutura para Documentação Automática

Vamos criar a pasta `/docs` para começar a guardar toda essa documentação.

```powershell
cd ..
mkdir docs
echo. > docs/SETUP.md
```

📘 **Documentação:**
> **Passo 15:** Cria pasta `docs` para consolidar registros técnicos e comandos utilizados.

Dentro de `docs/SETUP.md`, adicionaremos o conteúdo gradual (como estamos fazendo agora).  
Cada etapa será inserida lá.

---

## 🔄  Tudo que for conversado daqui pra frente

▶️ Será guardado e formatado para inclusão em:
`docs/SETUP.md`, `docs/BACKEND.md`, `docs/FRONTEND.md`, e posteriormente `docs/MOBILE.md`.

---

## ✅ Status Atual do Projeto

| Camada | Situação | Próximo Passo |
|---------|-----------|---------------|
| **Backend Django** | Estrutura e dependências instaladas | Configurar AI (`services.py`, LangChain SQL Agent) |
| **Frontend Vite** | Setup inicial completo | Criar layout base e rotas (Dashboard, Estoque, Chat) |
| **Documentação** | Estrutura iniciada (`docs/SETUP.md`) | Registrar comandos adicionais e fluxos futuros |
| **Mobile (futuro)** | Planejado | Avaliar Kotlin KMP vs React Native |

---

👉 **Próximo passo sugerido:**  
Configurar **LangChain SQL Agent no backend** para habilitar perguntas via IA (`/api/chat/ask/`) e registrar isso na documentação.  
Quer que eu prossiga com essa configuração agora (com comandos e código + documentação correspondente)?