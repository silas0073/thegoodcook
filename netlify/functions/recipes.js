const TURSO_URL = process.env.TURSO_URL;
const TURSO_TOKEN = process.env.TURSO_TOKEN;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

async function turso(sql, args = []) {
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
  if (data.results?.[0]?.type === 'error') throw new Error(data.results[0].error.message);
  return data.results?.[0]?.response?.result;
}

function rowsToObjects(result) {
  if (!result?.cols || !result?.rows) return [];
  return result.rows.map(row =>
    Object.fromEntries(result.cols.map((col, i) => [col.name, row[i]?.value ?? null]))
  );
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  const method = event.httpMethod;
  const id = event.path.split('/').pop();

  try {
    await turso(`CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT, ingredients TEXT, instructions TEXT, time TEXT, servings TEXT,
      tags TEXT, notes TEXT, emoji TEXT, source TEXT, source_label TEXT,
      source_url TEXT, image_url TEXT, image_data TEXT, added_by TEXT,
      starred INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`);
    await turso('ALTER TABLE recipes ADD COLUMN image_data TEXT').catch(() => {});

    if (method === 'GET') {
      const result = await turso('SELECT id,title,ingredients,instructions,time,servings,tags,notes,emoji,source,source_label,source_url,image_url,image_data,added_by,starred,created_at FROM recipes ORDER BY created_at DESC');
      const rows = rowsToObjects(result).map(r => ({
        ...r,
        tags: r.tags ? JSON.parse(r.tags) : [],
        starred: r.starred === 1 || r.starred === '1',
        image_url: r.image_data || r.image_url || null
      }));
      return { statusCode: 200, headers: cors, body: JSON.stringify(rows) };
    }

    if (method === 'POST') {
      const b = JSON.parse(event.body);
      const result = await turso(
        `INSERT INTO recipes (title,ingredients,instructions,time,servings,tags,notes,emoji,source,source_label,source_url,image_url,added_by,starred)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          { type:'text', value: b.title||'' },
          { type:'text', value: b.ingredients||'' },
          { type:'text', value: b.instructions||'' },
          { type:'text', value: b.time||'' },
          { type:'text', value: b.servings||'' },
          { type:'text', value: JSON.stringify(b.tags||[]) },
          { type:'text', value: b.notes||'' },
          { type:'text', value: b.emoji||'🍴' },
          { type:'text', value: b.source||'text' },
          { type:'text', value: b.source_label||'' },
          { type:'text', value: b.source_url||'' },
          { type:'text', value: b.image_url||'' },
          { type:'text', value: b.added_by||'' },
          { type:'text', value: b.starred ? '1' : '0' }
        ]
      );
      return { statusCode: 201, headers: cors, body: JSON.stringify({ id: result?.last_insert_rowid }) };
    }

    if (method === 'PATCH') {
      const b = JSON.parse(event.body);
      const fields = [], args = [];
      for (const key of ['title','ingredients','instructions','time','servings','notes','emoji','source','source_label','source_url','image_url','added_by','starred','tags']) {
        if (key in b) {
          fields.push(`${key} = ?`);
          if (key === 'tags') args.push({ type:'text', value: JSON.stringify(b[key]) });
          else if (key === 'starred') args.push({ type:'text', value: b[key] ? '1' : '0' });
          else args.push({ type:'text', value: b[key] == null ? '' : String(b[key]) });
        }
      }
      if (!fields.length) return { statusCode:400, headers:cors, body: JSON.stringify({ error:'Nothing to update' }) };
      args.push({ type:'text', value: String(id) });
      await turso(`UPDATE recipes SET ${fields.join(', ')} WHERE id = ?`, args);
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
    }

    if (method === 'DELETE') {
      await turso('DELETE FROM recipes WHERE id = ?', [{ type:'text', value: String(id) }]);
      return { statusCode: 204, headers: cors, body: '' };
    }

    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
