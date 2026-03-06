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
    const fontSize = 15;
    const authorFontSize = 12;
    const maxChars = 24;
    const lineSpacing = fontSize * 1.6;

    const lines = breakText(escapeXml(quote), maxChars);
    const authorLine = `— ${escapeXml(author)}`;

    const totalTextHeight = (lines.length * lineSpacing) + (authorFontSize * 2.5);
    const startY = (HEIGHT / 2) - (totalTextHeight / 2) + fontSize;

    let textElements = '';
    lines.forEach((line, index) => {
        const y = startY + (index * lineSpacing);
        textElements += `    <text x="${WIDTH / 2}" y="${y}" class="q">${line}</text>\n`;
    });

    const authorY = startY + (lines.length * lineSpacing) + 14;
    textElements += `    <text x="${WIDTH / 2}" y="${authorY}" class="a">${authorLine}</text>\n`;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f7edd0"/>
      <stop offset="100%" stop-color="#e8d5a8"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#1a1a2e"/>
  <rect x="12" y="12" width="${WIDTH - 24}" height="${HEIGHT - 24}" rx="6" fill="url(#bg)" stroke="#b8963a" stroke-width="1.5"/>
  <rect x="20" y="20" width="${WIDTH - 40}" height="${HEIGHT - 40}" rx="3" fill="none" stroke="#c9a84c" stroke-width="0.7" stroke-dasharray="5,4"/>
  <text x="${WIDTH / 2}" y="58" text-anchor="middle" font-size="24" fill="#8b6914" opacity="0.7" font-family="serif">&#10022;</text>
  <text x="${WIDTH / 2}" y="82" text-anchor="middle" font-size="10" fill="#8b6914" font-family="Georgia,serif" letter-spacing="4">SUA SORTE</text>
  <line x1="55" y1="94" x2="${WIDTH - 55}" y2="94" stroke="#c9a84c" stroke-width="0.6" opacity="0.5"/>
  <style>
    .q { font-family: Georgia,serif; font-size: ${fontSize}px; fill: #3d2b1f; text-anchor: middle; }
    .a { font-family: Georgia,serif; font-size: ${authorFontSize}px; fill: #6b4c2a; text-anchor: middle; font-style: italic; }
  </style>
${textElements}
  <line x1="55" y1="${HEIGHT - 65}" x2="${WIDTH - 55}" y2="${HEIGHT - 65}" stroke="#c9a84c" stroke-width="0.6" opacity="0.5"/>
  <text x="${WIDTH / 2}" y="${HEIGHT - 38}" text-anchor="middle" font-size="18" fill="#8b6914" opacity="0.5" font-family="serif">&#9790;</text>
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
