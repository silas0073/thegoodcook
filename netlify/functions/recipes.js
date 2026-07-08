const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jiejwvpjpejpozzxuamf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  if (!SUPABASE_KEY) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'SUPABASE_ANON_KEY not configured.' }) };
  }

  const sbHeaders = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Prefer': 'return=representation'
  };

  const base = `${SUPABASE_URL}/rest/v1/recipes`;
  const method = event.httpMethod;

  try {
    if (method === 'GET') {
      const r = await fetch(`${base}?order=created_at.desc`, { headers: sbHeaders });
      const text = await r.text();
      if (!r.ok) return { statusCode: r.status, headers: cors, body: JSON.stringify({ error: `Supabase error ${r.status}: ${text}` }) };
      return { statusCode: 200, headers: cors, body: text };
    }

    if (method === 'POST') {
      const r = await fetch(base, { method: 'POST', headers: sbHeaders, body: event.body });
      const text = await r.text();
      if (!r.ok) return { statusCode: r.status, headers: cors, body: JSON.stringify({ error: `Supabase error ${r.status}: ${text}` }) };
      const data = JSON.parse(text);
      return { statusCode: 201, headers: cors, body: JSON.stringify(Array.isArray(data) ? data[0] : data) };
    }

    if (method === 'PATCH') {
      const id = event.path.split('/').pop();
      const r = await fetch(`${base}?id=eq.${id}`, { method: 'PATCH', headers: sbHeaders, body: event.body });
      const text = await r.text();
      if (!r.ok) return { statusCode: r.status, headers: cors, body: JSON.stringify({ error: `Supabase error ${r.status}: ${text}` }) };
      const data = JSON.parse(text);
      return { statusCode: 200, headers: cors, body: JSON.stringify(Array.isArray(data) ? data[0] : data) };
    }

    if (method === 'DELETE') {
      const id = event.path.split('/').pop();
      const r = await fetch(`${base}?id=eq.${id}`, { method: 'DELETE', headers: sbHeaders });
      if (!r.ok) {
        const text = await r.text();
        return { statusCode: r.status, headers: cors, body: JSON.stringify({ error: `Supabase error ${r.status}: ${text}` }) };
      }
      return { statusCode: 204, headers: cors, body: '' };
    }

    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
