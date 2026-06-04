# Experiência: Full Stack Software Engineer na Avalara

## Informações Gerais
* **Empresa**: Avalara (Leading US tax compliance platform)
* **Cargo**: Full Stack Software Engineer | AI & Cloud Infrastructure
* **Período**: Sep 2024 – Present
* **Localização / Modelo**: Remote

## Conquistas Formais (Resume Bullets)
* **AI-Driven Application Development**: Contributed to the development of an AI-powered log analysis application, achieving a 50% reduction in system response time.
* **Backend Services Enhancement**: Improved backend services using Java, Python, Kubernetes, and Docker within a cloud infrastructure environment.
* **Real-Time Data Processing**: Maintained and optimized real-time data processing systems utilizing MQTT and Kafka for transaction services.
* **Production-Ready Code Delivery**: Delivered high-quality Java and Python code by leveraging AI-assisted development tools, demonstrating quick adaptability to new programming languages.
* **Cross-Functional Collaboration**: Worked closely with diverse teams to debug, optimize, and enhance features of services supporting millions of transactions daily.

## Tecnologias Utilizadas
* Java
* Python
* Kubernetes
* Docker
* MQTT
* Kafka
* Cloud Infrastructure

## Detalhes Complementares (Bastidores)

### 2026-06-01 - Entrevista de Enriquecimento
* **Foco/Desafio**: Gerenciamento e depuração manual de falhas de atualização de esquema de banco de dados (schema migrations) em ambientes distribuídos massivos da Avalara (Dev, QA, Integration, Sandbox e Produção). Como o sistema é altamente distribuído e composto por múltiplos clusters e sites, encontrar a causa de um erro exigia a verificação manual de logs individuais em cada pod/serviço, o que causava lentidão extrema na resolução de problemas.
* **Detalhes Técnicos & Arquitetura**: Desenvolvimento de um sistema centralizado de monitoramento e análise de logs automatizado. O sistema monitora todos os esquemas atualizados e, em caso de falha durante a migração, consome e analisa automaticamente os logs emitidos pelos Pods do Kubernetes através do **Grafana Loki**. Em seguida, cruza a leitura desses logs com os scripts de atualização executados para obter um diagnóstico imediato da falha (identificando erros de autorização, links de banco de dados indisponíveis, ou falhas de comandos SQL).
* **Resultados & Métricas**: Redução de 50% no tempo de resposta para solução de problemas técnicos (troubleshooting e recovery time) por parte da equipe de engenharia, gerando relatórios de diagnóstico automatizados e aumentando a agilidade e estabilidade nas atualizações de bancos de dados nos múltiplos clusters.
