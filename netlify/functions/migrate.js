// Migrates ONE image at a time from Supabase → Cloudinary, updates Turso
const TURSO_URL = process.env.TURSO_URL;
const TURSO_TOKEN = process.env.TURSO_TOKEN;
const CLOUDINARY_CLOUD = 'lwesziq4';
const CLOUDINARY_KEY = process.env.CLOUDINARY_KEY;
const CLOUDINARY_SECRET = process.env.CLOUDINARY_SECRET;

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

// SHA1 for Cloudinary signature
async function sha1(str) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const SUPABASE_IMAGES = {
  "Fish Tacos": "https://jiejwvpjpejpozzxuamf.supabase.co/storage/v1/object/public/recipe-images/7faf9a3c-daed-47b2-b3fb-571b76ae149c-1780736635326.jpg",
  "Tuna Pasta Bake": "https://jiejwvpjpejpozzxuamf.supabase.co/storage/v1/object/public/recipe-images/b3927d56-5342-4ad2-9d17-5d5c6f65bcc7-1780793075470.png",
  "Grilled Huli Huli Chicken": "https://jiejwvpjpejpozzxuamf.supabase.co/storage/v1/object/public/recipe-images/353bc710-ef55-46a1-940c-570092cc3165-1780736614139.png",
  "Chargrilled Garlic Chicken": "https://jiejwvpjpejpozzxuamf.supabase.co/storage/v1/object/public/recipe-images/d7403cf4-dc00-4679-854d-a80f74a3890a-1780736623964.jpg",
  "Easy Baked Glazed Ham": "https://jiejwvpjpejpozzxuamf.supabase.co/storage/v1/object/public/recipe-images/096904af-551b-4d2b-952c-cb86829f378b-1780792581089.png",
  "Tuna Pasta Salad": "https://jiejwvpjpejpozzxuamf.supabase.co/storage/v1/object/public/recipe-images/f7251a12-39b3-468d-9f68-a899a22126cf-1780792997904.jpg",
  "Asian Chicken Noodle Soup": "https://jiejwvpjpejpozzxuamf.supabase.co/storage/v1/object/public/recipe-images/c2475f93-6675-492d-a44c-74ab6f774770-1780792938828.jpg",
  "Vermicelli Tofu with Chowder Sauce": "https://jiejwvpjpejpozzxuamf.supabase.co/storage/v1/object/public/recipe-images/f51054d2-deb2-4936-9303-f1712a215f3d-1780793159004.png",
  "Lohikeitto Finnish Salmon Soup": "https://jiejwvpjpejpozzxuamf.supabase.co/storage/v1/object/public/recipe-images/470ab749-1a42-4890-8387-6df41985c759-1780737226297.jpg",
  "Chinese Chicken Corn Soup": "https://jiejwvpjpejpozzxuamf.supabase.co/storage/v1/object/public/recipe-images/134bac4c-fbd2-4e68-87a7-3469e5d2ace5-1780737291614.jpg",
  "Baked Spaghetti": "https://jiejwvpjpejpozzxuamf.supabase.co/storage/v1/object/public/recipe-images/b98f889e-bfa4-46bb-adfb-3e717862d3eb-1780737468863.jpg",
  "Pan-Seared Chicken Breast": "https://jiejwvpjpejpozzxuamf.supabase.co/storage/v1/object/public/recipe-images/de7647e3-99e5-4e0e-bd72-cbbd617c4496-1780737560064.jpg",
  "Roasted Pork Banh Mi": "https://jiejwvpjpejpozzxuamf.supabase.co/storage/v1/object/public/recipe-images/962af9cf-d08b-445c-814d-a743149c2c46-1780737984966.png",
  "Jamaican Pan Chicken": "https://jiejwvpjpejpozzxuamf.supabase.co/storage/v1/object/public/recipe-images/4702e2a2-801c-4085-bda4-acafe0a73256-1780737937210.png",
  "Chicken and Vegetable Soup": "https://jiejwvpjpejpozzxuamf.supabase.co/storage/v1/object/public/recipe-images/8e2477fc-f4f5-47d9-8a48-58becef06e57-1780738389473.png",
  "Salad Nicoise": "https://jiejwvpjpejpozzxuamf.supabase.co/storage/v1/object/public/recipe-images/58f3b782-0a24-4d70-a3a2-c4a7dcb82afe-1780742274501.jpg",
  "Lemon Butter Sauce for Fish": "https://i.ytimg.com/vi/o8M8aq8QVRc/maxresdefault.jpg",
  "Tabouli Salad": "https://jiejwvpjpejpozzxuamf.supabase.co/storage/v1/object/public/recipe-images/6d940b10-bbce-4a77-b4d5-52e88f622c9f-1780792529712.jpg",
  "Vietnamese Chicken Noodle Salad": "https://jiejwvpjpejpozzxuamf.supabase.co/storage/v1/object/public/recipe-images/97a33ff7-f7cf-4666-9556-79faf04a5f9e-1780792674516.jpg",
  "Easy Jamaican Jerk Chicken": "https://jiejwvpjpejpozzxuamf.supabase.co/storage/v1/object/public/recipe-images/831f43a1-ca9b-451e-9ee2-90529a3c441a-1780792842657.jpg",
  "Salmon Poke Bowl": "https://jiejwvpjpejpozzxuamf.supabase.co/storage/v1/object/public/recipe-images/c65719cb-6810-4614-b811-9694bec2f16f-1782118363836.jpg",
  "Chinese Chicken and Corn Soup": "https://jiejwvpjpejpozzxuamf.supabase.co/storage/v1/object/public/recipe-images/ead692d9-43c4-47bd-8ab7-e03a22aedd95-1782468812033.jpg",
  "Chilli Con Carne": "https://jiejwvpjpejpozzxuamf.supabase.co/storage/v1/object/public/recipe-images/646bb58f-c258-42ca-98db-f1db976b2f10-1782892139877.jpg"
};

