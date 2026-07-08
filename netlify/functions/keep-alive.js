// Pings Supabase with a real DB query to prevent free-tier pausing.
// Point cron-job.org at: https://thegoodcook.netlify.app/.netlify/functions/keep-alive

exports.handler = async () => {
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jiejwvpjpejpozzxuamf.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

  const cors = { 'Content-Type': 'application/json' };

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/recipes?select=id&limit=1`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });

    if (!res.ok) {
      return { statusCode: 500, headers: cors, body: JSON.stringify({ ok: false, status: res.status }) };
    }

    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, message: 'Supabase is alive 🟢', ts: new Date().toISOString() }) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
