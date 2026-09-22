// image.js
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const TEMPLATE_GREEN_PATH = path.join(process.cwd(), 'assets', 'template-feed-IG.png');
const TEMPLATE_MAROON_PATH = path.join(process.cwd(), 'assets', 'template-feed-IG-1.png');

// Alias lama — jangan dipakai langsung, pakai resolveTemplatePath().
const TEMPLATE_PATH = TEMPLATE_GREEN_PATH;

export const TEMPLATES = {
  green: TEMPLATE_GREEN_PATH,
  maroon: TEMPLATE_MAROON_PATH,
};

// Slot jadwal harian (WIB): 05:30 pagi, 11:55 siang, 20:00 malam.
// Dipetakan ke bucket jam agar tahan drift cronjob.org beberapa menit/jam.
export const SLOTS = ['pagi', 'siang', 'malam'];
const SLOT_INDEX = { pagi: 0, siang: 1, malam: 2 };
const FONT_REGULAR_PATH = path.join(process.cwd(), 'assets', 'fonts', 'serif-regular.ttf');
const FONT_BOLD_PATH = path.join(process.cwd(), 'assets', 'fonts', 'serif-bold.ttf');

const CANVAS_W = 850;
const CANVAS_H = 850;
// Lebar area krem di dalam bingkai emas ~500px; teks disempitkan ke 460px
// agar tidak menyentuh bingkai di kedua template (hijau & maroon).
const TEXT_AREA_W = 460;
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

// ---- Rotasi template deterministik (maroon <-> hijau) ----
// Rumus: (nomorHariWIB + indexSlot) % 2 === 0 ? maroon : hijau
// Hasil: hari genap => pagi maroon, siang hijau, malam maroon.
//        hari ganjil => pagi hijau, siang maroon, malam hijau.
// Postingan berurutan selalu beda warna, dan tiap hari ada kedua warna.

export function getWibDate(date = new Date()) {
  return new Date(date.getTime() + 7 * 60 * 60 * 1000);
}

export function getWibSlot(date = new Date()) {
  const wib = getWibDate(date);
  const h = wib.getUTCHours();
  const m = wib.getUTCMinutes();
  const mins = h * 60 + m;
  if (mins < 10 * 60) return 'pagi'; // 00:00–09:59 => jadwal 05:30
  if (mins < 16 * 60) return 'siang'; // 10:00–15:59 => jadwal 11:55
  return 'malam'; // 16:00–23:59 => jadwal 20:00
}

function getWibDayNumber(date = new Date()) {
  const wibMs = date.getTime() + 7 * 60 * 60 * 1000;
  return Math.floor(wibMs / 86400000);
}

export function resolveTemplate(date = new Date(), slot = null) {
  const s = slot && SLOT_INDEX[slot] !== undefined ? slot : getWibSlot(date);
  const dayNum = getWibDayNumber(date);
  const template = (dayNum + SLOT_INDEX[s]) % 2 === 0 ? 'maroon' : 'green';
  return { slot: s, template };
}

export function resolveTemplatePath(template) {
  const p = TEMPLATES[template];
  if (!p) throw new Error(`Template tidak dikenal: ${template} (pilih: green/maroon)`);
  return p;
}

