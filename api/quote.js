import { kv } from '@vercel/kv';
import quotes from '../quotes.json';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';

const imageUrls = {
    fortune_template: 'https://i.ibb.co/KzbD2f4R/Filipeta-Quote.png'
};

export default async function handler(request, response) {
    const ip = (request.headers['x-forwarded-for'] || '127.0.0.1').split(',')[0].trim();

    try {
        // Lock 24h: se já tem quote no KV para o IP, retornar aquela
        let finalQuote = await kv.get(`last-quote:${ip}`);

        if (!finalQuote) {
            // Seleção aleatória
            const randomIndex = Math.floor(Math.random() * quotes.length);
            finalQuote = quotes[randomIndex];
            // Gravar no KV com TTL 24h
            await kv.set(`last-quote:${ip}`, finalQuote, { ex: 86400 });
        }

        const baseImageResponse = await fetch(imageUrls.fortune_template);
        const baseImageBuffer = await baseImageResponse.arrayBuffer();

        const maxCharsPerLine = 30;
        let line = '';
        let formattedText = '';
        for (const word of finalQuote.quote.split(' ')) {
            if ((line + word).length > maxCharsPerLine) {
                formattedText += `<tspan x="50%" dy="1.2em">${line.trim()}</tspan>`;
                line = '';
            }
            line += `${word} `;
        }
        formattedText += `<tspan x="50%" dy="1.2em">${line.trim()}</tspan>`;
        formattedText += `<tspan x="50%" dy="1.8em" class="author">- ${finalQuote.source}</tspan>`;

        const textSvg = `
            <svg width="400" height="300">
                <style>
                    text { font-size: 28px; font-family: 'Special Elite', serif, sans-serif; fill: #2c2c2c; text-anchor: middle; }
                    .author { font-size: 24px; font-style: italic; }
                </style>
                <text x="50%" y="40%">${formattedText}</text>
            </svg>
        `;

        const finalImageBuffer = await sharp(Buffer.from(baseImageBuffer))
            .composite([{
                input: Buffer.from(textSvg),
                top: 250,
                left: 70
            }])
            .png().toBuffer();

        response.setHeader('Content-Type', 'image/png');
        response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return response.status(200).end(finalImageBuffer);

    } catch (error) {
        console.error("ERRO NO QUOTE:", error);
        return response.status(500).send("Erro ao gerar a imagem.");
    }
}
