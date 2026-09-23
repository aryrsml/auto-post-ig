import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Kalau file lama lu pakai export default
const handler = (await import('../api/cron/post.js')).default;

// Forward CLI args ke query: node scripts/post-hadis.js --slot=pagi --template=maroon --source=doa
// --source=hadis|doa|auto (default auto = rotasi mingguan: genap hadis v3, ganjil doa v2)
const query = {};
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--([^=]+)=(.*)$/);
  if (m) query[m[1]] = m[2];
}

// Fake req, res biar nggak error
const fakeReq = { headers: {}, query };
const fakeRes = {
  status: (code) => ({
    json: (data) => console.log(`[${code}]`, data)
  }),
  json: (data) => console.log(data)
};

console.log('Starting hadis post via GitHub Actions...', Object.keys(query).length ? query : '');
await handler(fakeReq, fakeRes);
console.log('Done!');
