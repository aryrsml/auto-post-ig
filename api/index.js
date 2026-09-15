export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    name: 'auto-post-ig',
    ver: '1.0.0',
    cron: '0 12 * * * (19:00 WIB)',
    endpoints: {
      cron: '/api/cron/post',
      health: '/api',
    },
    time: new Date().toISOString(),
  });
}
