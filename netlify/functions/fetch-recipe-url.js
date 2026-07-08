exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const { url } = JSON.parse(event.body);
    if (!url) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing url' }) };

    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache'
      },
      redirect: 'follow'
    });

    if (!r.ok) return { statusCode: r.status, headers: cors, body: JSON.stringify({ error: `Page returned ${r.status}`, text: '' }) };

    const html = await r.text();

    // Extract ALL JSON-LD blocks and find Recipe schema
    const jsonLdBlocks = [];
    const regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        jsonLdBlocks.push(parsed);
      } catch { /* skip malformed blocks */ }
    }

    // Find Recipe schema - handle @graph wrapper
    let recipeSchema = null;
    for (const block of jsonLdBlocks) {
      if (block['@type'] === 'Recipe') { recipeSchema = block; break; }
      if (block['@graph']) {
        const found = block['@graph'].find(n => n['@type'] === 'Recipe');
        if (found) { recipeSchema = found; break; }
      }
      if (Array.isArray(block)) {
        const found = block.find(n => n['@type'] === 'Recipe');
        if (found) { recipeSchema = found; break; }
      }
    }

    if (recipeSchema) {
      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({ isStructured: true, text: JSON.stringify(recipeSchema) })
      };
    }

    // Fall back to clean text extraction
    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s{3,}/g, '\n')
      .trim()
      .slice(0, 8000);

    return { statusCode: 200, headers: cors, body: JSON.stringify({ isStructured: false, text }) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message, text: '' }) };
  }
};
