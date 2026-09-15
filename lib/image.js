import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const TEMPLATE_PATH = path.join(process.cwd(), 'assets', 'template-feed-IG.png');

// Template 850x850, area krem tengah:
// Estimasi aman: x 140-710 (w 570), y 180-620 (h 440)
// Kita pakai SVG 850x850 full dan center text di 425, 400
const CANVAS_W = 850;
const CANVAS_H = 850;
const TEXT_AREA_W = 520;
const TEXT_CENTER_X = 425;
const TEXT_CENTER_Y = 390; // tengah area krem (sedikit ke atas karena ada masjid di bawah)

function escapeXml(s) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function wrapWords(text, maxCharsPerLine) {
  const words = text.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (test.length <= maxCharsPerLine) {
      cur = test;
    } else {
      if (cur) lines.push(cur);
      // jika satu kata lebih panjang dari max, pecah paksa
      if (w.length > maxCharsPerLine) {
        let rest = w;
        while (rest.length > maxCharsPerLine) {
          lines.push(rest.slice(0, maxCharsPerLine));
          rest = rest.slice(maxCharsPerLine);
        }
        cur = rest;
      } else {
        cur = w;
      }
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * Generate feed image buffer (jpeg) dari text hadis.
 * @param {string} textId - teks hadis bahasa Indonesia (<=180 char)
 * @param {string} grade - opsional untuk footer kecil
 * @param {string} takhrij - opsional
 * @returns {Promise<Buffer>}
 */
export async function generateFeedImage(textId, grade = '', takhrij = '') {
  const t = textId.trim();

  // pilih font size adaptif: 180 char ~ 7-8 baris, jadi kecilin
  const len = t.length;
  let fontSize = 26;
  let maxCharsPerLine = 30;
  if (len <= 80) {
    fontSize = 28;
    maxCharsPerLine = 28;
  } else if (len <= 120) {
    fontSize = 26;
    maxCharsPerLine = 30;
  } else if (len <= 150) {
    fontSize = 24;
    maxCharsPerLine = 33;
  } else {
    fontSize = 22;
    maxCharsPerLine = 35;
  }

  const lineHeightEm = 1.45;
  const lines = wrapWords(t, maxCharsPerLine);

  // batasi max 9 baris agar tidak overflow; jika lebih, truncate baris terakhir
  const MAX_LINES = 9;
  let displayLines = lines;
  if (lines.length > MAX_LINES) {
    displayLines = lines.slice(0, MAX_LINES);
    displayLines[MAX_LINES - 1] = displayLines[MAX_LINES - 1].replace(/…?$/, '…');
  }

  const totalTextHeight = displayLines.length * fontSize * lineHeightEm;
  // start y agar block text center di TEXT_CENTER_Y
  const startY = TEXT_CENTER_Y - totalTextHeight / 2 + fontSize * 0.35;

  // bungkus text dengan tanda kutip tipografi kalau belum ada
  const quoted = t.startsWith('"') || t.startsWith('“') ? '' : '“';
  const quotedEnd = t.endsWith('"') || t.endsWith('”') ? '' : '”';

  // Build tspan per line, tambahkan quote di line pertama/terakhir
  const tspans = displayLines
    .map((line, idx) => {
      let content = escapeXml(line);
      if (idx === 0 && quoted) content = '“' + content;
      if (idx === displayLines.length - 1 && quotedEnd) content = content + '”';
      const dy = idx === 0 ? '0' : `${lineHeightEm}em`;
      return `<tspan x="${TEXT_CENTER_X}" dy="${dy}">${content}</tspan>`;
    })
    .join('\n      ');

  // Footer grade kecil di bawah area krem (y ~ 620)
  const footer = grade || takhrij ? escapeXml([grade, takhrij].filter(Boolean).join(' • ')) : '';
  const footerSvg = footer
    ? `<text x="${TEXT_CENTER_X}" y="640" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="13" font-style="italic" fill="#6b5a2e" opacity="0.85">${footer}</text>`
    : '';

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" xmlns="http://www.w3.org/2000/svg">
  <style>
    .hadis { fill: #1e3a2a; font-family: Georgia, 'Times New Roman', serif; font-weight: 600; }
  </style>
  <text x="${TEXT_CENTER_X}" y="${startY}" text-anchor="middle" class="hadis" font-size="${fontSize}" xml:space="preserve">
      ${tspans}
  </text>
  ${footerSvg}
</svg>`;

  // Ensure template exists
  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error(`Template tidak ditemukan: ${TEMPLATE_PATH}`);
  }

  const templateBuffer = await fs.promises.readFile(TEMPLATE_PATH);

  const out = await sharp(templateBuffer)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();

  return out;
}
