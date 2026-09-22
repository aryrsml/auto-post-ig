// bypass cert lokal Windows (Vercel tidak perlu)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import fs from 'node:fs';
import path from 'node:path';
import { generateFeedImage, resolveTemplate } from '../lib/image.js';
import { fetchHadisWithLengthFilter } from '../lib/myquran.js';

const outDir = path.join(process.cwd(), 'tmp-preview');
fs.mkdirSync(outDir, { recursive: true });

const MAX_LEN = parseInt(process.env.MAX_HADIS_LEN || '300', 10);

// Preview 3 slot hari ini (pagi/siang/malam):
// - background mengikuti rotasi deterministik (hari genap => pagi maroon,
//   siang hijau, malam maroon; dan sebaliknya hari ganjil).
// - tiap slot fetch hadis random BARU dari api.myquran.com (seperti cronjob
//   production yang fetch fresh setiap eksekusi).
const now = new Date();
for (const slot of ['pagi', 'siang', 'malam']) {
  const hadis = await fetchHadisWithLengthFilter(MAX_LEN, 15);
  const { template } = resolveTemplate(now, slot);
  console.log(`\n[${slot}/${template}] hadis-${hadis.id} len=${hadis.textId.length} grade=${hadis.grade}`);
  console.log(` text: "${hadis.textId.slice(0, 80)}${hadis.textId.length > 80 ? '...' : ''}"`);
  const buf = await generateFeedImage(hadis.textId, hadis.grade, hadis.takhrij, template);
  const outPath = path.join(outDir, `preview-${slot}-${template}-hadis-${hadis.id}.jpg`);
  fs.writeFileSync(outPath, buf);
  console.log(` -> ${outPath} (${(buf.length / 1024).toFixed(1)} KB)`);
}

console.log(`\nSelesai. 3 file (3 hadis berbeda) di ${outDir}`);
console.log('Buka folder tmp-preview untuk cek penempatan teks.');
