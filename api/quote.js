import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const quotes = require('../quotes.json');

let kv = null;
try {
    const kvModule = await import('@vercel/kv');
    kv = kvModule.kv;
} catch (e) {
    console.warn('KV not available');
}

const WIDTH = 280;
const HEIGHT = 460;

function breakText(text, maxChars) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';
    for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        if (testLine.length > maxChars && currentLine) {
            lines.push(currentLine.trim());
            currentLine = word;
        } else {
            currentLine = testLine;
        }
    }
    if (currentLine) lines.push(currentLine.trim());
    return lines;
}

function escapeXml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function createSvg(quote, author) {
    const cx = WIDTH / 2;
    const fontSize = 13;
    const authorFontSize = 11;
    const maxChars = 26;
    const lineSpacing = fontSize * 1.5;

    const lines = breakText(escapeXml(quote), maxChars);
    const authorLine = `— ${escapeXml(author)}`;

    const totalTextHeight = (lines.length * lineSpacing) + (authorFontSize * 2);
    const textCenterY = HEIGHT / 2 + 10;
    const startY = textCenterY - (totalTextHeight / 2) + fontSize;

    let textElements = '';
    lines.forEach((line, index) => {
        const y = startY + (index * lineSpacing);
        textElements += `    <text x="${cx}" y="${y}" class="q">${line}</text>\n`;
    });

    const authorY = startY + (lines.length * lineSpacing) + 10;
    textElements += `    <text x="${cx}" y="${authorY}" class="a">${authorLine}</text>\n`;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f5e6a8"/>
      <stop offset="50%" stop-color="#f0dfa0"/>
      <stop offset="100%" stop-color="#e8d490"/>
    </linearGradient>
    <clipPath id="card">
      <rect x="8" y="8" width="${WIDTH - 16}" height="${HEIGHT - 16}" rx="4"/>
    </clipPath>
  </defs>

  <!-- Dark background -->
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#1a1a1a"/>

  <!-- Card body - yellow/cream like real filipeta -->
  <rect x="8" y="8" width="${WIDTH - 16}" height="${HEIGHT - 16}" rx="4" fill="url(#bg)" stroke="#2a2008" stroke-width="2.5"/>

  <!-- Inner border frame -->
  <rect x="16" y="16" width="${WIDTH - 32}" height="${HEIGHT - 32}" rx="2" fill="none" stroke="#2a2008" stroke-width="1.2"/>

  <!-- Top thick decorative bar -->
  <rect x="22" y="22" width="${WIDTH - 44}" height="6" fill="#2a2008"/>
  <rect x="22" y="32" width="${WIDTH - 44}" height="2" fill="#2a2008"/>

  <!-- Bottom thick decorative bar -->
  <rect x="22" y="${HEIGHT - 28}" width="${WIDTH - 44}" height="6" fill="#2a2008"/>
  <rect x="22" y="${HEIGHT - 34}" width="${WIDTH - 44}" height="2" fill="#2a2008"/>

  <!-- Corner ornaments - top left -->
  <line x1="16" y1="38" x2="40" y2="38" stroke="#2a2008" stroke-width="1"/>
  <line x1="38" y1="16" x2="38" y2="40" stroke="#2a2008" stroke-width="1"/>
  <rect x="34" y="34" width="8" height="8" fill="#2a2008"/>

  <!-- Corner ornaments - top right -->
  <line x1="${WIDTH - 16}" y1="38" x2="${WIDTH - 40}" y2="38" stroke="#2a2008" stroke-width="1"/>
  <line x1="${WIDTH - 38}" y1="16" x2="${WIDTH - 38}" y2="40" stroke="#2a2008" stroke-width="1"/>
  <rect x="${WIDTH - 42}" y="34" width="8" height="8" fill="#2a2008"/>

  <!-- Corner ornaments - bottom left -->
  <line x1="16" y1="${HEIGHT - 38}" x2="40" y2="${HEIGHT - 38}" stroke="#2a2008" stroke-width="1"/>
  <line x1="38" y1="${HEIGHT - 16}" x2="38" y2="${HEIGHT - 40}" stroke="#2a2008" stroke-width="1"/>
  <rect x="34" y="${HEIGHT - 42}" width="8" height="8" fill="#2a2008"/>

  <!-- Corner ornaments - bottom right -->
  <line x1="${WIDTH - 16}" y1="${HEIGHT - 38}" x2="${WIDTH - 40}" y2="${HEIGHT - 38}" stroke="#2a2008" stroke-width="1"/>
  <line x1="${WIDTH - 38}" y1="${HEIGHT - 16}" x2="${WIDTH - 38}" y2="${HEIGHT - 40}" stroke="#2a2008" stroke-width="1"/>
  <rect x="${WIDTH - 42}" y="${HEIGHT - 42}" width="8" height="8" fill="#2a2008"/>

  <!-- ZOLTAR title -->
  <text x="${cx}" y="68" text-anchor="middle" font-family="'Times New Roman',Georgia,serif" font-size="36" font-weight="bold" fill="#2a2008" letter-spacing="4">ZOLTAR</text>

  <!-- Decorative line under ZOLTAR -->
  <line x1="50" y1="78" x2="${WIDTH - 50}" y2="78" stroke="#2a2008" stroke-width="1"/>

  <!-- Central oval medallion -->
  <ellipse cx="${cx}" cy="${HEIGHT / 2 + 10}" rx="105" ry="130" fill="none" stroke="#2a2008" stroke-width="2"/>
  <ellipse cx="${cx}" cy="${HEIGHT / 2 + 10}" rx="98" ry="123" fill="none" stroke="#2a2008" stroke-width="0.7"/>

  <!-- Zodiac/mystical symbols around the oval -->
  <text x="${cx}" y="108" text-anchor="middle" font-size="14" fill="#2a2008" opacity="0.4" font-family="serif">&#9788; &#9790; &#10017; &#9733;</text>
  <text x="${cx - 80}" y="${HEIGHT / 2 + 10}" text-anchor="middle" font-size="10" fill="#2a2008" opacity="0.3" font-family="serif" transform="rotate(-90,${cx - 80},${HEIGHT / 2 + 10})">&#9733; &#9790; &#10022;</text>
  <text x="${cx + 80}" y="${HEIGHT / 2 + 10}" text-anchor="middle" font-size="10" fill="#2a2008" opacity="0.3" font-family="serif" transform="rotate(90,${cx + 80},${HEIGHT / 2 + 10})">&#10022; &#9790; &#9733;</text>

  <!-- Decorative line above SPEAKS -->
  <line x1="50" y1="${HEIGHT - 68}" x2="${WIDTH - 50}" y2="${HEIGHT - 68}" stroke="#2a2008" stroke-width="1"/>

  <!-- SPEAKS title -->
  <text x="${cx}" y="${HEIGHT - 44}" text-anchor="middle" font-family="'Times New Roman',Georgia,serif" font-size="30" font-weight="bold" fill="#2a2008" letter-spacing="6">SPEAKS</text>

  <!-- Quote text styles -->
  <style>
    .q { font-family: Georgia,serif; font-size: ${fontSize}px; fill: #2a2008; text-anchor: middle; }
    .a { font-family: Georgia,serif; font-size: ${authorFontSize}px; fill: #4a3a18; text-anchor: middle; font-style: italic; }
  </style>

  <!-- Fortune text inside oval -->
${textElements}
</svg>`;
}

export default async function handler(request, response) {
    const ip = (request.headers['x-forwarded-for'] || '127.0.0.1').split(',')[0].trim();

    try {
        let finalQuote = null;

        if (kv) {
            try {
                finalQuote = await kv.get(`last-quote:${ip}`);
            } catch (kvErr) {
                console.warn('KV get failed:', kvErr.message);
            }
        }

        if (!finalQuote) {
            const randomIndex = Math.floor(Math.random() * quotes.length);
            finalQuote = quotes[randomIndex];

            if (kv) {
                try {
                    await kv.set(`last-quote:${ip}`, finalQuote, { ex: 86400 });
                } catch (kvErr) {
                    console.warn('KV set failed:', kvErr.message);
                }
            }
        }

        const svg = createSvg(finalQuote.quote, finalQuote.source);

        response.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
        response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        response.setHeader('Pragma', 'no-cache');
        response.setHeader('Expires', '0');
        return response.status(200).send(svg);

    } catch (error) {
        console.error("ERRO NO QUOTE:", error);
        return response.status(500).json({ error: error.message });
    }
}
