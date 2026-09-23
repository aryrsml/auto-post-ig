export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    name: 'auto-post-ig',
    ver: '1.1.0',
    cron: '0 12 * * * (19:00 WIB)',
    sources: {
      hadis: 'GET https://api.myquran.com/v3/hadis/enc/random (minggu genap WIB)',
      doa: 'GET https://api.myquran.com/v2/doa/acak (minggu ganjil WIB)',
    },
    endpoints: {
      cron: '/api/cron/post',
      health: '/api',
    },
    time: new Date().toISOString(),
  });
}
