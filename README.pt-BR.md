# 🔮 Zoltar Fortune System

🇺🇸 **[Read in English](README.md)**

**Um sistema de sorteio de frases dinâmicas com imagem gerada em tempo real para uso em READMEs do GitHub.**

---

## Índice

- [Sobre o Projeto](#sobre-o-projeto)
- [O Problema: Limitações do GitHub](#o-problema-limitações-do-github)
- [Tentativa Inicial: Vercel + SVG](#tentativa-inicial-vercel--svg)
- [Solução Final: VPS + FastAPI + Pillow](#solução-final-vps--fastapi--pillow)
- [Arquitetura](#arquitetura)
- [Fluxo do Usuário no README](#fluxo-do-usuário-no-readme)
- [Stack Técnica](#stack-técnica)
- [Estrutura de Arquivos](#estrutura-de-arquivos)
- [Como Funciona a API](#como-funciona-a-api)
  - [O Problema do GitHub Camo e a Solução](#o-problema-do-github-camo-e-a-solução)
- [Pool de Frases](#pool-de-frases)
- [Deploy no VPS](#deploy-no-vps)
- [Configuração do Nginx](#configuração-do-nginx)
- [Problemas Encontrados e Soluções](#problemas-encontrados-e-soluções)
- [Manutenção e Operação](#manutenção-e-operação)
- [Adaptando para Outros Projetos](#adaptando-para-outros-projetos)

---

## Sobre o Projeto

O Zoltar Fortune System é uma brincadeira interativa integrada ao README de um perfil GitHub. Inspirado na máquina Zoltar do filme *Big* (1988), o sistema simula a experiência de receber uma "sorte" impressa em uma filipeta — só que gerada dinamicamente a cada visita.

O visitante do perfil navega por uma sequência de páginas Markdown que simulam a animação da máquina Zoltar sendo ativada. Ao final, uma API externa gera uma imagem PNG em tempo real com uma frase aleatória escolhida de um pool, renderizada sobre a arte da filipeta. A mesma frase fica disponível para download em formato otimizado para compartilhamento.

---

## O Problema: Limitações do GitHub

O GitHub Flavored Markdown é bastante restritivo em relação a conteúdo dinâmico. O README de um repositório não suporta JavaScript, iframes, elementos `<script>`, CSS customizado ou qualquer forma de interatividade nativa. Imagens são aceitas, mas passam pelo **GitHub Camo** — um proxy que faz cache e sanitiza URLs externas, exigindo que a origem responda via HTTPS com um domínio válido e `content-type` de imagem.

Isso significa que a única forma de exibir conteúdo dinâmico em um README é servir uma **imagem gerada sob demanda** a partir de uma URL HTTPS estável. O GitHub faz o fetch dessa URL, recebe a imagem, e a renderiza como se fosse estática. Na prática, a imagem muda a cada vez que o cache do Camo expira ou é invalidado.

A "interatividade" do fluxo Zoltar é obtida através de um truque simples: cada imagem clicável aponta para um arquivo `.md` diferente dentro do repositório, simulando uma progressão de telas. Isso funciona porque links em Markdown são suportados normalmente.

---

## Tentativa Inicial: Vercel + SVG

A primeira abordagem foi usar uma Serverless Function na Vercel para gerar a filipeta dinamicamente. A ideia era retornar um SVG com a frase embutida, já que SVG é um formato de imagem aceito pelo GitHub.

**Por que não funcionou:**

A Vercel teve dificuldade em gerar SVGs complexos de forma confiável neste contexto. O SVG precisava incorporar a imagem base da filipeta (via `<image>` com base64 ou URL externa), aplicar rotação no texto, usar uma fonte customizada (SpecialElite) e manter proporções consistentes. A combinação desses requisitos resultou em renderização inconsistente: fontes que não carregavam, imagens base64 que estouravam limites de tamanho da resposta, e problemas de CORS quando referenciando assets externos. O ambiente serverless também adicionava cold-start latency que, combinado com o timeout do GitHub Camo, causava falhas intermitentes no carregamento da imagem.

---

## Solução Final: VPS + FastAPI + Pillow

A solução que funcionou foi mover a geração de imagem para um VPS próprio, usando Python com Pillow para renderização server-side de PNGs. As justificativas:

**Por que FastAPI?** É leve, assíncrono, e ideal para servir endpoints simples de API. O `StreamingResponse` permite retornar a imagem direto do buffer de memória sem precisar salvar em disco. Além disso, já havia familiaridade com o framework por outros projetos no mesmo VPS (Lista de Compras, por exemplo).

**Por que Pillow em vez de SVG?** Pillow dá controle total sobre o resultado visual. A fonte SpecialElite é carregada localmente como arquivo `.ttf`, sem dependência de CDN ou embedding. A rotação de -11° (para simular a filipeta levemente inclinada na tela) é feita com `Image.rotate()` com precisão de subpixel. O resultado é um PNG previsível, sem variações de renderização entre browsers ou proxies.

**Por que o VPS próprio em vez de outro serviço serverless?** O VPS já existia, já tinha domínio com SSL configurado (`jeff.ia.br` via Certbot), e rodar um processo Uvicorn persistente elimina o problema de cold-start. A filipeta é gerada em milissegundos, sem overhead de inicialização de container.

---

## Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│                    VISITANTE DO GITHUB                   │
│                                                         │
│  README.md ──► coin-found.md ──► activating.md ──►      │
│  activating1.md ──► filipeta_saindo.md ──► fortune.md   │
└──────────────────────────┬──────────────────────────────┘
                           │
            <img src="https://jeff.ia.br/zoltar/quote">
                           │
                    ┌──────▼──────┐
                    │ GitHub Camo │  (proxy/cache de imagens)
                    └──────┬──────┘
                           │
                   HTTPS GET /zoltar/quote
                           │
              ┌────────────▼────────────────┐
              │     VPS (38.242.233.200)     │
              │                             │
              │  Nginx (:443)               │
              │    └─► /zoltar/ ──► :8090   │
              │                             │
              │  Uvicorn/FastAPI (:8090)     │
              │    ├─ GET /quote  → PNG tela │
              │    │    (+ salva filipeta dl) │
              │    ├─ GET /download → PNG dl │
              │    └─ GET /salve_sua_sorte   │
              │         → último PNG gerado  │
              │                             │
              │  Pillow + SpecialElite.ttf   │
              │  fortunes.txt (pool frases)  │
              └─────────────────────────────┘
```

---

## Fluxo do Usuário no README

O fluxo simula a experiência de interagir com uma máquina Zoltar em seis etapas, cada uma representada por um arquivo Markdown no repositório:

| Etapa | Arquivo | Imagem Exibida | Ação do Clique |
|-------|---------|---------------|----------------|
| 1. Página principal | `README.md` | `Zoltar_0.jpg` (máquina parada) | Clique no baú → `coin-found.md` |
| 2. Moeda encontrada | `coin-found.md` | `Zoltar_1.png` | Clique → `activating.md` |
| 3. Ativando | `activating.md` | `Zoltar_2.png` | Clique → `activating1.md` |
| 4. Processando | `activating1.md` | `Zoltar_3.png` | Clique → `filipeta_saindo.md` |
| 5. Filipeta saindo | `filipeta_saindo.md` | `Zoltar_3B.png` | Clique → `fortune.md` |
| 6. Sorte revelada | `fortune.md` | **Imagem dinâmica da API** | Clique → `locked.md` |

Na etapa 6, o `<img src>` aponta para `https://jeff.ia.br/zoltar/quote`, que gera a filipeta com frase aleatória em tempo real. Abaixo da imagem, um link para `https://jeff.ia.br/zoltar/salve_sua_sorte` oferece a versão para download — sincronizada com a frase exibida na tela (ver seção [O Problema do GitHub Camo e a Solução](#o-problema-do-github-camo-e-a-solução)).

Após visualizar a sorte, o clique leva a `locked.md`, que exibe `Zoltar_5.png` — a máquina em modo de espera.

---

## Stack Técnica

| Componente | Tecnologia | Justificativa |
|-----------|-----------|---------------|
| API | FastAPI (Python) | Leve, async, `StreamingResponse` nativo |
| Geração de imagem | Pillow (PIL) | Controle total sobre renderização, fontes locais, rotação precisa |
| Servidor WSGI | Uvicorn | Compatível com FastAPI, leve e performático |
| Reverse Proxy | Nginx | Já existente no VPS, SSL termination, path routing |
| SSL | Certbot / Let's Encrypt | HTTPS obrigatório para GitHub Camo |
| Fonte | SpecialElite Regular (.ttf) | Estética de máquina de escrever vintage, coerente com tema Zoltar |

---

## Estrutura de Arquivos

```
/root/zoltar_api/
├── main.py                    # API FastAPI — endpoints /quote, /download e /salve_sua_sorte
├── fortunes.txt               # Pool de frases (uma por linha)
├── Zoltar_Filipeta.png        # Imagem base da filipeta (versão tela)
├── filipeta_download.png      # Imagem base da filipeta (versão download)
├── SpecialElite-Regular.ttf   # Fonte usada na renderização
├── requirements.txt           # Dependências Python
├── grab_files/                # Filipetas de download geradas (auto-limpeza após 1h)
├── venv/                      # Ambiente virtual Python
├── zoltar.log                 # Log de saída do processo
└── __pycache__/               # Cache do Python
```

---

## Como Funciona a API

### Endpoints

**`GET /quote`** — Retorna a filipeta com frase aleatória em formato PNG, otimizada para exibição em tela.

- Imagem base: `Zoltar_Filipeta.png`
- Texto rotacionado em -11° para simular inclinação da filipeta na máquina
- Fonte: SpecialElite, tamanho proporcional a 8.5% da imagem
- Responde com `Content-Type: image/png` e `Cache-Control: no-cache`
- Efeito colateral: também gera e salva a filipeta de download correspondente (mesma frase) em `grab_files/` com nome aleatório, e atualiza a referência do último arquivo gerado

**`GET /download`** — Retorna a filipeta de download gerada por IP. Para uso direto no browser (fora do GitHub).

- Imagem base: `filipeta_download.png`
- Texto sem rotação (0°), centralizado para leitura direta
- Header `Content-Disposition: attachment` para forçar download
- Usa o sistema de cache por IP para garantir consistência com `/quote` quando acessado pelo mesmo browser

**`GET /salve_sua_sorte`** — Serve o último arquivo de download gerado pelo `/quote`. Este é o endpoint usado no GitHub.

- Retorna o arquivo físico salvo em `grab_files/` pelo último `/quote` executado
- Não depende de IP — resolve o problema de dessincronização causado pelo GitHub Camo (ver abaixo)
- Header `Content-Disposition: attachment` para forçar download
- Fallback: se nenhum arquivo existe ainda, gera uma filipeta com frase aleatória

### O Problema do GitHub Camo e a Solução

O GitHub Camo é um proxy que o GitHub usa para servir imagens externas referenciadas em READMEs. Quando um visitante acessa o perfil, o Camo faz o fetch da imagem em nome do visitante, usando o **IP do próprio Camo** — não o IP do visitante real.

Isso criou um problema de dessincronização entre a filipeta exibida e o download:

1. O `<img src="/zoltar/quote">` no Markdown é carregado pelo Camo → IP do Camo → gera frase X
2. O visitante clica no link de download → o browser abre a URL direto → IP real do visitante → gera frase Y (diferente)

A solução foi criar o endpoint `/salve_sua_sorte`, que não gera uma nova frase — ele simplesmente serve o último arquivo de download que foi fisicamente salvo em disco pelo `/quote`. Como o `/quote` gera e salva ambas as versões (tela + download) com a mesma frase, o `/salve_sua_sorte` sempre retorna a filipeta correspondente à última imagem exibida no README.

O endpoint `/download` original foi mantido intacto para uso direto no browser, onde o cache por IP funciona corretamente (mesmo IP para visualização e download).

### Sistema de Cache por IP

Cada visitante é identificado pelo IP (`request.client.host`). Ao gerar uma frase, ela é armazenada em um dicionário em memória com timestamp. Requisições subsequentes do mesmo IP dentro de 5 minutos (300 segundos) retornam a mesma frase. Isso garante que `/quote` e `/download` exibam a mesma sorte durante uma sessão, e que reloads da página não gerem frases diferentes a cada vez.

```python
quote_cache = {}
CACHE_TTL = 300  # 5 minutos

def get_user_quote(ip: str):
    now = time.time()
    if ip in quote_cache:
        quote, ts = quote_cache[ip]
        if now - ts < CACHE_TTL:
            return quote
    new_quote = random.choice(load_fortunes())
    quote_cache[ip] = (new_quote, now)
    return new_quote
```

> **Nota sobre o GitHub Camo:** Como o Camo faz proxy das requisições, o IP que chega na API é o do Camo, não o do visitante real. Isso significa que o cache por IP não diferencia visitantes via GitHub. O endpoint `/download` funciona corretamente para acesso direto via browser (onde o IP real é preservado). Para o contexto do GitHub, o endpoint `/salve_sua_sorte` resolve a dessincronização — ver seção [O Problema do GitHub Camo e a Solução](#o-problema-do-github-camo-e-a-solução).

### Processo de Renderização

1. Carrega a imagem base PNG com canal alpha (`RGBA`)
2. Carrega a fonte SpecialElite no tamanho configurado
3. Aplica word-wrap na frase (18 caracteres por linha)
4. Cria uma camada transparente do mesmo tamanho da imagem base
5. Desenha o texto centralizado nessa camada
6. Rotaciona a camada de texto (apenas no modo `screen`)
7. Compõe a camada de texto sobre a imagem base via `alpha_composite`
8. Serializa o resultado como PNG em um buffer de memória
9. Retorna o buffer como `StreamingResponse`

---

## Pool de Frases

As frases ficam no arquivo `fortunes.txt`, uma por linha. O arquivo é lido a cada requisição (sem cache de arquivo, apenas de resultado por IP). Exemplo do pool de desenvolvimento:

```
"O sucesso virá na próxima linha de código."
"Cuidado com os loops infinitos hoje."
"Alguém vai aprovar seu PR sem ler."
"Seu próximo commit será lendário."
"O destino reserva um deploy perfeito para sexta-feira."
```

O pool de produção contém um volume significativamente maior de frases. Para adicionar novas, basta inserir uma linha no arquivo e reiniciar o processo (ou aguardar que o arquivo seja relido na próxima requisição com TTL expirado).

**Diretrizes para novas frases:** manter o tom humorístico voltado ao universo dev/tech, evitar frases muito longas (o word-wrap de 18 caracteres comporta bem até ~80 caracteres), e manter as aspas no arquivo para consistência de parsing.

---

## Deploy no VPS

### Pré-requisitos

- VPS com Ubuntu/Debian e acesso root
- Python 3.10+
- Nginx instalado e configurado
- Domínio com DNS apontando para o VPS
- Certificado SSL via Certbot

### Instalação

```bash
# 1. Criar diretório e copiar arquivos
mkdir -p /root/zoltar_api
cd /root/zoltar_api

# 2. Criar ambiente virtual
python3 -m venv venv
source venv/bin/activate

# 3. Instalar dependências
pip install -r requirements.txt

# 4. Testar localmente
python main.py
# Deve aparecer: INFO: Uvicorn running on http://127.0.0.1:8090

# 5. Rodar em background
nohup /root/zoltar_api/venv/bin/python main.py > zoltar.log 2>&1 &
```

### Verificação

```bash
# Confirmar que está escutando na porta
ss -tlnp | grep 8090

# Teste local
curl -o /dev/null -s -w "%{http_code} %{content_type}\n" http://127.0.0.1:8090/quote
# Esperado: 200 image/png

# Teste externo (após configurar Nginx)
curl -o /dev/null -s -w "%{http_code} %{content_type}\n" https://jeff.ia.br/zoltar/quote
# Esperado: 200 image/png
```

---

## Configuração do Nginx

O Zoltar roda como mais um serviço atrás do Nginx no VPS, no mesmo arquivo de configuração que já serve outros projetos (`jeff.ia.br`). O bloco relevante dentro do `server` block HTTPS:

```nginx
# =========================
# ZOLTAR
# =========================

# Normaliza /zoltar sem barra final
location = /zoltar { return 301 /zoltar/; }

# ZOLTAR - FastAPI/Uvicorn na porta 8090
location ^~ /zoltar/ {
    proxy_pass http://127.0.0.1:8090/;

    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
}
```

**Detalhes importantes:**

- A **trailing slash** em `proxy_pass http://127.0.0.1:8090/` é crítica — ela faz o Nginx fazer strip do prefixo `/zoltar/` antes de encaminhar ao backend. Sem ela, o FastAPI receberia `/zoltar/quote` em vez de `/quote` e retornaria 404.
- O `root_path="/zoltar"` no FastAPI é definido para que a documentação automática (Swagger) funcione corretamente sob o prefixo, sem afetar o roteamento das rotas em si.
- O `location = /zoltar` (sem barra) faz redirect 301 para `/zoltar/` para normalizar a URL.
- O `^~` garante que este bloco tem prioridade sobre regex locations.

### Após alterar o Nginx

```bash
# Sempre testar antes de recarregar
nginx -t

# Se syntax ok, recarregar sem downtime
systemctl reload nginx
```

---

## Problemas Encontrados e Soluções

O deploy do Zoltar envolveu várias tentativas antes de funcionar. Esta seção documenta os problemas para referência futura.

### 1. Porta 8000 ocupada

**Problema:** A primeira tentativa de rodar o Uvicorn na porta 8000 falhou com `[Errno 98] address already in use`.

**Causa:** Outro serviço já ocupava a porta no VPS.

**Solução:** Migrar para a porta 8090, sem conflito com os demais serviços (Holo na 3001, Lista na 8010, Pega-Pirata na 5000).

### 2. Porta não-standard bloqueada pelo firewall do provedor

**Problema:** Rodar na porta 8055 com `ufw allow` não resolveu — timeout nas requisições externas.

**Causa:** O firewall do provedor de hosting (não o `ufw` local) bloqueia portas fora do range padrão (80, 443). Além disso, o GitHub Camo exige HTTPS com domínio válido, então acesso direto por IP:porta nunca funcionaria para o caso de uso final.

**Solução:** Usar Nginx como reverse proxy na porta 443 (já aberta) com path-based routing.

### 3. Configuração Nginx corrompida por `sed`

**Problema:** Tentativa de injetar o bloco `location` via `sed` remoto corrompeu o arquivo de configuração. Os headers ficaram com valores do PowerShell em vez das variáveis Nginx.

**Causa:** As variáveis Nginx (`$host`, `$remote_addr`, etc.) foram interpretadas como variáveis de shell/PowerShell durante a execução do `sed`, resultando em valores vazios ou lixo como `System.Management.Automation.Internal.Host.InternalHost`.

**Solução:** Abandonar `sed` para edição de configs Nginx. Gerar o arquivo completo corrigido separadamente e substituir via `cat << 'EOF'` (com aspas simples no delimitador para impedir expansão de variáveis) ou upload direto + `nano`.

**Lição aprendida:** Nunca usar `sed` para editar arquivos que contenham `$` como parte da sintaxe (Nginx, shell scripts, Makefiles) via execução remota. O risco de expansão acidental é muito alto.

### 4. Dependências não encontradas na venv

**Problema:** O processo morreu imediatamente com `ModuleNotFoundError: No module named 'fastapi'`.

**Causa:** O `nohup` foi executado com o Python do sistema em vez do Python da venv.

**Solução:** Usar o path completo do interpretador da venv: `nohup /root/zoltar_api/venv/bin/python main.py`.

### 5. Erro 405 Method Not Allowed no teste

**Problema:** `curl -I` retornou 405.

**Causa:** O flag `-I` envia uma requisição `HEAD`, e o endpoint do FastAPI só aceitava `GET`.

**Solução:** Não é um bug — testar com `curl -o /dev/null -s -w "%{http_code}"` em vez de `curl -I`.

### 6. Dessincronização de frase entre filipeta na tela e download (GitHub Camo)

**Problema:** A filipeta exibida no README mostrava uma frase diferente da filipeta baixada pelo link de download.

**Causa:** O GitHub Camo faz proxy das imagens usando seu próprio IP. Quando o `<img src>` carrega `/quote`, o IP que chega na API é o do Camo. Quando o visitante clica no link de `/download`, o browser faz a requisição direta com o IP real do visitante. Como o cache é por IP, cada um recebia uma frase diferente.

**Solução:** Criar o endpoint `/salve_sua_sorte`. O `/quote` agora, além de retornar a imagem de tela, salva a filipeta de download correspondente (mesma frase) como arquivo físico em `grab_files/` com nome aleatório. O `/salve_sua_sorte` serve esse arquivo diretamente, sem depender de IP. O endpoint `/download` original foi mantido intacto para uso direto no browser, onde o cache por IP funciona corretamente.

**Lição aprendida:** Qualquer sistema que dependa de IP para sincronizar estado entre imagens proxy e links diretos no GitHub vai falhar. O Camo quebra a premissa de "mesmo visitante = mesmo IP".

---

## Manutenção e Operação

### Verificar se o Zoltar está rodando

```bash
ss -tlnp | grep 8090
```

Se não retornar nada, o processo caiu. Subir novamente:

```bash
nohup /root/zoltar_api/venv/bin/python /root/zoltar_api/main.py > /root/zoltar_api/zoltar.log 2>&1 &
```

### Ver logs

```bash
tail -f /root/zoltar_api/zoltar.log
```

### Reiniciar o serviço

```bash
# Encontrar o PID
pgrep -f "zoltar_api/main.py"

# Matar o processo
kill <PID>

# Subir novamente
nohup /root/zoltar_api/venv/bin/python /root/zoltar_api/main.py > /root/zoltar_api/zoltar.log 2>&1 &
```

### Atualizar as frases

Editar `/root/zoltar_api/fortunes.txt` (uma frase por linha). O arquivo é relido a cada requisição com TTL expirado, mas para garantir, reiniciar o processo.

### Tornar o serviço persistente (sobreviver a reboot)

Para garantir que o Zoltar suba automaticamente após um reboot do VPS, criar um serviço systemd:

```bash
cat << 'EOF' > /etc/systemd/system/zoltar.service
[Unit]
Description=Zoltar Fortune API
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/zoltar_api
ExecStart=/root/zoltar_api/venv/bin/python main.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable zoltar
systemctl start zoltar
```

A partir daí, gerenciar com `systemctl start|stop|restart|status zoltar`.

---

## Adaptando para Outros Projetos

Este sistema pode ser adaptado para qualquer cenário onde se deseje exibir conteúdo dinâmico em um README do GitHub (ou qualquer Markdown renderizado que aceite `<img src>`). A lógica central é simples:

1. **Um endpoint que retorna uma imagem** — pode ser PNG, JPEG ou GIF. O `Content-Type` deve ser correto.
2. **HTTPS com domínio válido** — obrigatório para o GitHub Camo aceitar a imagem.
3. **Geração server-side** — qualquer conteúdo que varie (frases, dados, gráficos, badges) precisa ser renderizado no servidor e retornado como imagem.

### Exemplos de adaptação

- **Quote of the Day** — mesmo conceito, pool diferente, sem o fluxo de páginas Markdown
- **Stats dinâmicos** — renderizar métricas de um projeto ou API sobre uma imagem template
- **Badges customizados** — ir além do shields.io com designs visuais proprietários
- **Mini-jogos em Markdown** — cada "estado" do jogo é uma página `.md` diferente, com imagens geradas conforme o estado

### O que trocar

| Componente | O que muda |
|-----------|-----------|
| `fortunes.txt` | Seu pool de conteúdo (frases, dados, etc.) |
| `Zoltar_Filipeta.png` | Sua imagem base/template |
| Coordenadas e rotação em `main.py` | Posição e ângulo do texto na sua imagem |
| `SpecialElite-Regular.ttf` | Sua fonte de preferência |
| Porta no `main.py` e Nginx | Qualquer porta livre no seu servidor |
| Path no Nginx (`/zoltar/`) | O path que fizer sentido pro seu projeto |

---

<div align="center">

*Documentação gerada em Março/2026.*
*Zoltar disse que seu próximo deploy será lendário.* 🔮

</div>