exports.handler = async () => {
  const cors = { 'Content-Type': 'application/json' };
  try {
    // Find next recipe without a Cloudinary image
    const dbResult = await tursoRun(
      "SELECT id, title, image_url FROM recipes WHERE (image_url IS NULL OR image_url = '' OR image_url LIKE '%supabase%' OR image_url LIKE '%ytimg%') AND title != 'Air Fryer Chips' LIMIT 1"
    );
    const recipes = rowsToObjects(dbResult);

    if (recipes.length === 0) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ done: true, message: 'All images on Cloudinary!' }) };
    }

    const recipe = recipes[0];
    const srcUrl = SUPABASE_IMAGES[recipe.title];
    if (!srcUrl) {
      await tursoRun("UPDATE recipes SET image_url = '' WHERE id = ?", [{ type: 'text', value: String(recipe.id) }]);
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, skipped: recipe.title }) };
    }

    // Upload to Cloudinary via URL
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = 'thegoodcook';
    const public_id = `recipe-${recipe.id}`;
    const sigStr = `folder=${folder}&public_id=${public_id}&timestamp=${timestamp}${CLOUDINARY_SECRET}`;
    const signature = await sha1(sigStr);

    const form = new FormData();
    form.append('file', srcUrl);
    form.append('api_key', CLOUDINARY_KEY);
    form.append('timestamp', timestamp);
    form.append('signature', signature);
    form.append('folder', folder);
    form.append('public_id', public_id);

    const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, {
      method: 'POST',
      body: form
    });
    const uploadData = await uploadRes.json();

    if (!uploadData.secure_url) throw new Error(JSON.stringify(uploadData));

    await tursoRun(
      'UPDATE recipes SET image_url = ? WHERE id = ?',
      [{ type: 'text', value: uploadData.secure_url }, { type: 'text', value: String(recipe.id) }]
    );

    const remaining = await tursoRun(
      "SELECT COUNT(*) FROM recipes WHERE (image_url IS NULL OR image_url = '' OR image_url LIKE '%supabase%' OR image_url LIKE '%ytimg%') AND title != 'Air Fryer Chips'"
    );
    const left = remaining?.rows?.[0]?.[0]?.value ?? '?';

    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, migrated: recipe.title, cloudinary_url: uploadData.secure_url, remaining: left }) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
