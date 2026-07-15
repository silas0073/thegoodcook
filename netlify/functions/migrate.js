// One-time migration: Supabase → Turso
// Hit /.netlify/functions/migrate once, then delete this file
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jiejwvpjpejpozzxuamf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const TURSO_URL = process.env.TURSO_URL;
const TURSO_TOKEN = process.env.TURSO_TOKEN;

async function turso(sql, args = []) {
  const r = await fetch(`${TURSO_URL}/v2/pipeline`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TURSO_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ type: 'execute', stmt: { sql, args } }] })
  });
  const data = await r.json();
  if (data.results?.[0]?.type === 'error') throw new Error(data.results[0].error.message);
  return data.results?.[0]?.response?.result;
}

exports.handler = async () => {
  const cors = { 'Content-Type': 'application/json' };
  try {
    // Create table
    await turso(`CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT, ingredients TEXT, instructions TEXT, time TEXT, servings TEXT,
      tags TEXT, notes TEXT, emoji TEXT, source TEXT, source_label TEXT,
      source_url TEXT, image_url TEXT, added_by TEXT,
      starred INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`);

    // Fetch from Supabase
    const r = await fetch(`${SUPABASE_URL}/rest/v1/recipes?order=created_at.asc`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    });
    const recipes = await r.json();
    if (!Array.isArray(recipes)) throw new Error('Supabase fetch failed: ' + JSON.stringify(recipes));

    let inserted = 0;
    for (const b of recipes) {
      await turso(
        `INSERT INTO recipes (title,ingredients,instructions,time,servings,tags,notes,emoji,source,source_label,source_url,image_url,added_by,starred,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          { type:'text', value: b.title||'' },
          { type:'text', value: b.ingredients||'' },
          { type:'text', value: b.instructions||'' },
          { type:'text', value: b.time||'' },
          { type:'text', value: b.servings||'' },
          { type:'text', value: JSON.stringify(Array.isArray(b.tags) ? b.tags : []) },
          { type:'text', value: b.notes||'' },
          { type:'text', value: b.emoji||'🍴' },
          { type:'text', value: b.source||'text' },
          { type:'text', value: b.source_label||'' },
          { type:'text', value: b.source_url||'' },
          { type:'text', value: b.image_url||'' },
          { type:'text', value: b.added_by||'' },
          { type:'integer', value: b.starred ? 1 : 0 },
          { type:'text', value: b.created_at || new Date().toISOString() }
        ]
      );
      inserted++;
    }

    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, migrated: inserted }) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
