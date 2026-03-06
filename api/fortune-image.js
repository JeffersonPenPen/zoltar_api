import { createRequire } from 'module';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const quotes = require('../quotes.json');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const zoltarBgPath = path.join(__dirname, '..', 'public', 'Zoltar_Filipeta.png');
const bgBuffer = fs.readFileSync(zoltarBgPath);

const ROTATION_DEG = 11.25;

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

function createTextSvg(quote, author) {
    const width = 560;
    const height = 600;
    const fontSize = 40;
    const authorFontSize = 35;
    const maxChars = 22;
    const lineSpacing = fontSize * 1.2;

    const lines = breakText(quote, maxChars);
    const authorLine = `- ${author}`;

    const totalHeight = (lines.length * lineSpacing) + (authorFontSize * 2);
    const startY = (height / 2) - (totalHeight / 2) + (fontSize / 2);

    let textElements = '';
    lines.forEach((line, index) => {
        const y = startY + (index * lineSpacing);
        textElements += `<text x="50%" y="${y}" font-size="${fontSize}px" class="quote">${line}</text>\n`;
    });

    const authorY = startY + (lines.length * lineSpacing) + 8;
    textElements += `<text x="50%" y="${authorY}" font-size="${authorFontSize}px" class="author">${authorLine}</text>\n`;

    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <style>
            text {
                font-family: 'Special Elite', monospace;
                fill: #2c2c2c;
                text-anchor: middle;
                dominant-baseline: middle;
            }
            .author {
                font-style: italic;
                fill: #444;
            }
        </style>
        ${textElements}
    </svg>`;
}

export default async function handler(request, response) {
    try {
        const indexParam = request.query?.index;
        let idx = Math.floor(Math.random() * quotes.length);

        if (indexParam !== undefined && indexParam !== null) {
            const parsed = parseInt(indexParam, 10);
            if (parsed >= 0 && parsed < quotes.length) {
                idx = parsed;
            }
        }

        const q = quotes[idx];

        const textSvg = createTextSvg(q.quote, q.source);
        const textPng = await sharp(Buffer.from(textSvg))
            .ensureAlpha()
            .png()
            .toBuffer();

        const rotatedText = await sharp(textPng)
            .rotate(ROTATION_DEG, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .ensureAlpha()
            .png()
            .toBuffer();

        const rotMeta = await sharp(rotatedText).metadata();

        const centerX = 450;
        const centerY = 588;
        const left = Math.round(centerX - rotMeta.width / 2);
        const top = Math.round(centerY - rotMeta.height / 2);

        const composite = await sharp(bgBuffer)
            .composite([{
                input: rotatedText,
                top: top,
                left: left
            }])
            .jpeg({ quality: 80 })
            .toBuffer();

        response.setHeader('Content-Type', 'image/jpeg');
        response.setHeader('Content-Length', composite.length);
        response.setHeader('Cache-Control', 'public, max-age=86400');
        return response.status(200).end(composite);

    } catch (error) {
        console.error("ERRO NO FORTUNE-IMAGE:", error);
        return response.status(500).json({ error: error.message });
    }
}
