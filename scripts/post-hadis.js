import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Kalau file lama lu pakai export default
const handler = (await import('../api/cron/post.js')).default;

// Fake req, res biar nggak error
const fakeReq = { headers: {} };
const fakeRes = {
  status: (code) => ({
    json: (data) => console.log(`[${code}]`, data)
  }),
  json: (data) => console.log(data)
};

console.log("Starting hadis post via GitHub Actions...");
await handler(fakeReq, fakeRes);
console.log("Done!");