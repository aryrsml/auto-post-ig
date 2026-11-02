const MYQURAN_BASE = process.env.MYQURAN_BASE_URL || 'https://api.myquran.com/v3';
const MYQURAN_V2_BASE = process.env.MYQURAN_V2_BASE_URL || 'https://api.myquran.com/v2';

/**
 * Fetch 1 ayat Al-Qur'an random dari https://api.myquran.com/v3/quran/random
 * @returns {Promise<{id:number, translation:string, surah:string, ayahNumber:number}>}
 */
export async function fetchRandomQuranRaw() {
  const bust = Date.now() + Math.random().toString(36).slice(2, 6);
  const res = await fetch(`${MYQURAN_BASE}/quran/random?_=${bust}`, {
    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    throw new Error(`myQuran Quran random failed: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  const d = json?.data;
  if (typeof d?.translation !== 'string' || !d.translation.trim()) {
    throw new Error('myQuran Quran response invalid: missing data.translation');
  }
  return {
    id: d.id,
    translation: d.translation.trim(),
    surah: d.surah?.name_latin || '',
    ayahNumber: d.ayah_number,
  };
}

/**
 * Cari terjemahan ayat dengan panjang <= maxLen (default 300).
 * Loop maxAttempts kali agar dapat teks yang muat di template.
 * Jika tidak ketemu, fallback ambil yang terpendek dari percobaan.
 */
export async function fetchQuranWithLengthFilter(
  maxLen = process.env.MAX_QURAN_LEN || process.env.MAX_HADIS_LEN || '300',
  maxAttempts = 5
) {
  const numMax = parseInt(maxLen, 10) || 300;
  let best = null;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const verse = await fetchRandomQuranRaw();
      const len = verse.translation.length;

      // simpan untuk fallback terpendek
      if (!best || len < best.translation.length) best = verse;

      // kriteria: 10 <= len <= maxLen (bawah 10 terlalu pendek, kemungkinan error)
      if (len >= 10 && len <= numMax) {
        console.log(`[myQuran] Quran hit attempt ${i + 1}: id=${verse.id} len=${len}`);
        return verse;
      }
      console.log(`[myQuran] Quran skip attempt ${i + 1}: id=${verse.id} len=${len} > ${numMax}`);
    } catch (e) {
      console.log(`[myQuran] Quran attempt ${i + 1} error: ${e.message}`);
    }
  }

  // fallback: pakai yang terpendek, lalu truncate jika masih > maxLen
  if (best) {
    console.log(`[myQuran] Quran fallback best id=${best.id} len=${best.translation.length}`);
    if (best.translation.length > numMax) {
      best.translation = truncateText(best.translation, numMax);
    }
    return best;
  }
  throw new Error('Gagal fetch ayat Al-Qur\'an setelah ' + maxAttempts + ' percobaan');
}

function truncateText(text, maxLen) {
  if (text.length <= maxLen) return text;
  // potong di kata terakhir agar tidak terpotong tengah kata
  let sliced = text.slice(0, maxLen - 1).trim();
  const lastSpace = sliced.lastIndexOf(' ');
  if (lastSpace > maxLen * 0.6) sliced = sliced.slice(0, lastSpace);
  return sliced + '…';
}

// ---- Doa (myQuran v2) ----

/**
 * Fetch 1 doa random dari https://api.myquran.com/v2/doa/acak
 * Response: { status, request, data: { id, doa, ayat, latin, artinya, judul, source } }
 * @returns {Promise<{judul:string, doaArab:string, latin:string, artinya:string, source:string}>}
 */
export async function fetchRandomDoaRaw() {
  const bust = Date.now() + Math.random().toString(36).slice(2, 6);
  const res = await fetch(`${MYQURAN_V2_BASE}/doa/acak?_=${bust}`, {
    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    throw new Error(`myQuran doa random failed: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  const d = json?.data;
  if (!d?.artinya) {
    throw new Error('myQuran doa response invalid: missing data.artinya');
  }
  return {
    judul: (d.judul || 'Doa Harian').trim(),
    doaArab: (d.doa || '').trim(),
    latin: (d.latin || '').trim(),
    artinya: d.artinya.trim(),
    source: d.source || 'harian',
  };
}

/**
 * Cari doa dengan panjang artinya <= maxLen (default ikut MAX_DOA_LEN,
 * fallback ke MAX_HADIS_LEN, fallback ke 300).
 * Filter berbasis `artinya` karena itulah yang tampil di gambar
 * (template + font Serif tidak mendukung glyph Arab, jadi teks Arab
 * hanya dimuat di caption, bukan di gambar).
 */
export async function fetchDoaWithLengthFilter(
  maxLen = process.env.MAX_DOA_LEN || process.env.MAX_HADIS_LEN || '300',
  maxAttempts = 5
) {
  const numMax = parseInt(maxLen, 10) || 300;
  let best = null;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const d = await fetchRandomDoaRaw();
      const len = d.artinya.length;

      if (!best || len < best.artinya.length) best = d;

      if (len >= 10 && len <= numMax) {
        console.log(`[myQuran] doa hit attempt ${i + 1}: judul="${d.judul}" len=${len}`);
        return d;
      }
      console.log(`[myQuran] doa skip attempt ${i + 1}: judul="${d.judul}" len=${len} > ${numMax}`);
    } catch (e) {
      console.log(`[myQuran] doa attempt ${i + 1} error: ${e.message}`);
    }
  }

  if (best) {
    console.log(`[myQuran] doa fallback best judul="${best.judul}" len=${best.artinya.length}`);
    if (best.artinya.length > numMax) {
      best.artinya = truncateText(best.artinya, numMax);
    }
    return best;
  }
  throw new Error('Gagal fetch doa setelah ' + maxAttempts + ' percobaan');
}

// ---- Rotasi sumber mingguan (seminggu v3 Al-Qur'an, seminggu v2 doa) ----
// weekIndex = nomor minggu sejak epoch berdasar waktu WIB.
// Genap => 'quran' (v3), ganjil => 'doa' (v2). Deterministik, template tidak berubah.

export function getWibWeekIndex(date = new Date()) {
  const wibMs = date.getTime() + 7 * 60 * 60 * 1000;
  return Math.floor(wibMs / (7 * 86400000));
}

export function resolveWeeklySource(date = new Date()) {
  const weekIndex = getWibWeekIndex(date);
  const source = weekIndex % 2 === 0 ? 'quran' : 'doa';
  return { source, weekIndex };
}
