const MYQURAN_BASE = process.env.MYQURAN_BASE_URL || 'https://api.myquran.com/v3';

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
 * Cari hadis dengan panjang <= maxLen (default 180).
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
