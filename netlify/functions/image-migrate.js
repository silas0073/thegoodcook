// Regular Netlify function (not edge) - longer timeout
const { getStore } = require('@netlify/blobs');

const TURSO_URL = process.env.TURSO_URL;
const TURSO_TOKEN = process.env.TURSO_TOKEN;

async function tursoRun(sql, args = []) {
  const r = await fetch(`${TURSO_URL}/v2/pipeline`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TURSO_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ type: 'execute', stmt: { sql, args } }] })
  });
  const data = await r.json();
  const result = data.results?.[0];
  if (!result || result.type === 'error') throw new Error(JSON.stringify(result?.error || data));
  return result.response?.result;
}

function rowsToObjects(result) {
  if (!result?.cols || !result?.rows) return [];
  return result.rows.map(row =>
    Object.fromEntries(result.cols.map((col, i) => [col.name, row[i]?.value ?? null]))
  );
}

exports.handler = async () => {
  const cors = { 'Content-Type': 'application/json' };
  const results = [];

  try {
    const store = getStore('recipe-images');

    // Get all recipes
    const dbResult = await tursoRun('SELECT id, title, image_url FROM recipes');
    const recipes = rowsToObjects(dbResult);

    for (const recipe of recipes) {
      if (!recipe.image_url || !recipe.image_url.includes('supabase.co')) {
        results.push({ title: recipe.title, status: 'skipped' });
        continue;
      }

      try {
        const imgRes = await fetch(recipe.image_url, { signal: AbortSignal.timeout(10000) });
        if (!imgRes.ok) throw new Error(`Fetch ${imgRes.status}`);

        const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
        const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
        const key = `recipe-${recipe.id}.${ext}`;
        const buffer = await imgRes.arrayBuffer();

        await store.set(key, buffer, { metadata: { contentType } });

        const publicUrl = `/api/image?key=${key}`;
        await tursoRun(
          'UPDATE recipes SET image_url = ? WHERE id = ?',
          [{ type: 'text', value: publicUrl }, { type: 'text', value: String(recipe.id) }]
        );

        results.push({ title: recipe.title, status: 'ok', key });
      } catch (e) {
        results.push({ title: recipe.title, status: 'error', error: e.message });
      }
    }

    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, results }) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message, results }) };
  }
};
