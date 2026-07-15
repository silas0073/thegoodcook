// Fetches all images from Supabase and stores in Netlify Blobs
// Then updates Turso recipe records with new URLs
import { getStore } from '@netlify/blobs';

const TURSO_URL = process.env.TURSO_URL;
const TURSO_TOKEN = process.env.TURSO_TOKEN;

async function tursoRun(sql, args = []) {
  const r = await fetch(`${TURSO_URL}/v2/pipeline`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TURSO_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ type: 'execute', stmt: { sql, args } }] })
  });
  const data = await r.json();
  const result = data.results?.[0];
  if (!result || result.type === 'error') throw new Error(JSON.stringify(result?.error || data));
  return result.response?.result;
}

function rowsToObjects(result) {
  if (!result?.cols || !result?.rows) return [];
  return result.rows.map(row =>
    Object.fromEntries(result.cols.map((col, i) => [col.name, row[i]?.value ?? null]))
  );
}

export default async () => {
  const store = getStore('recipe-images');
  const results = [];

  // Get all recipes with image URLs
  const dbResult = await tursoRun('SELECT id, title, image_url FROM recipes WHERE image_url IS NOT NULL AND image_url != ""');
  const recipes = rowsToObjects(dbResult);

  for (const recipe of recipes) {
    try {
      // Skip if already on Netlify
      if (!recipe.image_url.includes('supabase.co')) {
        results.push({ title: recipe.title, status: 'skipped - not supabase' });
        continue;
      }

      // Fetch image from Supabase
      const imgRes = await fetch(recipe.image_url);
      if (!imgRes.ok) throw new Error(`Fetch failed: ${imgRes.status}`);

      const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
      const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
      const key = `recipe-${recipe.id}.${ext}`;
      const buffer = await imgRes.arrayBuffer();

      // Save to Netlify Blobs
      await store.set(key, buffer, { metadata: { contentType } });

      // Update Turso with new URL
      const newUrl = `/.netlify/functions/image-proxy?key=${key}`;
      // Use absolute URL for storage
      const publicUrl = `/api/image?key=${key}`;
      await tursoRun(
        'UPDATE recipes SET image_url = ? WHERE id = ?',
        [{ type: 'text', value: publicUrl }, { type: 'text', value: String(recipe.id) }]
      );

      results.push({ title: recipe.title, status: 'ok', key });
    } catch (e) {
      results.push({ title: recipe.title, status: 'error', error: e.message });
    }
  }

  return new Response(JSON.stringify({ ok: true, results }, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};

export const config = { path: '/api/image-migrate' };
