const GRAPH_VERSION = process.env.IG_GRAPH_VERSION || 'v20.0';

function getEnvOrThrow(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export async function uploadToBlobWithCleanup(buffer, filename) {
  const { put, list, del } = await import('@vercel/blob');
  // Bersihkan file hari yang sama untuk kedua sumber (hadis-* & doa-*)
  // agar hanya 1 file aktif hari itu, terlepas dari rotasi mingguan.
  for (const prefix of ['hadis-', 'doa-']) {
    try {
      const { blobs } = await list({ prefix });
      if (blobs.length > 0) await del(blobs.map((b) => b.url));
    } catch (e) { console.log(`[blob] cleanup skip ${prefix}: ${e.message}`); }
  }
  const blob = await put(filename, buffer, { access: 'public', contentType: 'image/jpeg', addRandomSuffix: false });
  return blob.url;
}

export async function createMediaContainer(imageUrl, caption) {
  const igUserId = getEnvOrThrow('IG_USER_ID');
  const token = getEnvOrThrow('IG_ACCESS_TOKEN');

  // STEP 1 - HARUS /media + image_url
  const url = `https://graph.instagram.com/${igUserId}/media`;
  const params = new URLSearchParams({
    image_url: imageUrl,
    caption: caption,
    access_token: token,
  });

  const res = await fetch(url, { method: 'POST', body: params });
  const json = await res.json();
  if (!res.ok ||!json.id) throw new Error(`IG createMedia failed: ${res.status} ${JSON.stringify(json)}`);
  return json.id;
}

export async function publishMedia(creationId) {
  const igUserId = getEnvOrThrow('IG_USER_ID');
  const token = getEnvOrThrow('IG_ACCESS_TOKEN');

  await waitForContainerReady(creationId, token);

  // STEP 2 - HARUS /media_publish + creation_id
  const url = `https://graph.instagram.com/${igUserId}/media_publish`;
  const params = new URLSearchParams({
    creation_id: creationId,
    access_token: token,
  });

  const res = await fetch(url, { method: 'POST', body: params });
  const json = await res.json();
  if (!res.ok ||!json.id) throw new Error(`IG publish failed: ${res.status} ${JSON.stringify(json)}`);
  return json.id;
}

async function waitForContainerReady(creationId, token) {
  for (let i = 0; i < 4; i++) {
    try {
      const url = `https://graph.instagram.com/${creationId}?fields=status_code&access_token=${token}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.status_code === 'FINISHED') return;
      console.log(`[ig] status ${i+1}: ${json.status_code}`);
    } catch(e){}
    await new Promise(r => setTimeout(r, 2000));
  }
}