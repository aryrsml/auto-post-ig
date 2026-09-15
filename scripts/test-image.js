import fs from 'node:fs';
import path from 'node:path';
import { generateFeedImage } from '../lib/image.js';

const outDir = path.join(process.cwd(), 'tmp-preview');
fs.mkdirSync(outDir, { recursive: true });

// Kumpulan teks uji: pendek - sedang - panjang (mirip hadis 180 char)
const cases = [
  {
    name: '01-pendek-74char',
    text: 'Sesungguhnya Allah itu indah dan menyukai keindahan.',
    grade: 'Hadis sahih',
    takhrij: 'HR. Muslim',
  },
  {
    name: '02-sedang-130char',
    text: 'Barangsiapa menempuh jalan untuk mencari ilmu, maka Allah akan memudahkan baginya jalan menuju surga.',
    grade: 'Hadis sahih',
    takhrij: 'HR. Muslim',
  },
  {
    name: '03-panjang-180char',
    text: 'Barangsiapa menempuh suatu jalan untuk menuntut ilmu, maka Allah akan memudahkan baginya jalan menuju surga. Sesungguhnya malaikat meletakkan sayapnya sebagai tanda ridha.',
    grade: 'Hadis sahih',
    takhrij: 'HR. Muslim',
  },
  {
    name: '04-hadist-asli-contoh',
    text: 'Dari Anas bin Malik -ra, ia berkata, Aku keluar bersama Jarir bin Abdillah dalam suatu perjalanan. Ternyata ia melayaniku.',
    grade: 'Hadis sahih',
    takhrij: "Muttafaq 'alaih",
  },
  {
    name: '05-sangat-pendek-45char',
    text: 'Senyummu di hadapan saudaramu adalah sedekah.',
    grade: 'Hadis hasan',
    takhrij: 'HR. Tirmidzi',
  },
];

for (const c of cases) {
  console.log(`\n[${c.name}] len=${c.text.length}`);
  const buf = await generateFeedImage(c.text, c.grade, c.takhrij);
  const outPath = path.join(outDir, `${c.name}.jpg`);
  fs.writeFileSync(outPath, buf);
  console.log(` -> ${outPath} (${(buf.length / 1024).toFixed(1)} KB)`);
}

console.log(`\nSelesai. ${cases.length} file di ${outDir}`);
console.log('Buka folder tmp-preview untuk cek penempatan teks.');
