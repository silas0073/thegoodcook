// Turso doesn't need a keep-alive (no inactivity pausing!)
// This just returns OK for cron-job.org to keep pinging
exports.handler = async () => ({
  statusCode: 200,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ok: true, message: 'The Good Cook is alive 🟢', ts: new Date().toISOString() })
});
