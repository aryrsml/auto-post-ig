import { fetchHadisWithLengthFilter, fetchDoaWithLengthFilter, resolveWeeklySource } from '../../lib/myquran.js';
import { generateFeedImage, resolveTemplate, getWibDate } from '../../lib/image.js';
import { uploadToBlobWithCleanup, createMediaContainer, publishMedia } from '../../lib/instagram.js';

// Normalisasi override sumber dari query: ?source=hadis|doa|v2|v3|auto
function resolveSource(querySource, now) {
  const q = String(querySource || 'auto').toLowerCase();
  if (['hadis', 'hadits', 'v3'].includes(q)) return { source: 'hadis', mode: 'manual' };
  if (['doa', 'dua', 'v2'].includes(q)) return { source: 'doa', mode: 'manual' };
  const weekly = resolveWeeklySource(now);
  return { source: weekly.source, mode: 'weekly', weekIndex: weekly.weekIndex };
}

export default async function handler(req, res) {
  // Hanya allow GET/POST dari Vercel Cron atau manual dengan secret
  // const cronSecret = process.env.CRON_SECRET;
  // const auth = req.headers.authorization || '';
  // const querySecret = req.query?.secret;
  // const vercelCron = req.headers['x-vercel-cron'];

  // Jika CRON_SECRET diset, wajib salah satu valid; Vercel Cron header dianggap valid juga
  // if (cronSecret) {
  //   const ok =
  //     auth === `Bearer ${cronSecret}` ||
  //     querySecret === cronSecret ||
  //     vercelCron === '1';
  //   if (!ok && req.headers['user-agent']?.includes('vercel-cron')) {
  //     // fallback: vercel-cron tanpa header (edge case)
  //   } else if (!ok) {
  //     // Untuk cron resmi Vercel, biasanya ada header x-vercel-cron:1
  //     // Jika tidak ada header itu dan secret tidak cocok -> unauthorized
  //     // Tapi jangan block total saat local dev: allow jika tidak ada secret check
  //     const isVercelCron = vercelCron === '1';
  //     if (!isVercelCron) {
  //       return res.status(401).json({ ok: false, error: 'Unauthorized: invalid CRON_SECRET' });
  //     }
  //   }
  // }

  // Vercel Cron hanya GET; manual bisa POST
  //console.log(`[cron] start ${new Date().toISOString()} method=${req.method} vercelCron=${vercelCron || '-'}`);

  try {
    const maxLen = parseInt(process.env.MAX_HADIS_LEN || '300', 10);
    // Batas teks yang muat nyaman di template gambar (area ~520px).
    // Kalau teks lebih panjang dari ini, gambar dipotong word-safe + "…"
    // dan teks lengkapnya dilanjutkan di caption.
    const imageMaxLen = parseInt(process.env.IMAGE_MAX_LEN || '180', 10);

    // 0. Sumber konten mingguan: minggu genap => hadis (v3), minggu ganjil => doa (v2).
    // Override manual (mis. dari cronjob.org / CLI): ?source=hadis|doa|auto
    const now = new Date();
    const { source, mode, weekIndex } = resolveSource(req.query?.source, now);
    console.log(`[cron] source=${source} mode=${mode}${weekIndex !== undefined ? ` weekIndex=${weekIndex}` : ''}`);

    // 2b. Template otomatis bergantian (maroon <-> hijau) berdasar slot WIB.
    // TIDAK DIUBAH oleh rotasi sumber — jadwal template tetap seperti semula.
    // Override manual (mis. dari cronjob.org): ?slot=pagi|siang|malam & ?template=maroon|green|auto
    const querySlot = req.query?.slot;
    const queryTemplate = req.query?.template;
    const auto = resolveTemplate(now, querySlot || null);
    const template = queryTemplate && queryTemplate !== 'auto' ? queryTemplate : auto.template;
    const slot = auto.slot;
    const wibNow = getWibDate(now).toISOString();
    console.log(`[cron] slot=${slot} template=${template} wib=${wibNow}`);

    if (source === 'doa') {
      return await handleDoaPost(req, res, { imageMaxLen, template, slot, wibNow, weekIndex, mode });
    }
    return await handleHadisPost(req, res, { maxLen, imageMaxLen, template, slot, wibNow, weekIndex, mode });
  } catch (e) {
    console.error('[cron] error', e);
    return res.status(500).json({ ok: false, error: e.message, stack: process.env.NODE_ENV === 'production' ? undefined : e.stack });
  }
}

async function handleHadisPost(req, res, { maxLen, imageMaxLen, template, slot, wibNow, weekIndex, mode }) {
    // 1. Fetch hadis pendek
    const hadis = await fetchHadisWithLengthFilter(maxLen, 5);
    console.log(`[cron] hadis id=${hadis.id} len=${hadis.textId.length} grade=${hadis.grade}`);

    // 2. Split: gambar = potongan aman, caption = teks lengkap jika kepotong
    const { imageText, truncated } = splitForImage(hadis.textId, imageMaxLen);
    if (truncated) {
      console.log(`[cron] text truncated for image ${hadis.textId.length} -> ${imageText.length} chars, full text goes to caption`);
    }

    // 3. Generate image (pakai versi potongan kalau kepanjangan)
    const imageBuffer = await generateFeedImage(imageText, hadis.grade, hadis.takhrij, template);
    console.log(`[cron] image generated ${imageBuffer.length} bytes`);

    // 4. Upload ke Vercel Blob (cleanup lama dulu)
    const today = getWibDate(new Date()).toISOString().slice(0, 10);
    const filename = `hadis-${hadis.id}-${today}-${slot}-${template}.jpg`;
    const imageUrl = await uploadToBlobWithCleanup(imageBuffer, filename);

    // 5. Caption: hashtag saja kalau muat di gambar,
    // kalau kepotong -> teks lengkap + footer + hashtag
    const hashtags = process.env.CAPTION_HASHTAGS || '#Hadis #HadisHarian #HaditsNabi #Sunnah #Islam #Muslim';
    const caption = truncated
      ? buildLongCaption(hadis, hashtags)
      : hashtags;

    // 6. IG Graph API
    const creationId = await createMediaContainer(imageUrl, caption);
    const publishedId = await publishMedia(creationId);

    console.log(`[cron] success hadis=${hadis.id} published=${publishedId}`);

    return res.status(200).json({
      ok: true,
      source: 'hadis',
      sourceMode: mode,
      weekIndex,
      hadisId: hadis.id,
      hadisText: hadis.textId,
      len: hadis.textId.length,
      imageTextLen: imageText.length,
      truncated,
      slot,
      template,
      wibNow,
      captionPreview: caption.slice(0, 120),
      imageUrl,
      creationId,
      publishedId,
    });
}

