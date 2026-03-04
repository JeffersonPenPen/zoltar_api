import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const quotes = require('../quotes.json');

let kv = null;
try {
    const kvModule = await import('@vercel/kv');
    kv = kvModule.kv;
} catch (e) {
    console.warn('KV not available, running without cache');
}
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FORTUNE_TEMPLATE_PATH = path.join(__dirname, '..', 'public', 'FilipetaQuote.png');

async function getLocalImageBuffer() {
    try {
        const buffer = await fs.readFile(FORTUNE_TEMPLATE_PATH);
        return buffer;
    } catch (error) {
        console.error("Erro ao ler o arquivo local:", error);
        throw new Error(`Failed to read local image file: ${FORTUNE_TEMPLATE_PATH}`);
    }
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

function createDownloadTextSvg(quote, author) {
    const config = {
        width: 240,
        height: 400,
        fontSize: 18,
        authorFontSize: 16,
        maxChars: 22
    };

    const lines = breakText(quote, config.maxChars);
    const authorLine = `- ${author}`;
    
    const lineSpacing = config.fontSize * 1.2;
    const totalHeight = (lines.length * lineSpacing) + (config.authorFontSize * 1.5);
    const startY = (config.height / 2) - (totalHeight / 2) + (config.fontSize / 2);
    
    let textElements = '';
    
    lines.forEach((line, index) => {
        const y = startY + (index * lineSpacing);
        textElements += `<text x="50%" y="${y}" font-size="${config.fontSize}px" class="quote">${line}</text>\n`;
    });
    
    const authorY = startY + (lines.length * lineSpacing);
    textElements += `<text x="50%" y="${authorY}" font-size="${config.authorFontSize}px" class="author">${authorLine}</text>\n`;
    
    return `<svg width="${config.width}" height="${config.height}" xmlns="http://www.w3.org/2000/svg">
        <style>
            text {
                font-family: 'Special Elite', monospace;
                fill: #2c2c2c;
                text-anchor: middle;
                dominant-baseline: middle;
            }
            .author {
                font-style: italic;
                fill: #333;
            }
        </style>
        ${textElements}
    </svg>`;
}

export default async function handler(request, response) {
    const ip = (request.headers['x-forwarded-for'] || '127.0.0.1').split(',')[0].trim();

    try {
        let finalQuote = null;

        // If index is provided (from fortune page link), use that specific quote
        const indexParam = request.query?.index;
        if (indexParam !== undefined && indexParam !== null) {
            const idx = parseInt(indexParam, 10);
            if (idx >= 0 && idx < quotes.length) {
                finalQuote = quotes[idx];
            }
        }

        // Fallback: try KV, then random
        if (!finalQuote) {
            if (kv) {
                try {
                    finalQuote = await kv.get(`last-quote:${ip}`);
                } catch (kvErr) {
                    console.warn('KV get failed:', kvErr.message);
                }
            }
        }
        if (!finalQuote) {
            const randomIndex = Math.floor(Math.random() * quotes.length);
            finalQuote = quotes[randomIndex];
        }

        const baseImageBuffer = await getLocalImageBuffer();
        const textSvg = createDownloadTextSvg(finalQuote.quote, finalQuote.source);
        const textPngBuffer = await sharp(Buffer.from(textSvg)).png().toBuffer();

        const { width: textWidth, height: textHeight } = await sharp(textPngBuffer).metadata();
        const left = Math.round((248 - textWidth) / 2);
        const top = Math.round((494 - textHeight) / 2);
        
        const finalImageBuffer = await sharp(baseImageBuffer)
            .composite([{
                input: textPngBuffer,
                top: top,
                left: left
            }])
            .png()
            .toBuffer();

        response.setHeader('Content-Disposition', 'attachment; filename="sua-sorte-zoltar.png"');
        response.setHeader('Content-Type', 'image/png');
        response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return response.status(200).end(finalImageBuffer);

    } catch (error) {
        console.error("ERRO NO /api/download-quote:", error);
        return response.status(500).json({
            error: 'Erro interno da API de download',
            message: error.message
        });
    }
}