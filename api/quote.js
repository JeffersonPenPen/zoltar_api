import { createRequire } from 'module';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const quotes = require('../quotes.json');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filipetaPath = path.join(__dirname, '..', 'public', 'FilipetaQuote.png');
const bgBuffer = fs.readFileSync(filipetaPath);

let kv = null;
try {
    const kvModule = await import('@vercel/kv');
    kv = kvModule.kv;
} catch (e) {
    console.warn('KV not available');
}

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

function createTextSvg(quote, author, imgWidth, imgHeight) {
    const fontSize = 16;
    const authorFontSize = 14;
    const maxChars = 20;
    const lineSpacing = fontSize * 1.4;

    const lines = breakText(escapeXml(quote), maxChars);
    const authorLine = `— ${escapeXml(author)}`;

    const totalTextHeight = (lines.length * lineSpacing) + (authorFontSize * 1.5);
    const startY = (imgHeight / 2) - (totalTextHeight / 2);

    let textElements = '';
    lines.forEach((line, index) => {
        const y = startY + (index * lineSpacing);
        textElements += `<text x="50%" y="${y}" font-size="${fontSize}px" class="q">${line}</text>\n`;
    });

    const authorY = startY + (lines.length * lineSpacing) + 5;
    textElements += `<text x="50%" y="${authorY}" font-size="${authorFontSize}px" class="a">${authorLine}</text>\n`;

    return `<svg width="${imgWidth}" height="${imgHeight}" xmlns="http://www.w3.org/2000/svg">
        <style>
            .q { font-family: Georgia, serif; fill: #2c2c2c; text-anchor: middle; dominant-baseline: middle; }
            .a { font-family: Georgia, serif; fill: #333; text-anchor: middle; dominant-baseline: middle; font-style: italic; }
        </style>
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

        const meta = await sharp(bgBuffer).metadata();
        const textSvg = createTextSvg(finalQuote.quote, finalQuote.source, meta.width, meta.height);

        const finalImage = await sharp(bgBuffer)
            .composite([{
                input: Buffer.from(textSvg),
                top: 0,
                left: 0
            }])
            .png()
            .toBuffer();

        response.setHeader('Content-Type', 'image/png');
        response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        response.setHeader('Pragma', 'no-cache');
        response.setHeader('Expires', '0');
        return response.status(200).end(finalImage);

    } catch (error) {
        console.error("ERRO NO QUOTE:", error);
        return response.status(500).json({ error: error.message });
    }
}
