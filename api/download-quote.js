import { kv } from '@vercel/kv';
import quotes from '../quotes.json';
import sharp from 'sharp';
import fs from 'fs/promises';

const FORTUNE_TEMPLATE_PATH = './public/FilipetaQuote.png';

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
        width: 250,
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
        const lastQuote = await kv.get(`last-quote:${ip}`);
        const finalQuote = lastQuote || quotes[0];

        const baseImageBuffer = await getLocalImageBuffer();
        const textSvg = createDownloadTextSvg(finalQuote.text, finalQuote.author);
        const textPngBuffer = await sharp(Buffer.from(textSvg)).png().toBuffer();

        const { width: textWidth, height: textHeight } = await sharp(textPngBuffer).metadata();
        const left = Math.round((250 - textWidth) / 2);
        const top = Math.round((400 - textHeight) / 2);
        
        const finalImageBuffer = await sharp(baseImageBuffer)
            .composite([{
                input: textPngBuffer,
                top: top + 100,
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