// One-time migration: Supabase → Turso
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jiejwvpjpejpozzxuamf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const TURSO_URL = process.env.TURSO_URL;
const TURSO_TOKEN = process.env.TURSO_TOKEN;

async function tursoExec(sql, args = []) {
  const r = await fetch(`${TURSO_URL}/v2/pipeline`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TURSO_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      requests: [{ type: 'execute', stmt: { sql, args } }]
    })
  });
  const data = await r.json();
  const result = data.results?.[0];
  if (result?.type === 'error') throw new Error(result.error?.message || JSON.stringify(result));
  return result?.response?.result;
}

exports.handler = async () => {
  const cors = { 'Content-Type': 'application/json' };
  const errors = [];

  try {
    // Fetch from Supabase
    const r = await fetch(`${SUPABASE_URL}/rest/v1/recipes?order=created_at.asc`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    });
    const recipes = await r.json();
    if (!Array.isArray(recipes)) throw new Error('Supabase fetch failed: ' + JSON.stringify(recipes));

    let inserted = 0;
    for (const b of recipes) {
      try {
        const tags = Array.isArray(b.tags) ? b.tags : (b.tags ? [b.tags] : []);
        await tursoExec(
          `INSERT OR IGNORE INTO recipes (title, ingredients, instructions, time, servings, tags, notes, emoji, source, source_label, source_url, image_url, added_by, starred, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            { type: 'text', value: String(b.title || '') },
            { type: 'text', value: String(b.ingredients || '') },
            { type: 'text', value: String(b.instructions || '') },
            { type: 'text', value: String(b.time || '') },
            { type: 'text', value: String(b.servings || '') },
            { type: 'text', value: JSON.stringify(tags) },
            { type: 'text', value: String(b.notes || '') },
            { type: 'text', value: String(b.emoji || '🍴') },
            { type: 'text', value: String(b.source || 'text') },
            { type: 'text', value: String(b.source_label || '') },
            { type: 'text', value: String(b.source_url || '') },
            { type: 'text', value: String(b.image_url || '') },
            { type: 'text', value: String(b.added_by || '') },
            { type: 'integer', value: b.starred ? 1 : 0 },
            { type: 'text', value: String(b.created_at || new Date().toISOString()) }
          ]
        );
        inserted++;
      } catch (e) {
        errors.push({ title: b.title, error: e.message });
      }
    }

    // Verify count
    const countResult = await tursoExec('SELECT COUNT(*) as n FROM recipes');
    const count = countResult?.rows?.[0]?.[0]?.value ?? '?';

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ ok: true, migrated: inserted, turso_count: count, errors })
    };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message, errors }) };
  }
};
