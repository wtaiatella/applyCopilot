# Roteiro de Desenvolvimento ApplyCopilot - Next.js 16.2 + Ant Design

## Estrutura do Projeto

```
applycopilot/
├─frontend/
   ├─src/
       ├── app/api/                    # API Routes
       ├── app/actions/                # Backend actions, DB, external APIs
       ├── app/(main)/(home)/page.tsx   # Frontend home
       ├── app/(main)/dashboard/       # Frontend dashboard
       ├── app/(auth)/                 # Auth pages
       ├── lib/tensorflow/             # ML local
       ├── lib/ollama/                 # AI local
       ├── components/                 # UI components
       ├── types/                      # Zod types
       ├── stores/                     # Zustand contexts
       └── services/                   # Mail, JWT
```

## Etapa 1: Setup Inicial do Projeto

### 1.1 Criação do Projeto Next.js 16.2
- Criar projeto com `create-next-app@latest`
- Configurar TypeScript
- Configurar ESLint e Prettier
- Setup Tailwind CSS

### 1.2 Configuração Ant Design + Tailwind
- Instalar Ant Design
- Configurar tema customizado
- Integrar com Tailwind CSS
- Setup providers (ConfigProvider)

### 1.3 Estrutura de Pastas Base
- Criar estrutura de pastas conforme especificado
- Configurar barrel exports
- Setup path aliases

**Entregável:** Projeto Next.js funcional com estrutura base

## Etapa 2: Autenticação e Usuário

### 2.1 Sistema de Autenticação
- Configurar NextAuth.js ou auth custom
- Criar pages de auth (signin, register, password)
- Implementar JWT tokens
- Setup middleware de autenticação

### 2.2 Gestão de Estado
- Configurar Zustand stores
- Criar tipos Zod para usuário
- Implementar persistência de auth state

### 2.3 Layout Principal
- Criar layout com sidebar navigation
- Implementar protected routes
- Setup de loading states

**Entregável:** Sistema de autenticação funcional com layouts

## Etapa 3: Banco de Dados e Modelo

### 3.1 Setup MongoDB + Prisma
- Configurar MongoDB Atlas ou local
- Instalar e configurar Prisma
- Criar schema inicial (User, Profile, Job)

### 3.2 Tipos e Validação
- Definir schemas Zod para todas as entidades
- Criar types TypeScript
- Implementar validações

### 3.3 Conexão e Services
- Criar services de database
- Implementar CRUD básico
- Setup de error handling

**Entregável:** Conexão com DB e modelos funcionais

## Etapa 4: Upload e Processamento de CV

### 4.1 Componente de Upload
- Criar componente Upload com Ant Design
- Implementar drag & drop
- Setup de validação de arquivos
- Progress indicators

### 4.2 Processamento de CV
- Implementar parser de PDF/DOCX
- Extrair dados estruturados
- Criar interface de edição dos dados extraídos

### 4.3 Salvamento no DB
- Implementar actions para salvar CV
- Criar endpoint de upload
- Validação e persistência

**Entregável:** Sistema completo de upload e processamento de CV

## Etapa 5: TensorFlow Pré-filtro

### 5.1 Setup TensorFlow.js
- Instalar TensorFlow.js para Node.js
- Criar modelo de pré-filtro
- Implementar feature extraction

### 5.2 Sistema de Matching
- Desenvolver algoritmo de similaridade
- Criar sistema de scoring
- Implementar threshold filtering

### 5.3 Integração com API
- Criar endpoint de pré-filtro
- Integrar com workflow de vagas
- Performance optimization

**Entregável:** Sistema de pré-filtro funcional

## Etapa 6: Ollama Local AI

### 6.1 Setup Ollama
- Instalar Ollama localmente
- Configurar modelo Llama 3.2 3B
- Criar service de comunicação

### 6.2 Parsing de Vagas
- Implementar parser MD→JSON
- Criar prompts otimizados
- Setup de error handling

### 6.3 Integração no Fluxo
- Integrar com sistema de vagas
- Criar endpoints de parsing
- Cache de resultados

**Entregável:** Sistema de parsing com AI local

## Etapa 7: Sistema de Vagas

### 7.1 Busca de Vagas
- Implementar web scraping básico
- Criar sistema de busca
- Armazenar vagas encontradas

### 7.2 Análise de Compatibilidade
- Integrar TensorFlow + Ollama
- Implementar LLM para análise final
- Criar sistema de scoring

### 7.3 Dashboard de Vagas
- Criar interface de listagem
- Implementar filtros
- Setup de detalhes das vagas

**Entregável:** Sistema completo de análise de vagas

## Etapa 8: Sugestões de CV

### 8.1 Análise de Gaps
- Implementar análise de perfil vs vaga
- Identificar pontos fortes e fracos
- Criar sistema de recomendações

### 8.2 Sugestões de Melhoria
- Gerar sugestões de texto
- Implementar edição assistida
- Criar sistema de aprovação

### 8.3 Salvamento de Alterações
- Implementar versionamento de CV
- Criar histórico de mudanças
- Setup de rollback

**Entregável:** Sistema de sugestões inteligentes

## Etapa 9: Geração de Documentos

### 9.1 Geração de CV Personalizado
- Implementar template engine
- Criar layouts profissionais
- Setup de export (PDF)

### 9.2 Geração de Carta
- Implementar gerador de cartas
- Criar templates variados
- Personalização baseada em vaga

### 9.3 Download e Compartilhamento
- Implementar sistema de download
- Criar compartilhamento
- Setup de armazenamento

**Entregável:** Sistema completo de geração de documentos

## Etapa 10: Integração Final e Deploy

### 10.1 Integração Completa
- Unificar todos os fluxos
- Implementar tratamento de erros
- Setup de logging e monitoring

### 10.2 Performance e Cache
- Implementar cache Redis
- Otimizar performance
- Setup de CDN

### 10.3 Deploy Produção
- Configurar Vercel deploy
- Setup de environment variables
- Implementar CI/CD básico

**Entregável:** Aplicação completa em produção

## Componentes Ant Design Principais

### Dashboard e Layout
- **Layout**: Estrutura principal com sidebar
- **Menu**: Navegação principal
- **Card**: Cards de informações
- **Table**: Listagens de dados
- **Space**: Espaçamento entre elementos

### Formulários e Input
- **Form**: Formulários de cadastro
- **Input**: Campos de texto
- **Upload**: Upload de arquivos
- **Select**: Seleções dropdown
- **DatePicker**: Seleção de datas

### Feedback e Interação
- **Button**: Ações principais
- **Modal**: Diálogos modais
- **Drawer**: Painéis laterais
- **Tooltip**: Dicas de contexto
- **Progress**: Indicadores de progresso
- **Spin**: Estados de loading

### Exibição de Dados
- **Typography**: Textos e títulos
- **List**: Listas de informações
- **Descriptions**: Detalhes estruturados
- **Tag**: Labels e categorias
- **Badge**: Indicadores numéricos

## Ordem de Implementação Prioritária

1. **Setup base** (Etapa 1-2)
2. **CV Upload** (Etapa 4)
3. **Banco de dados** (Etapa 3)
4. **Sistema de vagas básico** (Etapa 7)
5. **AI Integration** (Etapa 5-6)
6. **Sugestões inteligentes** (Etapa 8)
7. **Geração de documentos** (Etapa 9)
8. **Finalização e deploy** (Etapa 10)

Cada etapa deve ser testada e validada antes de prosseguir para a próxima.
