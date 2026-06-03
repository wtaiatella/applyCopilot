# Experiência: Application Software Engineer na Siemens Brazil

## Informações Gerais
* **Empresa**: Siemens Brazil
* **Cargo**: Application Software Engineer (Spectrum Power 5 | Troubleshooting | Project Management)
* **Período**: Dec 2021 - Oct 2022
* **Localização / Modelo**: Remote

## Conquistas Formais (Resume Bullets)
* **TAESA Major Version Upgrade**: Contributed to a major operations center system version upgrade for TAESA (one of Brazil's largest power transmission companies), successfully updating more than 700 operational screens, transferring 100,000+ data points, and migrating a historical 5-year database.
* **Process Automation (XML Tool)**: Designed and developed a custom automation utility in React and JavaScript to edit XML configuration structures associated with over 700 system screens, reducing manual adjustment time by 30% and accelerating project scheduling.
* **UI Development**: Constructed screens for the critical energy transmission operation supervisor using React, guaranteeing high interface stability, seamless navigation, and real-time reliability.
* **Multicultural Global Collaboration**: Coordinated with cross-functional engineering, support, and R&D divisions located globally across Germany, Turkey, India, and the United States to align technical requirements.

## Tecnologias Utilizadas
* React
* JavaScript (ES6)
* XML parsing & automation
* Spectrum Power 5 (SCADA Energy System)
* Critical energy operations software
* Global multicultural cooperation

## Detalhes Complementares (Bastidores)

### 2026-06-01 - Entrevista de Enriquecimento
* **Foco/Desafio**: Migração e redimensionamento de telas de supervisão SCADA do sistema proprietário **Spectrum Power 5** para a **TAESA**. O novo Centro de Operações exigia uma resolução de tela muito maior que a antiga. Fazer a adequação manualmente exigiria abrir as 700+ telas operacionais uma a uma dentro do editor lento e travado do sistema, redimensionar a tela física e arrastar individualmente centenas de objetos gráficos (subestações, chaves, medidores) para centralizá-los e evitar que ficassem deslocados no canto superior esquerdo.
* **Detalhes Técnicos & Arquitetura**: Desenvolvimento de um utilitário independente em React e JavaScript focado em manipulação e parsing de estruturas XML. O script localizava os arquivos XML que descreviam as telas do sistema Spectrum Power, identificava e atualizava de forma automatizada a tag de resolução base da tela física. Adicionalmente, aplicava uma lógica de cálculo matemático de coordenadas para ler a posição de todos os elementos gráficos e reposicioná-los/re-centralizá-los proporcionalmente na nova escala espacial da tela.
* **Resultados & Métricas**: Eliminação total do processo manual repetitivo e lento em 700 telas operacionais críticas de energia. Redução de 30% no tempo total de ajuste, além de mitigar a 0% o risco de falhas humanas ou de posicionamento que poderiam induzir a erros na operação de transmissão de energia em tempo real.
