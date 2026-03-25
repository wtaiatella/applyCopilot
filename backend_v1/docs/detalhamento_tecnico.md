# Detalhamento Técnico - Projeto ApplyCopilot

Este documento descreve a arquitetura final e o funcionamento do sistema ApplyCopilot, consolidando as discussões sobre ferramentas, orquestração e fluxo do MVP.

## 1. Arquitetura: Backend Híbrido

O projeto utiliza uma abordagem de **Backend Híbrido**, separando a lógica de negócio pura das interfaces de comunicação.

### 1.1. O Núcleo (Tools) - `backend/tools/`
Contém funções Python puras que realizam o trabalho pesado. Segue o princípio DRY (Don't Repeat Yourself), permitindo que a mesma lógica seja usada pela API, pelo Agente de IA e pelo Servidor MCP.
- **WebExtractor**: Responsável por buscar o conteúdo de URLs. Utiliza `requests` para velocidade e `Selenium/Playwright` para lidar com SPAs ou sites com proteção. Limpa o HTML para Markdown para economizar tokens.
- **RAGManager**: Gerencia o banco de vetores (ChromaDB ou FAISS) contendo o perfil e currículo do usuário.

### 1.2. O Cérebro (Orquestração) - `backend/app/agents/`
Utiliza **LangChain** e **Google Gemini** para tomar decisões e processar informações.
- **Gemini 1.5 Flash**: Usado para tarefas rápidas e estruturadas, como extrair dados de vagas (JSON) de textos brutos.
- **Gemini 1.5 Pro**: Usado para análises profundas de match e geração de conteúdo criativo (CVs e cartas).

### 1.3. As Interfaces (Comunicação)
- **FastAPI**: Provê os endpoints REST necessários para o frontend Next.js.
- **MCP Server (`mcp_server.py`)**: Expõe as mesmas ferramentas do `backend/tools/` via protocolo MCP, permitindo uso em clientes externos como Claude Desktop.
- **Next.js Frontend**: Interface de usuário moderna para gestão de vagas e interação com a IA.

---

## 2. Planejamento do MVP (Ações vs. Ferramentas)

A primeira entrega foca em funcionalidades de componentes na página, sem chat aberto inicialmente.

### Ação 1: Upload de Currículo (CV)
- **O que faz**: O usuário sobe seu CV em PDF.
- **Ferramenta/IA**: `RAGManager` processa o texto, divide em fragmentos e armazena em um banco de vetores.
- **Persistência**: Dados do perfil são salvos no banco de dados para referência.

### Ação 2: Descoberta de Vagas via URL de Listagem
- **O que faz**: O usuário fornece uma URL com várias vagas (ex: busca no LinkedIn).
- **Ferramenta/IA**: 
    1. `WebExtractor` busca o conteúdo bruto.
    2. `ContentIntelligence` (Gemini Flash) identifica blocos de vagas e extrai dados básicos (título, empresa, link da vaga) em formato JSON.
- **Persistência**: As vagas encontradas são salvas no banco de dados (SQLite/PostgreSQL) e exibidas em uma tabela no front.

### Ação 3: Análise Profunda de Match
- **O que faz**: O usuário escolhe uma vaga da tabela e clica em "Gerar Análise".
- **Ferramenta/IA**:
    1. `WebExtractor` busca a descrição completa da vaga através da URL específica.
    2. `Gemini Pro` compara a descrição com o perfil do usuário armazenado no RAG.
- **Resultado**: Retorna um Match Score (0-100), pontos fortes, lacunas e uma análise técnica em Markdown. Salva o status de "analisada" no banco.

---

## 3. Próximos Passos Técnicos
1. Configuração da infraestrutura de banco de dados com **SQLModel**.
2. Implementação dos 3 endpoints principais no **FastAPI** (`/cv/upload`, `/jobs/fetch-list`, `/jobs/analyze`).
3. Refinamento dos scrapers na pasta `backend/tools/` para garantir extração limpa de tokens.
