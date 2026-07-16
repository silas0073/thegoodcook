const TURSO_URL = process.env.TURSO_URL;
const TURSO_TOKEN = process.env.TURSO_TOKEN;
const CLOUDINARY_CLOUD = 'lwesziq4';
const CLOUDINARY_KEY = process.env.CLOUDINARY_KEY;
const CLOUDINARY_SECRET = process.env.CLOUDINARY_SECRET;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

async function sha1(str) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function uploadToCloudinary(imageUrl, recipeId) {
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'thegoodcook';
  const public_id = `recipe-${recipeId}`;
  const sigStr = `folder=${folder}&public_id=${public_id}&timestamp=${timestamp}${CLOUDINARY_SECRET}`;
  const signature = await sha1(sigStr);

  const form = new FormData();
  form.append('file', imageUrl);
  form.append('api_key', CLOUDINARY_KEY);
  form.append('timestamp', String(timestamp));
  form.append('signature', signature);
  form.append('folder', folder);
  form.append('public_id', public_id);

  const r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, {
    method: 'POST',
    body: form
  });
  const data = await r.json();
  if (!data.secure_url) throw new Error(data.error?.message || JSON.stringify(data));
  return data.secure_url;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const { sourceUrl, recipeId, imageUrl } = JSON.parse(event.body);

    let imgUrl = imageUrl; // direct image URL (from upload)

    if (!imgUrl && sourceUrl) {
      // Fetch the page to find og:image
      const r = await fetch(sourceUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' },
        redirect: 'follow'
      });
      if (!r.ok) return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Could not fetch page' }) };

      const html = await r.text();
      const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
      const twMatch = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
      const jlMatch = html.match(/"image"\s*:\s*"([^"]+)"/);

      imgUrl = ogMatch?.[1] || twMatch?.[1] || jlMatch?.[1];
      if (!imgUrl) return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'No image found on page' }) };
    }

    if (!imgUrl) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing sourceUrl or imageUrl' }) };

    // Upload to Cloudinary
    const cloudinaryUrl = await uploadToCloudinary(imgUrl, recipeId);

    return { statusCode: 200, headers: cors, body: JSON.stringify({ url: cloudinaryUrl }) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
