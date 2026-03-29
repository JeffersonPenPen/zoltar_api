import io
import random
import textwrap
import os
import time
import uuid
from fastapi import FastAPI, Response, Request
from fastapi.responses import StreamingResponse, FileResponse
from PIL import Image, ImageDraw, ImageFont

# Configurado para rodar atrás do Nginx no domínio jeff.ia.br/zoltar
app = FastAPI(root_path="/zoltar")

SCREEN_IMG = "Zoltar_Filipeta.png"
DOWNLOAD_IMG = "filipeta_download.png"
FONT_PATH = "SpecialElite-Regular.ttf"
GRAB_DIR = "grab_files"

# Criar pasta para arquivos de download gerados
os.makedirs(GRAB_DIR, exist_ok=True)

quote_cache = {}
CACHE_TTL = 300

# Referência para o último arquivo gerado pelo /quote
latest_grab = {"filename": None}

def get_user_quote(ip: str):
    now = time.time()
    if ip in quote_cache:
        quote, ts = quote_cache[ip]
        if now - ts < CACHE_TTL:
            return quote
    fortunes = load_fortunes()
    new_quote = random.choice(fortunes)
    quote_cache[ip] = (new_quote, now)
    return new_quote

def load_fortunes():
    try:
        with open("fortunes.txt", "r", encoding="utf-8") as file:
            return [line.strip() for line in file if line.strip()]
    except FileNotFoundError:
        return ["O futuro é incerto, mas seu código não compila."]

def generate_fortune_image(mode: str, fortune: str):
    if mode == "screen":
        base_path = SCREEN_IMG
        angle = -11
        center_x, center_y = 451, 591
        text_color = (60, 60, 60, 255)
        font_size = 40
        wrap_width = 18
    else:
        base_path = DOWNLOAD_IMG
        angle = 0
        center_x, center_y = 257, 512
        text_color = (40, 40, 40, 255)
        font_size = 37
        wrap_width = 18

    img = Image.open(base_path).convert("RGBA")
    try:
        font = ImageFont.truetype(FONT_PATH, font_size)
    except:
        font = ImageFont.load_default()

    wrapped_text = textwrap.fill(fortune, width=wrap_width)
    txt_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(txt_layer)
    draw.multiline_text((center_x, center_y), wrapped_text, fill=text_color, font=font, anchor="mm", align="center", spacing=10)
    
    if angle != 0:
        txt_layer = txt_layer.rotate(angle, resample=Image.BICUBIC, center=(center_x, center_y))
    
    final_img = Image.alpha_composite(img, txt_layer)
    buf = io.BytesIO()
    final_img.save(buf, format="PNG")
    buf.seek(0)
    return buf

def cleanup_old_grabs(max_age=3600):
    """Remove arquivos de grab com mais de 1 hora."""
    now = time.time()
    for f in os.listdir(GRAB_DIR):
        filepath = os.path.join(GRAB_DIR, f)
        if os.path.isfile(filepath) and now - os.path.getmtime(filepath) > max_age:
            os.remove(filepath)

@app.get("/quote")
async def get_quote(request: Request):
    ip = request.client.host
    fortune = get_user_quote(ip)

    # Gera e salva a filipeta de download correspondente
    dl_buf = generate_fortune_image("download", fortune)
    filename = f"dl_{uuid.uuid4().hex[:8]}.png"
    filepath = os.path.join(GRAB_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(dl_buf.read())
    latest_grab["filename"] = filename

    # Limpa arquivos antigos periodicamente
    cleanup_old_grabs()

    return StreamingResponse(generate_fortune_image("screen", fortune), media_type="image/png", headers={"Cache-Control": "no-cache"})

@app.get("/download")
async def download_quote(request: Request):
    ip = request.client.host
    fortune = get_user_quote(ip)
    return StreamingResponse(generate_fortune_image("download", fortune), media_type="image/png", headers={"Content-Disposition": 'attachment; filename="Sorte_Zoltar.png"'})

@app.get("/salve_sua_sorte")
async def salve_sua_sorte():
    if latest_grab["filename"]:
        filepath = os.path.join(GRAB_DIR, latest_grab["filename"])
        if os.path.exists(filepath):
            return FileResponse(
                filepath,
                media_type="image/png",
                headers={"Content-Disposition": 'attachment; filename="Sorte_Zoltar.png"'}
            )
    # Fallback: se não tem arquivo ainda, gera um genérico
    fortune = random.choice(load_fortunes())
    return StreamingResponse(generate_fortune_image("download", fortune), media_type="image/png", headers={"Content-Disposition": 'attachment; filename="Sorte_Zoltar.png"'})

if __name__ == "__main__":
    import uvicorn
    # Rodando na porta 8090 conforme configurado no VPS
    uvicorn.run(app, host="127.0.0.1", port=8090)