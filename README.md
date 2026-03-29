# 🔮 Zoltar Fortune System

🇧🇷 **[Leia em Português](README.pt-BR.md)**

**A dynamic fortune image generator for GitHub READMEs — serving randomized phrases rendered on a custom card image in real time.**

> Inspired by the Zoltar machine from the movie *Big* (1988). Built to work around GitHub Markdown's static-only limitations.

---

## Table of Contents

- [About the Project](#about-the-project)
- [The Problem: GitHub Limitations](#the-problem-github-limitations)
- [First Attempt: Vercel + SVG](#first-attempt-vercel--svg)
- [Final Solution: VPS + FastAPI + Pillow](#final-solution-vps--fastapi--pillow)
- [Architecture](#architecture)
- [User Flow in the README](#user-flow-in-the-readme)
- [Tech Stack](#tech-stack)
- [File Structure](#file-structure)
- [How the API Works](#how-the-api-works)
  - [The GitHub Camo Problem and the Solution](#the-github-camo-problem-and-the-solution)
- [Fortune Pool](#fortune-pool)
- [VPS Deployment](#vps-deployment)
- [Nginx Configuration](#nginx-configuration)
- [Problems Encountered and Solutions](#problems-encountered-and-solutions)
- [Maintenance and Operations](#maintenance-and-operations)
- [Adapting for Other Projects](#adapting-for-other-projects)

---

## About the Project

The Zoltar Fortune System is an interactive gimmick embedded in a GitHub profile README. The visitor navigates through a sequence of Markdown pages that simulate a Zoltar fortune-telling machine being activated. At the end, an external API generates a PNG image in real time with a random fortune phrase rendered on a custom card ("filipeta") artwork. The same fortune is available for download in a print-friendly format.

---

## The Problem: GitHub Limitations

GitHub Flavored Markdown is extremely restrictive when it comes to dynamic content. Repository READMEs don't support JavaScript, iframes, `<script>` elements, custom CSS, or any form of native interactivity. Images are accepted, but they are routed through **GitHub Camo** — a caching proxy that sanitizes external URLs, requiring the origin to respond via HTTPS with a valid domain and proper `content-type` headers.

This means the only way to display dynamic content in a README is to serve a **server-generated image** from a stable HTTPS URL. GitHub fetches the URL, receives the image, and renders it as if it were static. In practice, the image changes every time the Camo cache expires or is invalidated.

The "interactivity" of the Zoltar flow is achieved with a simple trick: each clickable image points to a different `.md` file within the repository, simulating a screen progression. This works because Markdown links are supported natively.

---

## First Attempt: Vercel + SVG

The initial approach was to use a Vercel Serverless Function to generate the fortune card dynamically, returning an SVG with the phrase embedded — since SVG is an image format accepted by GitHub.

**Why it didn't work:**

Vercel struggled to reliably generate complex SVGs in this context. The SVG needed to embed the card base image (via `<image>` with base64 or external URL), apply text rotation, use a custom font (SpecialElite), and maintain consistent proportions. This combination resulted in inconsistent rendering: fonts that wouldn't load, base64 images exceeding response size limits, and CORS issues when referencing external assets. The serverless environment also added cold-start latency which, combined with GitHub Camo's timeout, caused intermittent image loading failures.

---

## Final Solution: VPS + FastAPI + Pillow

The working solution was to move image generation to a dedicated VPS, using Python with Pillow for server-side PNG rendering.

**Why FastAPI?** Lightweight, async, and ideal for simple API endpoints. `StreamingResponse` returns the image directly from a memory buffer without writing to disk. There was also prior familiarity with the framework from other projects on the same VPS.

**Why Pillow over SVG?** Pillow gives full control over the visual output. The SpecialElite font is loaded locally as a `.ttf` file, with no CDN or embedding dependencies. The -11° rotation (to simulate the card's tilt in the machine) is done with `Image.rotate()` with subpixel precision. The result is a predictable PNG, with no rendering variations across browsers or proxies.

**Why a self-hosted VPS over another serverless service?** The VPS already existed, already had a domain with SSL configured (`jeff.ia.br` via Certbot), and running a persistent Uvicorn process eliminates cold-start issues. The card is generated in milliseconds, with no container initialization overhead.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    GITHUB VISITOR                         │
│                                                         │
│  README.md ──► coin-found.md ──► activating.md ──►      │
│  activating1.md ──► filipeta_saindo.md ──► fortune.md   │
└──────────────────────────┬──────────────────────────────┘
                           │
            <img src="https://jeff.ia.br/zoltar/quote">
                           │
                    ┌──────▼──────┐
                    │ GitHub Camo │  (image proxy/cache)
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
              │    ├─ GET /quote  → PNG view │
              │    │    (+ saves dl card)    │
              │    ├─ GET /download → PNG dl │
              │    └─ GET /salve_sua_sorte   │
              │         → last saved PNG     │
              │                             │
              │  Pillow + SpecialElite.ttf   │
              │  fortunes.txt (phrase pool)  │
              └─────────────────────────────┘
```

---

## User Flow in the README

The flow simulates the experience of interacting with a Zoltar machine in six steps, each represented by a Markdown file in the repository:

| Step | File | Image Displayed | Click Action |
|------|------|----------------|--------------|
| 1. Main page | `README.md` | `Zoltar_0.jpg` (idle machine) | Click treasure chest → `coin-found.md` |
| 2. Coin found | `coin-found.md` | `Zoltar_1.png` | Click → `activating.md` |
| 3. Activating | `activating.md` | `Zoltar_2.png` | Click → `activating1.md` |
| 4. Processing | `activating1.md` | `Zoltar_3.png` | Click → `filipeta_saindo.md` |
| 5. Card coming out | `filipeta_saindo.md` | `Zoltar_3B.png` | Click → `fortune.md` |
| 6. Fortune revealed | `fortune.md` | **Dynamic API image** | Click → `locked.md` |

At step 6, the `<img src>` points to `https://jeff.ia.br/zoltar/quote`, which generates the fortune card with a random phrase in real time. Below the image, a link to `https://jeff.ia.br/zoltar/salve_sua_sorte` provides the download version — synchronized with the phrase shown on screen (see [The GitHub Camo Problem and the Solution](#the-github-camo-problem-and-the-solution)).

After viewing the fortune, clicking leads to `locked.md`, which displays `Zoltar_5.png` — the machine in standby mode.

---

## Tech Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| API | FastAPI (Python) | Lightweight, async, native `StreamingResponse` |
| Image generation | Pillow (PIL) | Full rendering control, local fonts, precise rotation |
| WSGI Server | Uvicorn | FastAPI-compatible, lightweight and performant |
| Reverse Proxy | Nginx | Already on the VPS, SSL termination, path routing |
| SSL | Certbot / Let's Encrypt | HTTPS required for GitHub Camo |
| Font | SpecialElite Regular (.ttf) | Vintage typewriter aesthetic, consistent with Zoltar theme |

---

## File Structure

```
/root/zoltar_api/
├── main.py                    # FastAPI app — /quote, /download, /salve_sua_sorte endpoints
├── fortunes.txt               # Phrase pool (one per line)
├── Zoltar_Filipeta.png        # Base card image (screen version)
├── filipeta_download.png      # Base card image (download version)
├── SpecialElite-Regular.ttf   # Font used for rendering
├── requirements.txt           # Python dependencies
├── grab_files/                # Generated download cards (auto-cleaned after 1h)
├── venv/                      # Python virtual environment
├── zoltar.log                 # Process output log
└── __pycache__/               # Python cache
```

---

## How the API Works

### Endpoints

**`GET /quote`** — Returns the fortune card with a random phrase as a PNG, optimized for on-screen display.

- Base image: `Zoltar_Filipeta.png`
- Text rotated at -11° to simulate the card's tilt in the machine
- Font: SpecialElite, size proportional to 8.5% of the image
- Responds with `Content-Type: image/png` and `Cache-Control: no-cache`
- Side effect: also generates and saves the corresponding download card (same phrase) to `grab_files/` with a random filename, and updates the latest file reference

**`GET /download`** — Returns the download fortune card generated by IP. For direct browser use (outside GitHub).

- Base image: `filipeta_download.png`
- Text with no rotation (0°), centered for direct reading
- `Content-Disposition: attachment` header to force download
- Uses the IP cache system to ensure consistency with `/quote` when accessed from the same browser

**`GET /salve_sua_sorte`** — Serves the last download file generated by `/quote`. This is the endpoint used from GitHub.

- Returns the physical file saved to `grab_files/` by the last `/quote` execution
- Does not depend on IP — solves the desynchronization caused by GitHub Camo (see below)
- `Content-Disposition: attachment` header to force download
- Fallback: if no file exists yet, generates a card with a random fortune

### The GitHub Camo Problem and the Solution

GitHub Camo is a proxy that GitHub uses to serve external images referenced in READMEs. When a visitor accesses the profile, Camo fetches the image on behalf of the visitor, using **Camo's own IP** — not the visitor's real IP.

This created a desynchronization problem between the displayed card and the download:

1. The `<img src="/zoltar/quote">` in Markdown is loaded by Camo → Camo's IP → generates phrase X
2. The visitor clicks the download link → browser opens the URL directly → visitor's real IP → generates phrase Y (different)

The solution was to create the `/salve_sua_sorte` endpoint, which doesn't generate a new phrase — it simply serves the last download file physically saved to disk by `/quote`. Since `/quote` generates and saves both versions (screen + download) with the same phrase, `/salve_sua_sorte` always returns the card matching the last image shown in the README.

The original `/download` endpoint was kept intact for direct browser use, where IP-based caching works correctly (same IP for viewing and downloading).

### IP Cache System

Each visitor is identified by IP (`request.client.host`). When a phrase is generated, it's stored in an in-memory dictionary with a timestamp. Subsequent requests from the same IP within 5 minutes (300 seconds) return the same phrase. This ensures `/quote` and `/download` display the same fortune during a session when accessed directly.

```python
quote_cache = {}
CACHE_TTL = 300  # 5 minutes

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

> **Note on GitHub Camo:** Since Camo proxies requests, the IP that reaches the API is Camo's, not the real visitor's. This means the IP cache doesn't differentiate visitors via GitHub. The `/download` endpoint works correctly for direct browser access (where the real IP is preserved). For the GitHub context, the `/salve_sua_sorte` endpoint solves the desync — see [The GitHub Camo Problem and the Solution](#the-github-camo-problem-and-the-solution).

### Rendering Process

1. Loads the base PNG image with alpha channel (`RGBA`)
2. Loads the SpecialElite font at the configured size
3. Applies word-wrap to the phrase (18 characters per line)
4. Creates a transparent layer the same size as the base image
5. Draws the centered text on this layer
6. Rotates the text layer (screen mode only)
7. Composites the text layer over the base image via `alpha_composite`
8. Serializes the result as PNG to a memory buffer
9. Returns the buffer as `StreamingResponse`

---

## Fortune Pool

Fortunes are stored in `fortunes.txt`, one per line. The file is read on each request (no file caching, only result caching by IP). Sample from the development pool:

```
"O sucesso virá na próxima linha de código."
"Cuidado com os loops infinitos hoje."
"Alguém vai aprovar seu PR sem ler."
"Seu próximo commit será lendário."
"O destino reserva um deploy perfeito para sexta-feira."
```

The production pool contains a significantly larger volume of phrases. To add new ones, simply insert a line in the file and restart the process (or wait for the file to be re-read on the next request with expired TTL).

**Guidelines for new phrases:** keep the humorous tone focused on the dev/tech universe, avoid very long phrases (the 18-character word-wrap handles up to ~80 characters well), and keep the quotes in the file for parsing consistency.

---

## VPS Deployment

### Prerequisites

- VPS with Ubuntu/Debian and root access
- Python 3.10+
- Nginx installed and configured
- Domain with DNS pointing to the VPS
- SSL certificate via Certbot

### Installation

```bash
# 1. Create directory and copy files
mkdir -p /root/zoltar_api
cd /root/zoltar_api

# 2. Create virtual environment
python3 -m venv venv
source venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Test locally
python main.py
# Should show: INFO: Uvicorn running on http://127.0.0.1:8090

# 5. Run in background
nohup /root/zoltar_api/venv/bin/python main.py > zoltar.log 2>&1 &
```

### Verification

```bash
# Confirm it's listening
ss -tlnp | grep 8090

# Local test
curl -o /dev/null -s -w "%{http_code} %{content_type}\n" http://127.0.0.1:8090/quote
# Expected: 200 image/png

# External test (after Nginx config)
curl -o /dev/null -s -w "%{http_code} %{content_type}\n" https://jeff.ia.br/zoltar/quote
# Expected: 200 image/png
```

---

## Nginx Configuration

Zoltar runs as another service behind Nginx on the VPS, in the same config file that serves other projects (`jeff.ia.br`). The relevant block inside the HTTPS `server` block:

```nginx
# =========================
# ZOLTAR
# =========================

# Normalize /zoltar without trailing slash
location = /zoltar { return 301 /zoltar/; }

# ZOLTAR - FastAPI/Uvicorn on port 8090
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

**Important details:**

- The **trailing slash** in `proxy_pass http://127.0.0.1:8090/` is critical — it makes Nginx strip the `/zoltar/` prefix before forwarding to the backend. Without it, FastAPI would receive `/zoltar/quote` instead of `/quote` and return 404.
- The `root_path="/zoltar"` in FastAPI is set so that automatic documentation (Swagger) works correctly under the prefix, without affecting route matching.
- The `location = /zoltar` (no slash) does a 301 redirect to `/zoltar/` to normalize the URL.
- The `^~` ensures this block takes priority over regex locations.

### After Changing Nginx

```bash
# Always test before reloading
nginx -t

# If syntax ok, reload without downtime
systemctl reload nginx
```

---

## Problems Encountered and Solutions

The Zoltar deployment involved several attempts before succeeding. This section documents the issues for future reference.

### 1. Port 8000 already in use

**Problem:** The first attempt to run Uvicorn on port 8000 failed with `[Errno 98] address already in use`.

**Cause:** Another service was already occupying the port on the VPS.

**Solution:** Migrate to port 8090, with no conflicts with other services (Holo on 3001, Lista on 8010, Pega-Pirata on 5000).

### 2. Non-standard port blocked by hosting provider firewall

**Problem:** Running on port 8055 with `ufw allow` didn't work — external requests timed out.

**Cause:** The hosting provider's firewall (not the local `ufw`) blocks ports outside the standard range (80, 443). Additionally, GitHub Camo requires HTTPS with a valid domain, so direct IP:port access would never work for the final use case.

**Solution:** Use Nginx as a reverse proxy on port 443 (already open) with path-based routing.

### 3. Nginx config corrupted by `sed`

**Problem:** Attempting to inject the `location` block via remote `sed` corrupted the config file. Headers ended up with PowerShell values instead of Nginx variables.

**Cause:** Nginx variables (`$host`, `$remote_addr`, etc.) were interpreted as shell/PowerShell variables during `sed` execution, resulting in empty values or garbage like `System.Management.Automation.Internal.Host.InternalHost`.

**Solution:** Abandon `sed` for Nginx config editing. Generate the complete corrected file separately and replace via `cat << 'EOF'` (with single quotes on the delimiter to prevent variable expansion) or direct upload + `nano`.

**Lesson learned:** Never use `sed` to edit files containing `$` as part of their syntax (Nginx, shell scripts, Makefiles) via remote execution. The risk of accidental expansion is too high.

### 4. Dependencies not found in venv

**Problem:** The process died immediately with `ModuleNotFoundError: No module named 'fastapi'`.

**Cause:** `nohup` was executed with the system Python instead of the venv Python.

**Solution:** Use the full path to the venv interpreter: `nohup /root/zoltar_api/venv/bin/python main.py`.

### 5. Error 405 Method Not Allowed during testing

**Problem:** `curl -I` returned 405.

**Cause:** The `-I` flag sends a `HEAD` request, and the FastAPI endpoint only accepted `GET`.

**Solution:** Not a bug — test with `curl -o /dev/null -s -w "%{http_code}"` instead of `curl -I`.

### 6. Fortune desync between screen card and download (GitHub Camo)

**Problem:** The fortune card shown in the README displayed a different phrase than the card obtained via the download link.

**Cause:** GitHub Camo proxies images using its own IP. When `<img src>` loads `/quote`, the IP reaching the API is Camo's. When the visitor clicks the `/download` link, the browser makes a direct request with the visitor's real IP. Since the cache is IP-based, each received a different phrase.

**Solution:** Create the `/salve_sua_sorte` endpoint. `/quote` now, in addition to returning the screen image, saves the corresponding download card (same phrase) as a physical file in `grab_files/` with a random name. `/salve_sua_sorte` serves that file directly, without depending on IP. The original `/download` endpoint was kept intact for direct browser use, where IP caching works correctly.

**Lesson learned:** Any system that depends on IP to synchronize state between proxied images and direct links on GitHub will fail. Camo breaks the assumption of "same visitor = same IP".

---

## Maintenance and Operations

### Check if Zoltar is running

```bash
ss -tlnp | grep 8090
```

If it returns nothing, the process crashed. Start it again:

```bash
nohup /root/zoltar_api/venv/bin/python /root/zoltar_api/main.py > /root/zoltar_api/zoltar.log 2>&1 &
```

### View logs

```bash
tail -f /root/zoltar_api/zoltar.log
```

### Restart the service

```bash
# Find the PID
pgrep -f "zoltar_api/main.py"

# Kill the process
kill <PID>

# Start again
nohup /root/zoltar_api/venv/bin/python /root/zoltar_api/main.py > /root/zoltar_api/zoltar.log 2>&1 &
```

### Update the fortune pool

Edit `/root/zoltar_api/fortunes.txt` (one phrase per line). The file is re-read on each request with expired TTL, but to be safe, restart the process.

### Make the service persistent (survive reboot)

To ensure Zoltar starts automatically after a VPS reboot, create a systemd service:

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

From then on, manage with `systemctl start|stop|restart|status zoltar`.

---

## Adapting for Other Projects

This system can be adapted for any scenario where you want to display dynamic content in a GitHub README (or any rendered Markdown that accepts `<img src>`). The core logic is simple:

1. **An endpoint that returns an image** — can be PNG, JPEG, or GIF. The `Content-Type` must be correct.
2. **HTTPS with a valid domain** — required for GitHub Camo to accept the image.
3. **Server-side generation** — any content that varies (phrases, data, charts, badges) must be rendered on the server and returned as an image.

### Adaptation examples

- **Quote of the Day** — same concept, different pool, without the Markdown page flow
- **Dynamic stats** — render project or API metrics on an image template
- **Custom badges** — go beyond shields.io with proprietary visual designs
- **Mini-games in Markdown** — each game "state" is a different `.md` file, with images generated based on the state

### What to swap

| Component | What changes |
|-----------|-------------|
| `fortunes.txt` | Your content pool (phrases, data, etc.) |
| `Zoltar_Filipeta.png` | Your base/template image |
| Coordinates and rotation in `main.py` | Text position and angle on your image |
| `SpecialElite-Regular.ttf` | Your preferred font |
| Port in `main.py` and Nginx | Any free port on your server |
| Path in Nginx (`/zoltar/`) | Whatever path makes sense for your project |

---

<div align="center">

*Documentation generated in March/2026.*
*Zoltar says your next deploy will be legendary.* 🔮

</div>
