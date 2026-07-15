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
    // Clear stale /api/image URLs so app uses image_data instead
    await tursoRun("UPDATE recipes SET image_url = '' WHERE image_url LIKE '/api/image%'");

    // Migrate next supabase/ytimg image
    const dbResult = await tursoRun(
      "SELECT id, title, image_url FROM recipes WHERE (image_url LIKE '%supabase.co%' OR image_url LIKE '%ytimg.com%') LIMIT 1"
    );
    const rows = dbResult?.rows ?? [];
    if (rows.length === 0) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ done: true, message: 'All done!' }) };
    }

    const id = rows[0][0]?.value;
    const title = rows[0][1]?.value;
    const imageUrl = rows[0][2]?.value;

    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(8000) });
    if (!imgRes.ok) throw new Error(`Fetch failed: ${imgRes.status}`);

    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    const buffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const dataUrl = `data:${contentType};base64,${base64}`;

    await tursoRun(
      'UPDATE recipes SET image_data = ?, image_url = ? WHERE id = ?',
      [{ type: 'text', value: dataUrl }, { type: 'text', value: '' }, { type: 'text', value: String(id) }]
    );

    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, migrated: title }) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
