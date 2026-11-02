# auto-post-ig

Auto posting konten Al-Qur'an harian ke Instagram (19:00 WIB) via **Github Actions** + **api.myquran.com** + **Sharp** + **Vercel Blob** + **Instagram Graph API**.

## Cara kerja
1. cron: "0 0,12 * * *" # 07:00 & 19:00 WIB `node scripts/post-hadis.js`
2. Bergantian mingguan mengambil ayat acak dari `GET https://api.myquran.com/v3/quran/random` (teks `data.translation`) atau doa dari `GET https://api.myquran.com/v2/doa/acak`; loop maksimal 5x untuk mencari teks `10..300` karakter
3. Generate JPEG dengan `sharp` composite: `assets/template-feed-IG.png` (850x850) + SVG text center
4. Upload ke Vercel Blob (hapus blob lama `quran-*`, `hadis-*`, dan `doa-*` dulu), dapat `image_url` publik
5. `POST https://graph.instagram.com/${igUserId}/media` lalu `POST .../media_publish`

## Setup
1. `npm install`
2. Copy `.env.example` ke `.env` dan isi:
   - `IG_USER_ID`, `IG_ACCESS_TOKEN` (long-lived 60 hari, Business/Creator + FB Page)
   - `BLOB_READ_WRITE_TOKEN` (Vercel Dashboard > Storage > Blob > Create)
3. Test manual: `run node scripts/test-image.js`

## Token 60 hari
IG long-lived token expire 60 hari. Refresh manual:
```
GET https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${{ secrets.IG_ACCESS_TOKEN }}
```
Set ulang `IG_ACCESS_TOKEN` di github actions env.

## Catatan template
- `assets/template-feed-IG.png` 850x850, area teks krem tengah `~520px` lebar.
- Font: Georgia serif (fallback sistem, tanpa file font tambahan agar ringan di Vercel).
