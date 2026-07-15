const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jiejwvpjpejpozzxuamf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const TURSO_URL = process.env.TURSO_URL;
const TURSO_TOKEN = process.env.TURSO_TOKEN;

function t(value) { return { type: 'text', value: value == null ? '' : String(value) }; }
function n(value) { return value == null ? { type: 'null' } : { type: 'text', value: String(value) }; }
function ii(value) { return { type: 'integer', value: value ? 1 : 0 }; }

exports.handler = async () => {
  const cors = { 'Content-Type': 'application/json' };

  try {
    // Fetch from Supabase
    const r = await fetch(`${SUPABASE_URL}/rest/v1/recipes?order=created_at.asc`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    });
    const recipes = await r.json();
    if (!Array.isArray(recipes)) throw new Error('Supabase fetch failed: ' + JSON.stringify(recipes));

    // Build all requests in one pipeline call
    const requests = [
      { type: 'execute', stmt: { sql: 'DELETE FROM recipes' } },
      ...recipes.map(b => {
        const tags = Array.isArray(b.tags) ? b.tags : [];
        return {
          type: 'execute',
          stmt: {
            sql: `INSERT INTO recipes (title,ingredients,instructions,time,servings,tags,notes,emoji,source,source_label,source_url,image_url,added_by,starred,created_at)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            args: [
              t(b.title), t(b.ingredients), t(b.instructions), t(b.time), t(b.servings),
              t(JSON.stringify(tags)), t(b.notes), t(b.emoji||'🍴'),
              t(b.source), t(b.source_label), n(b.source_url), n(b.image_url),
              t(b.added_by), ii(b.starred), t(b.created_at||new Date().toISOString())
            ]
          }
        };
      }),
      { type: 'execute', stmt: { sql: 'SELECT COUNT(*) FROM recipes' } }
    ];

    const resp = await fetch(`${TURSO_URL}/v2/pipeline`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TURSO_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests })
    });
    const data = await resp.json();

    // Check for errors
    const errors = data.results
      .filter(r => r.type === 'error')
      .map(r => r.error);

    const countResult = data.results[data.results.length - 1];
    const count = countResult?.response?.result?.rows?.[0]?.[0]?.value ?? '?';

    return { statusCode: 200, headers: cors, body: JSON.stringify({ 
      ok: errors.length === 0, 
      migrated: recipes.length, 
      turso_count: count, 
      errors 
    })};
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
