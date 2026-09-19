const GRAPH_VERSION = process.env.IG_GRAPH_VERSION || 'v20.0';

function getEnvOrThrow(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

/**
 * Upload buffer ke Vercel Blob, hapus image lama dulu agar hanya 1 image hari itu.
 * @param {Buffer} buffer - jpeg buffer
 * @param {string} filename - ex: hadis-1234-2026-09-15.jpg
 * @returns {Promise<string>} public url
 */
export async function uploadToBlobWithCleanup(buffer, filename) {
  const { put, list, del } = await import('@vercel/blob');

  // Hapus blob lama dengan prefix hadis- agar hanya 1 yang tersisa
  try {
    const { blobs } = await list({ prefix: 'hadis-' });
    if (blobs.length > 0) {
      const urlsToDelete = blobs.map((b) => b.url);
      console.log(`[blob] cleanup ${blobs.length} old blobs`);
      await del(urlsToDelete);
    }
  } catch (e) {
    // jangan fail total kalau cleanup gagal, hanya log
    console.log(`[blob] cleanup skipped: ${e.message}`);
  }

  const blob = await put(filename, buffer, {
    access: 'public',
    contentType: 'image/jpeg',
    addRandomSuffix: false,
  });
  console.log(`[blob] uploaded ${blob.url}`);
  return blob.url;
}

/**
 * Step 1: buat media container di IG Graph API
 * @param {string} imageUrl - public url dari Vercel Blob
 * @param {string} caption - hashtag only
 * @returns {Promise<string>} creation_id
 */
export async function createMediaContainer(imageUrl, caption) {
  const igUserId = getEnvOrThrow('IG_USER_ID');
  const token = getEnvOrThrow('IG_ACCESS_TOKEN');

  //const url = `https://graph.facebook.com/${GRAPH_VERSION}/${igUserId}/media`;
  const url = `https://graph.instagram.com/${igUserId}/media_publish`;
  const params = new URLSearchParams({
    image_url: imageUrl,
    caption: caption,
    access_token: token,
  });

  const res = await fetch(url, { method: 'POST', body: params });
  const json = await res.json();
  if (!res.ok || !json.id) {
    throw new Error(`IG createMedia failed: ${res.status} ${JSON.stringify(json)}`);
  }
  console.log(`[ig] container id=${json.id}`);
  return json.id;
}

/**
 * Step 2: publish container
 * @param {string} creationId
 * @returns {Promise<string>} media id / permalink id
 */
export async function publishMedia(creationId) {
  const igUserId = getEnvOrThrow('IG_USER_ID');
  const token = getEnvOrThrow('IG_ACCESS_TOKEN');

  // IG kadang butuh 2-3 detik untuk process image_url
  // Poll status jika tersedia, fallback delay
  await waitForContainerReady(creationId, token);

  const url = `https://graph.instagram.com/${igUserId}/media_publish`;
  const params = new URLSearchParams({
    creation_id: creationId,
    access_token: token,
  });

  const res = await fetch(url, { method: 'POST', body: params });
  const json = await res.json();
  if (!res.ok || !json.id) {
    throw new Error(`IG publish failed: ${res.status} ${JSON.stringify(json)}`);
  }
  console.log(`[ig] published id=${json.id}`);
  return json.id;
}

async function waitForContainerReady(creationId, token) {
  // coba cek status 3x dengan delay 2s
  for (let i = 0; i < 3; i++) {
    try {
      const url = `https://graph.instagram.com/${creationId}?fields=status_code&access_token=${token}`;
      const res = await fetch(url);
      const json = await res.json();
      const code = json.status_code;
      console.log(`[ig] container status check ${i + 1}: ${code || json.error?.message || 'unknown'}`);
      if (code === 'FINISHED') return;
      if (code === 'ERROR' || code === 'EXPIRED') throw new Error(`Container status ${code}`);
    } catch (e) {
      console.log(`[ig] status check skip: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}
