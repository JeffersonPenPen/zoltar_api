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

const BG_IMAGE_URL = 'https://raw.githubusercontent.com/JeffersonPenPen/zoltar_api/main/public/FilipetaQuote.png';
const IMG_WIDTH = 248;
const IMG_HEIGHT = 494;

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

function createSvg(quote, author) {
    const fontSize = 16;
    const authorFontSize = 14;
    const maxChars = 20;
    const lineSpacing = fontSize * 1.4;

    const lines = breakText(quote, maxChars);
    const authorLine = `- ${author}`;

    const totalTextHeight = (lines.length * lineSpacing) + (authorFontSize * 1.5);
    const startY = (IMG_HEIGHT / 2) - (totalTextHeight / 2);

    let textElements = '';
    lines.forEach((line, index) => {
        const y = startY + (index * lineSpacing);
        textElements += `    <text x="${IMG_WIDTH / 2}" y="${y}" font-size="${fontSize}" font-family="Georgia, serif" fill="#2c2c2c" text-anchor="middle" dominant-baseline="middle">${line}</text>\n`;
    });

    const authorY = startY + (lines.length * lineSpacing) + 5;
    textElements += `    <text x="${IMG_WIDTH / 2}" y="${authorY}" font-size="${authorFontSize}" font-family="Georgia, serif" fill="#333" text-anchor="middle" dominant-baseline="middle" font-style="italic">${authorLine}</text>\n`;

    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${IMG_WIDTH}" height="${IMG_HEIGHT}" viewBox="0 0 ${IMG_WIDTH} ${IMG_HEIGHT}">
  <image href="${BG_IMAGE_URL}" width="${IMG_WIDTH}" height="${IMG_HEIGHT}"/>
${textElements}</svg>`;
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
        return response.status(200).send(svg);

    } catch (error) {
        console.error("ERRO NO QUOTE:", error);
        return response.status(500).json({ error: error.message });
    }
}
