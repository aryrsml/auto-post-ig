// bypass cert lokal Windows (Vercel tidak perlu)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import fs from 'node:fs';
import path from 'node:path';
import { generateFeedImage } from '../lib/image.js';
import { fetchHadisWithLengthFilter } from '../lib/myquran.js';

const outDir = path.join(process.cwd(), 'tmp-preview');
fs.mkdirSync(outDir, { recursive: true });

const COUNT = 5;
const MAX_LEN = parseInt(process.env.MAX_HADIS_LEN || '180', 10);

console.log(`Fetch ${COUNT} hadis random dari api.myquran.com (max ${MAX_LEN} char)...`);

for (let i = 1; i <= COUNT; i++) {
  const hadis = await fetchHadisWithLengthFilter(MAX_LEN, 15);
  const name = `${String(i).padStart(2, '0')}-hadis-${hadis.id}-${hadis.textId.length}char`;
  console.log(`\n[${name}] len=${hadis.textId.length} grade=${hadis.grade}`);
  console.log(` text: "${hadis.textId.slice(0, 80)}${hadis.textId.length > 80 ? '...' : ''}"`);
  const buf = await generateFeedImage(hadis.textId, hadis.grade, hadis.takhrij);
  const outPath = path.join(outDir, `${name}.jpg`);
  fs.writeFileSync(outPath, buf);
  console.log(` -> ${outPath} (${(buf.length / 1024).toFixed(1)} KB)`);
  // metadata untuk debug
  fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(hadis, null, 2));
}

console.log(`\nSelesai. ${COUNT} file di ${outDir}`);
console.log('Buka folder tmp-preview untuk cek penempatan teks.');
