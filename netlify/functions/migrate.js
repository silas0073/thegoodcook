// Clears stale /api/image URLs so recipes.js falls back to image_data
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

exports.handler = async () => {
  const cors = { 'Content-Type': 'application/json' };
  try {
    // Clear all stale /api/image URLs
    await tursoRun("UPDATE recipes SET image_url = '' WHERE image_url LIKE '/api/image%'");

    // Count how many still need migrating
    const r1 = await tursoRun("SELECT COUNT(*) FROM recipes WHERE image_data IS NOT NULL AND image_data != '' AND image_data != 'none'");
    const withData = r1?.rows?.[0]?.[0]?.value ?? '?';

    const r2 = await tursoRun("SELECT COUNT(*) FROM recipes");
    const total = r2?.rows?.[0]?.[0]?.value ?? '?';

    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, total, with_images: withData }) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
