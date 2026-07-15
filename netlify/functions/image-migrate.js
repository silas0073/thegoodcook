// Migrates ONE image at a time - call repeatedly until done
// Usage: /.netlify/functions/image-migrate?id=RECIPE_ID
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

exports.handler = async (event) => {
  const cors = { 'Content-Type': 'application/json' };

  try {
    const store = getStore('recipe-images');

    // Get next recipe that still has a supabase image URL
    const dbResult = await tursoRun(
      "SELECT id, title, image_url FROM recipes WHERE image_url LIKE '%supabase.co%' LIMIT 1"
    );
    const recipes = rowsToObjects(dbResult);

    if (recipes.length === 0) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, done: true, message: 'All images migrated!' }) };
    }

    const recipe = recipes[0];

    // Fetch image
    const imgRes = await fetch(recipe.image_url, { signal: AbortSignal.timeout(8000) });
    if (!imgRes.ok) throw new Error(`Image fetch failed: ${imgRes.status}`);

    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    const key = `recipe-${recipe.id}.${ext}`;
    const buffer = await imgRes.arrayBuffer();

    // Save to Netlify Blobs
    await store.set(key, buffer, { metadata: { contentType } });

    // Update Turso
    const publicUrl = `/api/image?key=${key}`;
    await tursoRun(
      'UPDATE recipes SET image_url = ? WHERE id = ?',
      [{ type: 'text', value: publicUrl }, { type: 'text', value: String(recipe.id) }]
    );

    // Count remaining
    const remaining = await tursoRun("SELECT COUNT(*) FROM recipes WHERE image_url LIKE '%supabase.co%'");
    const left = remaining?.rows?.[0]?.[0]?.value ?? '?';

    return {
      statusCode: 200, headers: cors,
      body: JSON.stringify({ ok: true, done: false, migrated: recipe.title, key, remaining: left })
    };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
