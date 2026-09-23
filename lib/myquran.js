const MYQURAN_BASE = process.env.MYQURAN_BASE_URL || 'https://api.myquran.com/v3';
const MYQURAN_V2_BASE = process.env.MYQURAN_V2_BASE_URL || 'https://api.myquran.com/v2';

/**
 * Fetch 1 hadis random dari https://api.myquran.com/v3/hadis/enc/random
 * @returns {Promise<{id:number, textId:string, grade:string, takhrij:string}>}
 */
export async function fetchRandomHadisRaw() {
  const bust = Date.now() + Math.random().toString(36).slice(2, 6);
  const res = await fetch(`${MYQURAN_BASE}/hadis/enc/random?_=${bust}`, {
    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    throw new Error(`myQuran random failed: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  if (!json?.data?.text?.id) {
    throw new Error('myQuran response invalid: missing data.text.id');
  }
  return {
    id: json.data.id,
    textId: json.data.text.id.trim(),
    grade: json.data.grade || '',
    takhrij: json.data.takhrij || '',
  };
}

/**
 * Cari hadis dengan panjang <= maxLen (default 300).
 * Loop maxAttempts kali agar dapat hadis pendek yang muat di template.
 * Jika tidak ketemu, fallback ambil yang terpendek dari percobaan.
 */
export async function fetchHadisWithLengthFilter(
  maxLen = process.env.MAX_HADIS_LEN || '300',
  maxAttempts = 5
) {
  const attempts = [];
  let best = null;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const h = await fetchRandomHadisRaw();
      const len = h.textId.length;

      // simpan untuk fallback terpendek
      if (!best || len < best.textId.length) best = h;

      attempts.push({ id: h.id, len });

      // kriteria: 10 <= len <= maxLen (bawah 10 terlalu pendek, kemungkinan error)
      if (len >= 10 && len <= maxLen) {
        console.log(`[myQuran] hit attempt ${i + 1}: id=${h.id} len=${len}`);
        return h;
      }
      console.log(`[myQuran] skip attempt ${i + 1}: id=${h.id} len=${len} > ${maxLen}`);
    } catch (e) {
      console.log(`[myQuran] attempt ${i + 1} error: ${e.message}`);
    }
  }

  // fallback: pakai yang terpendek, lalu truncate jika masih > maxLen
  if (best) {
    console.log(`[myQuran] fallback best id=${best.id} len=${best.textId.length}`);
    if (best.textId.length > maxLen) {
      best.textId = truncateText(best.textId, maxLen);
    }
    return best;
  }
  throw new Error('Gagal fetch hadis setelah ' + maxAttempts + ' percobaan');
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

// ---- Rotasi sumber mingguan (seminggu v3 hadis, seminggu v2 doa) ----
// weekIndex = nomor minggu sejak epoch berdasar waktu WIB.
// Genap => 'hadis' (v3), ganjil => 'doa' (v2). Deterministik, template tidak berubah.

export function getWibWeekIndex(date = new Date()) {
  const wibMs = date.getTime() + 7 * 60 * 60 * 1000;
  return Math.floor(wibMs / (7 * 86400000));
}

export function resolveWeeklySource(date = new Date()) {
  const weekIndex = getWibWeekIndex(date);
  const source = weekIndex % 2 === 0 ? 'hadis' : 'doa';
  return { source, weekIndex };
}
