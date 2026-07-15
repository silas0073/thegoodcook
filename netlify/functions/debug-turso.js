exports.handler = async () => {
  const TURSO_URL = process.env.TURSO_URL;
  const TURSO_TOKEN = process.env.TURSO_TOKEN;
  const cors = { 'Content-Type': 'application/json' };

  try {
    const r = await fetch(`${TURSO_URL}/v2/pipeline`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TURSO_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [{ type: 'execute', stmt: { sql: 'SELECT * FROM recipes LIMIT 2' } }]
      })
    });
    const data = await r.json();
    return { statusCode: 200, headers: cors, body: JSON.stringify(data, null, 2) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
