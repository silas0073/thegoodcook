const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jiejwvpjpejpozzxuamf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const TURSO_URL = process.env.TURSO_URL;
const TURSO_TOKEN = process.env.TURSO_TOKEN;

async function tursoExec(sql, args = []) {
  const r = await fetch(`${TURSO_URL}/v2/pipeline`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TURSO_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ type: 'execute', stmt: { sql, args } }] })
  });
  const data = await r.json();
  const result = data.results?.[0];
  if (result?.type === 'error') throw new Error(result.error?.message || JSON.stringify(result));
  return result?.response?.result;
}

function t(value) { return { type: 'text', value: value == null ? '' : String(value) }; }
function i(value) { return { type: 'integer', value: value ? 1 : 0 }; }

exports.handler = async () => {
  const cors = { 'Content-Type': 'application/json' };
  const errors = [];

  try {
    // Clear existing (the test row)
    await tursoExec('DELETE FROM recipes');

    // Fetch from Supabase
    const r = await fetch(`${SUPABASE_URL}/rest/v1/recipes?order=created_at.asc`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    });
    const recipes = await r.json();
    if (!Array.isArray(recipes)) throw new Error('Supabase fetch failed: ' + JSON.stringify(recipes));

    let inserted = 0;
    for (const b of recipes) {
      try {
        const tags = Array.isArray(b.tags) ? b.tags : [];
        await tursoExec(
          `INSERT INTO recipes (title, ingredients, instructions, time, servings, tags, notes, emoji, source, source_label, source_url, image_url, added_by, starred, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            t(b.title), t(b.ingredients), t(b.instructions), t(b.time), t(b.servings),
            t(JSON.stringify(tags)), t(b.notes), t(b.emoji || '🍴'),
            t(b.source), t(b.source_label), t(b.source_url), t(b.image_url),
            t(b.added_by), i(b.starred), t(b.created_at || new Date().toISOString())
          ]
        );
        inserted++;
      } catch (e) {
        errors.push({ title: b.title, error: e.message });
      }
    }

    const countResult = await tursoExec('SELECT COUNT(*) FROM recipes');
    const count = countResult?.rows?.[0]?.[0]?.value ?? '?';

    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, migrated: inserted, turso_count: count, errors }) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message, errors }) };
  }
};
