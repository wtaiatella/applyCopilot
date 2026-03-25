# ApplyCopilot - AI-Powered Job Application Manager

ApplyCopilot é um sistema inteligente projetado para automatizar e otimizar o processo de busca de emprego. Ele utiliza agentes de IA e orquestração avançada para ajudar desenvolvedores a encontrar, analisar e se candidatar a vagas, com foco em oportunidades remotas internacionais.

## 🎯 Objetivos do Projeto

- **Descoberta Automatizada**: Extrair dados de portais de emprego para identificar vagas relevantes com base em perfis personalizados.
- **Análise Profunda**: Usar LLMs para comparar descrições de vagas com currículos e experiências armazenadas em um sistema RAG.
- **Personalização de Conteúdo**: Gerar CVs e cartas de apresentação personalizadas para cada candidatura específica.
- **Gestão de Candidaturas**: Um dashboard centralizado para acompanhar o status de cada candidatura.

## 📂 Estrutura do Projeto sugerido
```text
myjobs/
├── apps/
│   └── frontend/             # Next.js Dashboard & UI
├── backend/
│   ├── app/
│   │   ├── agents/
│   │   │   ├── graph.py      # Orquestração de estados com LangGraph
│   │   │   └── prompts.py    # Gestão centralizada de system prompts
│   │   ├── agents/
│   │   │   ├── routes/
│   │   │   └── schemas/
│   │   ├── core/
│   │   │   ├── config.py     # Configurações centralizadas
│   │   │   └── logging.py    # Sistema de log/debug
│   │   ├── database/
│   │   │   ├── models.py     # Modelos SQLModel
│   │   │   ├── session.py    # SQLAlchemy/SQLModel setup
│   │   │   └── vector_store.py # Implementação de pgvector
│   │   └── services/         # Lógica de negócio que une Tools e Agents
│   ├── tools/
│   │   ├── crawler/          # Implementação com Crawl4AI/Firecrawl
│   │   │   ├── base.py
│   │   │   └── providers/    # Implementações específicas por site
│   │   ├── parsers/          # Lógica de limpeza de PDF/Docx
│   │   └── match_engine/     # Algoritmos de scoring
│   └── mcp/                  # Definições de ferramentas para o protocolo MCP
├── shared/                   # Tipos e constantes compartilhados
└── docker-compose.yml        # Infraestrutura local
│   │   │   ├── config.py     # Configurações centralizadas
- **GPT-5**: Como alternativa para tarefas específicas

### 3. Armazenamento e Recuperação
- **PostgreSQL com pgvector**: Para armazenamento eficiente de dados vetoriais e relacionais
- **Sistema RAG Avançado**: Para recuperação contextual de informações do perfil do usuário

### 4. Interface e Interação
- **MCP Server**: Interface padronizada que expõe as ferramentas do projeto para qualquer cliente compatível com MCP.
- **Human-in-the-loop**: Sistema interativo que transforma a IA de um gerador passivo para um copiloto ativo.
- **FastAPI**: Serve os endpoints especializados necessários para o frontend web.
- **Next.js Frontend**: Um dashboard React moderno para gerenciar candidaturas, editar perfis e interagir com o agente de IA.

## 🛠️ Stack Tecnológica

- **Frontend**: Next.js (App Router), Tailwind CSS, Lucide Icons.
- **Backend**: Python, FastAPI, LangGraph.
- **AI/LLM**: Gemini 3 (Flash/Pro), Claude 4, GPT-5.
- **Banco de Dados**: PostgreSQL com pgvector.
- **Protocolo**: Model Context Protocol (MCP).
- **Web Scraping**: Crawl4AI, https://brightdata.com.br

## 🔄 Fluxo de Trabalho

1. O usuário faz upload de seu CV e define preferências de busca
2. Os agentes descobrem vagas relevantes usando Crawl4AI
3. O sistema analisa a compatibilidade entre o perfil e as vagas usando LLMs
4. O usuário recebe recomendações personalizadas e pode interagir com o sistema
5. O sistema ajuda a preparar materiais de candidatura otimizados

## 🌟 Recursos Avançados

### Prompt Caching
Utilização do cache de contexto do Gemini 3 para armazenar informações do CV do usuário, economizando tokens e reduzindo latência nas análises de vagas.

### Orquestração Não-Linear
Implementação de fluxos de trabalho complexos com LangGraph, permitindo tratamento avançado de erros e decisões condicionais durante o processo de análise.

### Extração Inteligente
Uso de ferramentas modernas como Crawl4AI para extração estruturada de dados de vagas, com limpeza automática e formatação otimizada.

### Interação Humano-IA
Sistema de perguntas interativas que transforma a IA de um gerador passivo para um copiloto ativo, solicitando feedback do usuário em pontos estratégicos.

---
*Este projeto está atualmente em fase de definição arquitetural e desenvolvimento inicial.*