# Roadmap ApplyCopilot v2 - Próximos Passos

## Resumo dos Próximos Passos

1. **Migrar scrape** de backend_v1 para backend
2. **Implementar pré-filtro** com TensorFlow
3. **Criar sistema de análise** de vagas com score de match

## Análise do Sistema de Scrape + Uso de LLM

### Como Funciona Atualmente (baseado na sua descrição)

**Fluxo do scraping:**
```
Site da Vaga → Lib Python → Markdown → LLM → JSON Estruturado
```

**Onde LLM é usado:**
- **Conversão MD → JSON**: Estruturar dados brutos em campos (título, empresa, requirements, etc.)
- **Limpeza e normalização**: Padronizar formatos diferentes
- **Extração de informações**: Identificar skills, salário, localização

### Complexidade da Análise MD → JSON

**É moderadamente complexa, mas totalmente factível com LLM local:**

**Tarefas do LLM:**
- Identificar campos estruturados em texto não estruturado
- Extrair informações específicas (skills, salário, requisitos)
- Padronizar formatos diferentes

**Alternativas LLM Local (Ollama):**
- **Llama 3.2 3B**: Leve e eficiente para tarefas simples
- **Qwen 2.5 3B**: Excelente em structured output
- **Phi-3 Mini**: Muito rápido para parsing

## Estratégia de Economia de Tokens

### **Cenário Atual (Potencial Desperdício)**
```
200 vagas × 2 chamadas LLM cada = 400 chamadas
- Scraping: MD → JSON (200 chamadas)
- Análise: Perfil × Vaga (200 chamadas)
```

### **Cenário Otimizado (Sua Abordagem)**
```
200 vagas → TensorFlow → Top 20 → LLM apenas para análise final
- Scraping: LLM Local Ollama (200 chamadas gratuitas)
- Pré-filtro: TensorFlow (grátis, offline)
- Análise final: LLM pago apenas 20 chamadas
```

**Economia: 90% em tokens pagos!**

## Implementação Sugerida

### **Fase 1: Scrape Otimizado**
```python
# Usar Ollama local para parsing MD → JSON
def parse_job_markdown(markdown_text):
    prompt = """
    Extraia structured JSON deste markdown de vaga:
    - title, company, location, remote_type
    - requirements (lista de skills)
    - salary_range
    - description
    """
    return ollama_call("llama3.2:3b", prompt, markdown_text)
```

### **Fase 2: Pré-filtro TensorFlow**
```python
# Características simples para pré-filtro
def extract_features(job_json):
    return {
        'skills': job_json['requirements'],
        'seniority': detect_seniority(job_json['description']),
        'remote': job_json['remote_type'],
        'salary': parse_salary(job_json['salary_range'])
    }
```

### **Fase 3: Análise Final Premium**
```python
# Apenas top 20 vagas vão para LLM premium
def detailed_analysis(user_profile, top_20_jobs):
    results = []
    for job in top_20_jobs:
        analysis = premium_llm_analyze(user_profile, job)
        results.append({
            'job': job,
            'match_score': analysis.score,
            'recommendations': analysis.suggestions,
            'cv_tips': analysis.cv_optimization
        })
    return results
```

## Stack Otimizado de Custos

### **Processamento Gratuito/Local**
- **Scraping**: BeautifulSoup + Selenium
- **Parsing MD→JSON**: Ollama (Llama 3.2 3B)
- **Pré-filtro**: TensorFlow (offline)
- **Feature extraction**: Python puro

### **Processamento Pago (Apenas essencial)**
- **Análise final**: Gemini/Claude (top 20 vagas)
- **Geração de CV**: LLM premium para personalização
- **Cover letters**: Apenas para vagas selecionadas

## Vantagens Desta Abordagem

1. **Economia Extrema**: 90% menos tokens pagos
2. **Performance**: TensorFlow é instantâneo vs LLM segundos
3. **Escalabilidade**: Processa milhares de vagas localmente
4. **Qualidade**: Análise premium apenas onde importa
5. **Privacidade**: Dados ficam locais até análise final

## Próximos Passos Concretos

1. **Investigar scraping atual** para entender estrutura MD→JSON
2. **Setup Ollama local** para parsing
3. **Implementar TensorFlow** para pré-filtro
4. **Integrar fluxo completo** com economia de tokens

**Esta abordagem é excelente e trará economia significativa mantendo qualidade!**
