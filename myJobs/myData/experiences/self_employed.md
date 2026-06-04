# Experiência: Full Stack Software Engineer (Projetos de Contrato)

## Informações Gerais
* **Empresa**: Self-Employed / Contract Projects
* **Cargo**: Full Stack Software Engineer
* **Período**: Nov 2022 - Sep 2024
* **Localização / Modelo**: Remote

## Conquistas Formais (Resume Bullets)
* **Full-Stack Application Architecture**: Architected and developed web applications from concept to deployment, managing the full development lifecycle for both front-end and back-end systems.
* **Database Design & ORM Integration**: Implemented PostgreSQL databases and structured robust database schemas using Prisma ORM, ensuring highly scalable, relations-safe, and clean RESTful API integrations with the frontend.
* **Front-End & E-Commerce Development**: Engineered responsive front-end e-commerce platforms using JavaScript (ES6), React.js, Next.js, and TypeScript, featuring product catalogs, shopping carts, and integrated payment processing.
* **Third-Party Service Integration**: Designed and implemented seamless integrations with critical third-party services including payment gateways (Stripe) and email sender APIs (Resend), enhancing application functionality and user experience.
* **DevOps & CI/CD Pipeline Automation**: Established an automated CI/CD pipeline using GitHub Actions to deploy applications directly to Linode cloud VPS instances, replacing slow manual SSH/PM2 deployment workflows and reducing deployment time by 80%.
* **UI/UX Implementation & Accessibility**: Created intuitive, responsive, and mobile-first user interfaces using Tailwind CSS and Ant Design, achieving 100% cross-device compatibility and adhering to modern accessibility guidelines.
* **SEO Optimization & Performance**: Conducted audit checks and implemented search engine optimization (SEO) best practices, consistently achieving Lighthouse scores of 95+ for page performance and accessibility.

## Tecnologias Utilizadas
* Node.js
* Express
* PostgreSQL
* Prisma ORM
* JavaScript (ES6)
* React.js
* Next.js
* TypeScript
* Stripe API
* Resend API
* Git & GitHub
* GitHub Actions
* AWS CodeDeploy
* AWS S3
* Tailwind CSS
* Ant Design
* SEO & Google Lighthouse

## Detalhes Complementares (Bastidores)

### 2026-06-01 - Entrevista de Enriquecimento
* **Foco/Desafio**: Complexidade e lentidão no deploy de aplicações como desenvolvedor solo (solo developer). Os projetos eram hospedados em servidores VPS da **Linode**, que não possuem integrações nativas de push-to-deploy facilitadas como as grandes clouds. Antes da automação, cada atualização exigia commits manuais, conexão via SSH, navegação no terminal do servidor, interrupção manual do servidor Node.js executando no **PM2** (`pm2 stop`), pull de arquivos, build e reinicialização manual do serviço (`pm2 start`). Esse processo demorado gerava cansaço e riscos de erro humano.
* **Detalhes Técnicos & Arquitetura**: Configuração e integração de um pipeline de entrega contínua (CI/CD) utilizando **GitHub Actions** conectado a instâncias virtuais da **Linode** via chaves de segurança SSH e scripts automatizados de deployment. O pipeline realiza o checkout de código, testes de integridade, sincronização de arquivos no servidor e executa os gatilhos automáticos de atualização e recarregamento de processo no PM2.
* **Resultados & Métricas**: Eliminação total de processos manuais repetitivos via SSH. Aceleração de 80% na velocidade de entrega (deploys manuais que demandavam de 10 a 15 minutos de esforço direto passaram a ocorrer de forma segura e automatizada com um único push em menos de 2 minutos).
