# auto-post-ig

Auto posting Hadis harian ke Instagram (19:00 WIB) via **Vercel Cron** + **api.myquran.com/v3** + **Sharp** + **Vercel Blob** + **Instagram Graph API**.

## Cara kerja
1. Vercel Cron `0 12 * * *` (19:00 WIB) hit `GET /api/cron/post`
2. Fetch `GET https://api.myquran.com/v3/hadis/enc/random`, loop max 15x sampai dapat teks `10..180` char (tanpa Arab)
3. Generate JPEG dengan `sharp` composite: `assets/template-feed-IG.png` (850x850) + SVG text center
4. Upload ke Vercel Blob (hapus blob lama `hadis-*` dulu, jadi hanya 1 file hari itu), dapat `image_url` publik
5. `POST graph.facebook.com/{IG_USER_ID}/media` lalu `POST .../media_publish`

## Setup
1. `npm install`
2. Copy `.env.example` ke `.env` dan isi:
   - `IG_USER_ID`, `IG_ACCESS_TOKEN` (long-lived 60 hari, Business/Creator + FB Page)
   - `BLOB_READ_WRITE_TOKEN` (Vercel Dashboard > Storage > Blob > Create)
   - `CRON_SECRET` (random string untuk proteksi manual trigger)
3. `vercel dev` untuk test lokal
4. Deploy `vercel --prod`, set env di Vercel Dashboard
5. Test manual: `curl -H "Authorization: Bearer $CRON_SECRET" https://your-app.vercel.app/api/cron/post`

## Token 60 hari
IG long-lived token expire 60 hari. Refresh manual:
```
GET https://graph.facebook.com/v20.0/oauth/access_token?grant_type=fb_exchange_token&client_id={app-id}&client_secret={app-secret}&fb_exchange_token={old-token}
```
Set ulang `IG_ACCESS_TOKEN` di Vercel env.

## Endpoint
- `GET /api` - health
- `GET /api/cron/post` - cron handler (butuh `Authorization: Bearer CRON_SECRET` atau header `x-vercel-cron: 1`)

## Catatan template
- `assets/template-feed-IG.png` 850x850, area teks krem tengah `~520px` lebar.
- Font: Georgia serif (fallback sistem, tanpa file font tambahan agar ringan di Vercel).
