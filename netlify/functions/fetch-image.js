const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jiejwvpjpejpozzxuamf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const { sourceUrl, recipeId } = JSON.parse(event.body);
    if (!sourceUrl || !recipeId) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing sourceUrl or recipeId' }) };

    // Fetch the page to find og:image
    const r = await fetch(sourceUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
        'Accept': 'text/html'
      },
      redirect: 'follow'
    });
    if (!r.ok) return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Could not fetch page' }) };

    const html = await r.text();

    // Try og:image first, then twitter:image, then JSON-LD image
    const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    const twMatch = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
    const jlMatch = html.match(/"image"\s*:\s*"([^"]+)"/);

    const imgUrl = ogMatch?.[1] || twMatch?.[1] || jlMatch?.[1];
    if (!imgUrl) return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'No image found on page' }) };

    // Fetch the image
    const imgR = await fetch(imgUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!imgR.ok) return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Could not fetch image' }) };

    const imgBuffer = await imgR.arrayBuffer();
    const contentType = imgR.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    const filename = `recipe-${recipeId}.${ext}`;

    // Upload to Supabase storage
    const uploadR = await fetch(`${SUPABASE_URL}/storage/v1/object/recipe-images/${filename}`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': contentType,
        'x-upsert': 'true'
      },
      body: imgBuffer
    });

    if (!uploadR.ok) {
      const err = await uploadR.text();
      return { statusCode: 500, headers: cors, body: JSON.stringify({ error: `Storage upload failed: ${err}` }) };
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/recipe-images/${filename}`;
    return { statusCode: 200, headers: cors, body: JSON.stringify({ url: publicUrl }) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
