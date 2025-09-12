import { kv } from '@vercel/kv';
import quotes from '../quotes.json';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';

const imageUrls = {
    // A nova imagem da filipeta limpa para o download
    fortune_template: 'https://i.ibb.co/KzbD2f4R/Filipeta-Quote.png' 
};

export default async function handler(request, response) {
    const ip = (request.headers['x-forwarded-for'] || '127.0.0.1').split(',')[0].trim();

    try {
        const lastQuote = await kv.get(`last-quote:${ip}`);
        const finalQuote = lastQuote || quotes[0]; 

        const baseImageResponse = await fetch(imageUrls.fortune_template);
        const baseImageBuffer = await baseImageResponse.arrayBuffer();
        
        const maxCharsPerLine = 30; // Mais espaço na filipeta limpa
        let line = '';
        let formattedText = '';
        for (const word of finalQuote.text.split(' ')) {
            if ((line + word).length > maxCharsPerLine) {
                formattedText += `<tspan x="50%" dy="1.2em">${line.trim()}</tspan>`;
                line = '';
            }
            line += `${word} `;
        }
        formattedText += `<tspan x="50%" dy="1.2em">${line.trim()}</tspan>`;
        formattedText += `<tspan x="50%" dy="1.8em" class="author">- ${finalQuote.author}</tspan>`;
        
        const textSvg = `
            <svg width="400" height="300">
                <style>
                    text { font-size: 28px; font-family: 'Special Elite'; fill: #2c2c2c; text-anchor: middle; }
                    .author { font-size: 24px; font-style: italic; }
                </style>
                <text x="50%" y="40%">${formattedText}</text>
            </svg>
        `;

        const finalImageBuffer = await sharp(Buffer.from(baseImageBuffer))
            .composite([{ 
                input: Buffer.from(textSvg),
                top: 250,  // Novas coordenadas para a filipeta limpa
                left: 70
            }])
            .png().toBuffer();

        response.setHeader('Content-Disposition', 'attachment; filename="sua-sorte-zoltar.png"');
        response.setHeader('Content-Type', 'image/png');
        return response.status(200).end(finalImageBuffer);

    } catch (error) {
        console.error("ERRO NO DOWNLOAD:", error);
        return response.status(500).send("Erro ao gerar a imagem para download.");
    }
}