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

  try {
    // Fetch from Supabase
    const r = await fetch(`${SUPABASE_URL}/rest/v1/recipes?order=created_at.asc`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    });
    const recipes = await r.json();
    if (!Array.isArray(recipes)) throw new Error('Supabase fetch failed: ' + JSON.stringify(recipes));

    // Try inserting just the first recipe with plain INSERT and return full Turso response
    const b = recipes[0];
    const tags = Array.isArray(b.tags) ? b.tags : [];

    const raw = await fetch(`${TURSO_URL}/v2/pipeline`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TURSO_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [{
          type: 'execute',
          stmt: {
            sql: 'INSERT INTO recipes (title, tags, added_by) VALUES (?, ?, ?)',
            args: [
              { type: 'text', value: String(b.title || 'test') },
              { type: 'text', value: JSON.stringify(tags) },
              { type: 'text', value: String(b.added_by || '') }
            ]
          }
        }]
      })
    });
    const rawData = await raw.json();

    // Check count
    const countResult = await tursoExec('SELECT COUNT(*) as n FROM recipes');
    const count = countResult?.rows?.[0]?.[0]?.value ?? '?';

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ 
        first_recipe: b.title,
        turso_insert_response: rawData,
        turso_count: count 
      }, null, 2)
    };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
