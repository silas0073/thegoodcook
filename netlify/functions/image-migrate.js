// Migrates ONE image at a time - fetches from Supabase, stores as base64 in Turso
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
  try {
    // Ensure image_data column exists
    await tursoRun('ALTER TABLE recipes ADD COLUMN image_data TEXT').catch(() => {});

    // Get next recipe with supabase image
    const dbResult = await tursoRun(
      "SELECT id, title, image_url FROM recipes WHERE image_url LIKE '%supabase.co%' OR image_url LIKE '%ytimg.com%' LIMIT 1"
    );
    const recipes = rowsToObjects(dbResult);

    if (recipes.length === 0) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ done: true, message: 'All images migrated!' }) };
    }

    const recipe = recipes[0];
    const imgRes = await fetch(recipe.image_url, { signal: AbortSignal.timeout(8000) });
    if (!imgRes.ok) throw new Error(`Fetch failed: ${imgRes.status}`);

    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    const buffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const dataUrl = `data:${contentType};base64,${base64}`;

    await tursoRun(
      'UPDATE recipes SET image_data = ?, image_url = ? WHERE id = ?',
      [
        { type: 'text', value: dataUrl },
        { type: 'text', value: '' },
        { type: 'text', value: String(recipe.id) }
      ]
    );

    const remaining = await tursoRun(
      "SELECT COUNT(*) FROM recipes WHERE image_url LIKE '%supabase.co%' OR image_url LIKE '%ytimg.com%'"
    );
    const left = remaining?.rows?.[0]?.[0]?.value ?? '?';

    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, migrated: recipe.title, remaining: left }) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