/**
 * Generate feed image buffer (jpeg) dari text hadis.
 * @param {string} textId - teks hadis bahasa Indonesia (<=180 char)
 * @param {string} grade - opsional untuk footer kecil
 * @param {string} takhrij - opsional
 * @param {string|object} templateOrOptions - 'green' | 'maroon' | { template, slot, date }
 *   Kalau diisi { slot, date } tanpa template, warna dipilih otomatis via resolveTemplate().
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

// Peta karakter transliterasi ilmiah Arab-Latin (macron, dot below/above, ayn/hamza,
// dst) ke huruf Latin polos. Ini yang bikin muncul kotak putih (☒) di font yang
// coverage glyph-nya gak nyampe ke karakter diakritik ginian.
const TRANSLITERATION_MAP = {
  // vokal panjang (macron)
  'ā': 'a', 'Ā': 'A',
  'ī': 'i', 'Ī': 'I',
  'ū': 'u', 'Ū': 'U',
  'ē': 'e', 'Ē': 'E',
  'ō': 'o', 'Ō': 'O',
  // dot below (huruf tebal/emphatic: sh, s, d, t, z, h)
  'ṣ': 's', 'Ṣ': 'S',
  'ḍ': 'd', 'Ḍ': 'D',
  'ṭ': 't', 'Ṭ': 'T',
  'ẓ': 'z', 'Ẓ': 'Z',
  'ḥ': 'h', 'Ḥ': 'H',
  // dot above / macron below / kombinasi lain yang umum dipakai
  'ṅ': 'n', 'ġ': 'gh', 'Ġ': 'Gh',
  'ḵ': 'kh', 'Ḵ': 'Kh',
  'š': 'sh', 'Š': 'Sh',
  'ḏ': 'dh', 'Ḏ': 'Dh',
  'ṯ': 'th', 'Ṯ': 'Th',
  // ayn ('ain) & hamza — biasa ditulis pake simbol kutip khusus
  '\u02BF': "'", // ʿ modifier letter reversed comma (ayn)
  '\u02BE': "'", // ʾ modifier letter right half ring (hamza)
  '\u2018': "'", // ' left single quote (kadang dipake gantiin ayn)
  '\u2019': "'", // ' right single quote (kadang dipake gantiin hamza)
};

const TRANSLITERATION_REGEX = new RegExp(
  Object.keys(TRANSLITERATION_MAP)
    .map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|'),
  'g'
);

// Ganti semua karakter transliterasi ilmiah jadi Latin polos, biar gak nyender
// ke coverage glyph font sama sekali.
function normalizeTransliteration(str) {
  return str.replace(TRANSLITERATION_REGEX, (ch) => TRANSLITERATION_MAP[ch]);
}

export async function generateFeedImage(textId, grade = '', takhrij = '', templateOrOptions = 'green') {
  // Normalisasi argumen template: string | { template, slot, date } | undefined
  let template = 'green';
  if (typeof templateOrOptions === 'string' && templateOrOptions) {
    template = templateOrOptions;
  } else if (templateOrOptions && typeof templateOrOptions === 'object') {
    if (templateOrOptions.template) {
      template = templateOrOptions.template;
    } else {
      template = resolveTemplate(
        templateOrOptions.date || new Date(),
        templateOrOptions.slot || null
      ).template;
    }
  }
  const templatePath = resolveTemplatePath(template);

  const t = normalizeTransliteration(stripArabic(textId.trim()));

  // font size adaptif berdasarkan panjang teks
  const len = t.length;
  let fontSize = 26;
  if (len <= 80) fontSize = 28;
  else if (len <= 120) fontSize = 26;
  else if (len <= 150) fontSize = 24;
  else fontSize = 22;

  const quoted = t.startsWith('"') || t.startsWith('\u201c') ? t : `\u201c${t}\u201d`;

  let footerRaw = [normalizeTransliteration(stripArabic(grade)), normalizeTransliteration(stripArabic(takhrij))]
    .filter(Boolean)
    .join(' \u2022 ');
  if (footerRaw.length > 70) footerRaw = footerRaw.slice(0, 67).trim() + '\u2026';

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template tidak ditemukan: ${templatePath}`);
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

  // 3) sharp: samakan ukuran template ke kanvas 850x850 dulu (template maroon
  // aslinya 1254x1254, hijau 850x850 — tanpa ini teks lari ke kiri atas),
  // lalu composite text layer di atasnya, convert ke jpeg
  const templateBuffer = await fs.promises.readFile(templatePath);

  const out = await sharp(templateBuffer)
    .resize(CANVAS_W, CANVAS_H, { fit: 'fill' })
    .composite([{ input: textLayerBuffer, top: 0, left: 0 }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();

  return out;
}