async function handleDoaPost(req, res, { imageMaxLen, template, slot, wibNow, weekIndex, mode }) {
    // 1. Fetch doa (filter panjang artinya, karena artinya yang tampil di gambar)
    const maxDoaLen = process.env.MAX_DOA_LEN || process.env.MAX_HADIS_LEN || '300';
    const doa = await fetchDoaWithLengthFilter(maxDoaLen, 5);
    console.log(`[cron] doa judul="${doa.judul}" artinya_len=${doa.artinya.length}`);

    // 2. Gambar = artinya (potongan aman word-safe); footer = judul.
    // Teks Arab TIDAK dimuat di gambar karena font template (Serif) tidak
    // mencakup glyph Arab — Arab lengkap tetap ada di caption.
    const { imageText, truncated } = splitForImage(doa.artinya, imageMaxLen);
    if (truncated) {
      console.log(`[cron] doa artinya truncated for image ${doa.artinya.length} -> ${imageText.length} chars, full text goes to caption`);
    }

    // 3. Generate image (template & slot sama seperti hadis — tidak diubah)
    const imageBuffer = await generateFeedImage(imageText, doa.judul, '', template);
    console.log(`[cron] image generated ${imageBuffer.length} bytes`);

    // 4. Upload ke Vercel Blob (cleanup lama dulu)
    const today = getWibDate(new Date()).toISOString().slice(0, 10);
    const safeJudul = doa.judul.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'doa';
    const filename = `doa-${safeJudul}-${today}-${slot}-${template}.jpg`;
    const imageUrl = await uploadToBlobWithCleanup(imageBuffer, filename);

    // 5. Caption doa SELALU lengkap: judul + arab + latin (jika ada) + artinya + hashtag.
    // (Berbeda dari hadis yang hemat caption saat muat di gambar, karena teks
    // Arab doa tidak pernah tampil di gambar jadi harus selalu ada di caption.)
    const hashtags = process.env.CAPTION_HASHTAGS_DOA
      || process.env.CAPTION_HASHTAGS
      || '#Doa #DoaHarian #DoaMustajab #Dzikir #Islam #Muslim';
    const caption = buildDoaCaption(doa, hashtags);

    // 6. IG Graph API
    const creationId = await createMediaContainer(imageUrl, caption);
    const publishedId = await publishMedia(creationId);

    console.log(`[cron] success doa="${doa.judul}" published=${publishedId}`);

    return res.status(200).json({
      ok: true,
      source: 'doa',
      sourceMode: mode,
      weekIndex,
      doaJudul: doa.judul,
      doaArtinya: doa.artinya,
      len: doa.artinya.length,
      imageTextLen: imageText.length,
      truncated,
      slot,
      template,
      wibNow,
      captionPreview: caption.slice(0, 120),
      imageUrl,
      creationId,
      publishedId,
    });
}

/**
 * Potong teks untuk gambar secara word-safe.
 * @returns {{ imageText: string, truncated: boolean }}
 */
function splitForImage(text, maxLen) {
  const clean = (text || '').trim();
  if (clean.length <= maxLen) return { imageText: clean, truncated: false };
  let sliced = clean.slice(0, maxLen - 1).trim();
  const lastSpace = sliced.lastIndexOf(' ');
  if (lastSpace > maxLen * 0.6) sliced = sliced.slice(0, lastSpace);
  return { imageText: sliced.trim() + '…', truncated: true };
}

/**
 * Caption saat teks kepotong di gambar: teks lengkap + grade/takhrij + hashtag.
 */
function buildLongCaption(hadis, hashtags) {
  const quote = `\u201c${hadis.textId.trim()}\u201d`;
  const footer = [hadis.grade, hadis.takhrij].filter(Boolean).join(' \u2022 ');
  const parts = [quote];
  if (footer) parts.push(`— ${footer}`);
  parts.push('(Teks lengkap — lanjutan dari gambar)');
  parts.push(hashtags);
  return parts.join('\n\n');
}

/**
 * Caption doa: judul + teks Arab + latin (jika ada) + artinya + hashtag.
 */
function buildDoaCaption(doa, hashtags) {
  const parts = [`\uD83E\uDD32 ${doa.judul}`];
  if (doa.doaArab) parts.push(doa.doaArab);
  if (doa.latin) parts.push(`*${doa.latin}*`);
  parts.push(`Artinya:\n\u201c${doa.artinya.trim()}\u201d`);
  parts.push(hashtags);
  return parts.join('\n\n');
}
