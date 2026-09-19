// image.js
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const TEMPLATE_PATH = path.join(process.cwd(), 'assets', 'template-feed-IG.png');
const FONT_REGULAR_PATH = path.join(process.cwd(), 'assets', 'fonts', 'serif-regular.ttf');
const FONT_BOLD_PATH = path.join(process.cwd(), 'assets', 'fonts', 'serif-bold.ttf');

const CANVAS_W = 850;
const CANVAS_H = 850;
const TEXT_AREA_W = 520;
const TEXT_CENTER_X = 425;
const TEXT_CENTER_Y = 390;

// Font files dibaca sekali, di-cache di module scope (aman untuk serverless warm start)
let fontRegularBuffer;
let fontBoldBuffer;

async function loadFonts() {
  if (!fontRegularBuffer) {
    fontRegularBuffer = await fs.promises.readFile(FONT_REGULAR_PATH);
  }
  if (!fontBoldBuffer) {
    fontBoldBuffer = await fs.promises.readFile(FONT_BOLD_PATH);
  }
  return [
    { name: 'Serif', data: fontRegularBuffer, weight: 400, style: 'normal' },
    { name: 'Serif', data: fontBoldBuffer, weight: 700, style: 'normal' },
  ];
}

/**
 * Generate feed image buffer (jpeg) dari text hadis.
 * @param {string} textId - teks hadis bahasa Indonesia (<=180 char)
 * @param {string} grade - opsional untuk footer kecil
 * @param {string} takhrij - opsional
 * @returns {Promise<Buffer>}
 */
// Buang karakter Arab (Quran/hadis asli) + harakat, sisain cuma Latin + tanda baca umum.
// Range ini cover Arabic, Arabic Supplement, Arabic Presentation Forms A/B.
function stripArabic(str) {
  return str
    .replace(/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g, '')
    .replace(/\s{2,}/g, ' ') // rapiin spasi ganda bekas teks Arab yang kebuang
    .trim();
}

export async function generateFeedImage(textId, grade = '', takhrij = '') {
  const t = stripArabic(textId.trim());

  // font size adaptif berdasarkan panjang teks
  const len = t.length;
  let fontSize = 26;
  if (len <= 80) fontSize = 28;
  else if (len <= 120) fontSize = 26;
  else if (len <= 150) fontSize = 24;
  else fontSize = 22;

  const quoted = t.startsWith('"') || t.startsWith('\u201c') ? t : `\u201c${t}\u201d`;

  let footerRaw = [stripArabic(grade), stripArabic(takhrij)].filter(Boolean).join(' \u2022 ');
  if (footerRaw.length > 70) footerRaw = footerRaw.slice(0, 67).trim() + '\u2026';

  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error(`Template tidak ditemukan: ${TEMPLATE_PATH}`);
  }

  const fonts = await loadFonts();

  // Satori butuh struktur mirip React elements (JSX tanpa JSX, pakai object biasa)
  // supaya gak perlu setup JSX transform di file .js biasa.
  const markup = {
    type: 'div',
    props: {
      style: {
        width: `${CANVAS_W}px`,
        height: `${CANVAS_H}px`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              width: `${TEXT_AREA_W}px`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              color: '#1e3a2a',
              fontFamily: 'Serif',
              fontWeight: 600,
              fontSize: `${fontSize}px`,
              lineHeight: 1.45,
              position: 'absolute',
              top: `${TEXT_CENTER_Y - 150}px`,
            },
            children: quoted,
          },
        },
        footerRaw
          ? {
              type: 'div',
              props: {
                style: {
                  position: 'absolute',
                  top: '620px',
                  fontFamily: 'Serif',
                  fontStyle: 'italic',
                  fontSize: '13px',
                  color: '#6b5a2e',
                  opacity: 0.85,
                },
                children: footerRaw,
              },
            }
          : null,
      ].filter(Boolean),
    },
  };

  // 1) satori render markup -> SVG string (font di-embed langsung dari buffer, no OS deps)
  const svg = await satori(markup, {
    width: CANVAS_W,
    height: CANVAS_H,
    fonts,
  });

  // 2) resvg rasterize SVG -> PNG buffer (pure Rust binding, no fontconfig, no librsvg)
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: CANVAS_W },
  });
  const pngData = resvg.render();
  const textLayerBuffer = pngData.asPng();

  // 3) sharp composite text layer di atas template, lalu convert ke jpeg
  const templateBuffer = await fs.promises.readFile(TEMPLATE_PATH);

  const out = await sharp(templateBuffer)
    .composite([{ input: textLayerBuffer, top: 0, left: 0 }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();

  return out;
}