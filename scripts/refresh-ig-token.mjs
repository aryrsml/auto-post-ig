import sodium from "libsodium-wrappers";

const { IG_ACCESS_TOKEN, GH_ADMIN_PAT, GITHUB_REPOSITORY } = process.env;

if (!IG_ACCESS_TOKEN || !GH_ADMIN_PAT || !GITHUB_REPOSITORY) {
  console.error("Env var wajib belum lengkap");
  process.exit(1);
}

async function main() {
  // 1. Refresh token ke Instagram
  const refreshUrl = new URL("https://graph.instagram.com/refresh_access_token");
  refreshUrl.searchParams.set("grant_type", "ig_refresh_token");
  refreshUrl.searchParams.set("access_token", IG_ACCESS_TOKEN);

  const res = await fetch(refreshUrl.toString());
  const data = await res.json();

  if (!res.ok || !data.access_token) {
    // Jangan log token/detail sensitif ke console CI
    console.error("Refresh gagal. Token mungkin sudah expired total - butuh re-auth manual.");
    process.exit(1); // biar job GH Actions kelihatan merah & bisa di-notif
  }

  console.log(`Refresh sukses, berlaku ${data.expires_in}s lagi`);

  // 2. Update GitHub Actions secret pakai token baru
  await updateGithubSecret("IG_ACCESS_TOKEN", data.access_token);
  console.log("Secret IG_ACCESS_TOKEN berhasil diupdate");
}

async function updateGithubSecret(name, value) {
  const ghHeaders = {
    Authorization: `Bearer ${GH_ADMIN_PAT}`,
    Accept: "application/vnd.github+json",
  };

  // Ambil public key repo buat enkripsi
  const keyRes = await fetch(
    `https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/secrets/public-key`,
    { headers: ghHeaders }
  );
  const { key, key_id } = await keyRes.json();

  await sodium.ready;
  const binKey = sodium.from_base64(key, sodium.base64_variants.ORIGINAL);
  const binSecret = sodium.from_string(value);
  const encryptedBytes = sodium.crypto_box_seal(binSecret, binKey);
  const encrypted = sodium.to_base64(encryptedBytes, sodium.base64_variants.ORIGINAL);

  const putRes = await fetch(
    `https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/secrets/${name}`,
    {
      method: "PUT",
      headers: { ...ghHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ encrypted_value: encrypted, key_id }),
    }
  );

  if (!putRes.ok) {
    throw new Error(`Gagal update secret: ${putRes.status}`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
