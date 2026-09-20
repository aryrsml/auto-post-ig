import { fetchHadisWithLengthFilter } from '../../lib/myquran.js';
import { generateFeedImage } from '../../lib/image.js';
import { uploadToBlobWithCleanup, createMediaContainer, publishMedia } from '../../lib/instagram.js';

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

    // 1. Fetch hadis pendek
    const hadis = await fetchHadisWithLengthFilter(maxLen, 5);
    console.log(`[cron] hadis id=${hadis.id} len=${hadis.textId.length} grade=${hadis.grade}`);

    // 2. Generate image
    const imageBuffer = await generateFeedImage(hadis.textId, hadis.grade, hadis.takhrij);
    console.log(`[cron] image generated ${imageBuffer.length} bytes`);

    // 3. Upload ke Vercel Blob (cleanup lama dulu)
    const today = new Date().toISOString().slice(0, 10);
    const filename = `hadis-${hadis.id}-${today}.jpg`;
    const imageUrl = await uploadToBlobWithCleanup(imageBuffer, filename);

    // 4. Caption hashtag only
    const hashtags = process.env.CAPTION_HASHTAGS || '#Hadis #HadisHarian #HaditsNabi #Sunnah #Islam #Muslim';
    // caption IG tidak perlu teks hadis panjang lagi karena sudah di gambar; hanya hashtag
    const caption = hashtags;

    // 5. IG Graph API
    const creationId = await createMediaContainer(imageUrl, caption);
    const publishedId = await publishMedia(creationId);

    console.log(`[cron] success hadis=${hadis.id} published=${publishedId}`);

    return res.status(200).json({
      ok: true,
      hadisId: hadis.id,
      hadisText: hadis.textId,
      len: hadis.textId.length,
      imageUrl,
      creationId,
      publishedId,
    });
  } catch (e) {
    console.error('[cron] error', e);
    return res.status(500).json({ ok: false, error: e.message, stack: process.env.NODE_ENV === 'production' ? undefined : e.stack });
  }
}
