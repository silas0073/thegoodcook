const APP_VERSION = '1.8.6';
document.getElementById('version-badge').textContent = 'v' + APP_VERSION;

// ===== STATE =====
let recipes = [];
let activeTag = null;
let currentId = null;
let localNotes = JSON.parse(localStorage.getItem('gc-notes') || '{}');

const EMOJI_MAP = {
  chicken:'🍗', beef:'🥩', pork:'🥓', fish:'🐟', seafood:'🦐', vegetarian:'🥗',
  vegan:'🌱', pasta:'🍝', soup:'🍲', salad:'🥗', dessert:'🍰', cake:'🎂',
  bread:'🍞', breakfast:'🍳', pizza:'🍕', rice:'🍚', noodles:'🍜', curry:'🍛',
  mexican:'🌮', italian:'🍝', asian:'🥢', indian:'🍛', mediterranean:'🫒',
  baking:'🧁', slow:'⏱', quick:'⚡', bbq:'🔥', comfort:'🏠', healthy:'💚'
};

// ===== NAME =====
let userName = localStorage.getItem('gc-user') || '';
function initUser() {
  if (!userName) {
    document.getElementById('name-screen').style.display = 'flex';
  } else {
    showApp();
  }
}
function saveName() {
  const n = document.getElementById('name-input').value.trim();
  if (!n) return;
  userName = n;
  localStorage.setItem('gc-user', n);
  showApp();
}
function changeName() {
  const n = prompt('Change your name:', userName);
  if (n && n.trim()) {
    userName = n.trim();
    localStorage.setItem('gc-user', userName);
    document.getElementById('user-pill').textContent = userName;
  }
}
function showApp() {
  document.getElementById('name-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('user-pill').textContent = userName;
  loadRecipes();
}

// ===== DATA =====
async function loadRecipes() {
  setSyncStatus('loading', 'Syncing…');
  try {
    const r = await fetch('/.netlify/functions/recipes');
    if (!r.ok) throw new Error('Server error ' + r.status);
    const data = await r.json();
    if (!Array.isArray(data)) throw new Error('Bad response');
    recipes = data;
    localStorage.setItem('gc-cache', JSON.stringify(recipes));
    setSyncStatus('', '');
  } catch (e) {
    const cache = localStorage.getItem('gc-cache');
    if (cache) { recipes = JSON.parse(cache); setSyncStatus('error', 'Could not connect to shared cookbook. Showing local cache.'); }
    else { setSyncStatus('error', 'Could not load recipes: ' + e.message); }
  }
  renderTags(); renderRecipes();
}

function setSyncStatus(type, msg) {
  const el = document.getElementById('sync-status');
  el.textContent = msg;
  el.className = 'sync-status' + (type === 'error' ? ' error' : '');
}

async function saveRecipeToServer(recipe) {
  const r = await fetch('/.netlify/functions/recipes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(recipe)
  });
  if (!r.ok) throw new Error('Save failed: ' + r.status);
  return r.json();
}

async function updateRecipeOnServer(id, updates) {
  const r = await fetch('/.netlify/functions/recipes/' + id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  if (!r.ok) throw new Error('Update failed: ' + r.status);
  return r.json();
}

async function deleteRecipeFromServer(id) {
  const r = await fetch('/.netlify/functions/recipes/' + id, { method: 'DELETE' });
  if (!r.ok) throw new Error('Delete failed: ' + r.status);
}

// ===== RENDER =====
function guessEmoji(tags) {
  if (!Array.isArray(tags)) return '🍴';
  for (const t of tags) if (EMOJI_MAP[t]) return EMOJI_MAP[t];
  return '🍴';
}

function renderTags() {
  const counts = {};
  recipes.forEach(r => (r.tags || []).forEach(t => { counts[t] = (counts[t] || 0) + 1; }));
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([t]) => t);
  const el = document.getElementById('tag-filters');
  el.innerHTML = sorted.map(t =>
    `<button class="tag-pill${activeTag === t ? ' active' : ''}" onclick="setTag('${t}')">${t}</button>`
  ).join('');
}

function setTag(t) { activeTag = activeTag === t ? null : t; renderTags(); renderRecipes(); }

function renderRecipes() {
  const q = document.getElementById('search').value.toLowerCase();
  let list = recipes.filter(r => {
    const matchQ = !q || (r.title||'').toLowerCase().includes(q) ||
      (r.ingredients||'').toLowerCase().includes(q) ||
      (r.tags||[]).some(t => t.toLowerCase().includes(q));
    const matchT = !activeTag || (r.tags||[]).includes(activeTag);
    return matchQ && matchT;
  });
  document.getElementById('recipe-count').textContent = list.length + ' recipe' + (list.length !== 1 ? 's' : '');
  document.getElementById('recipe-grid').innerHTML = list.map(r => cardHTML(r)).join('');
}

function cardHTML(r) {
  const imgHtml = r.image_url
    ? `<img class="card-image" src="${r.image_url}" alt="${r.title}" onerror="this.style.display='none'" />`
    : '';
  const emojiStyle = r.image_url ? 'style="display:none"' : '';
  const sourceBadge = r.source_label
    ? `<span class="source-badge ${r.source || 'text'}">${r.source_label}</span>` : '';
  const addedBy = r.added_by ? `<div class="added-by-card">by ${r.added_by}</div>` : '';
  return `<div class="recipe-card" onclick="openDetail('${r.id}')">
    ${imgHtml}
    ${r.starred ? '<span class="star-corner">★</span>' : ''}
    <span class="recipe-emoji" ${emojiStyle}>${r.emoji || guessEmoji(r.tags)}</span>
    <div class="card-title">${r.title || 'Untitled'}</div>
    <div class="card-meta">
      ${r.time ? `<span>⏱ ${r.time}</span>` : ''}
      ${r.servings ? `<span>👥 ${r.servings}</span>` : ''}
    </div>
    <div class="card-tags">${(r.tags||[]).slice(0,3).map(t => `<span class="card-tag">${t}</span>`).join('')}</div>
    ${sourceBadge}
    ${addedBy}
  </div>`;
}

// ===== DETAIL =====
function openDetail(id) {
  const r = recipes.find(x => String(x.id) === String(id));
  if (!r) return;
  currentId = r.id;
  document.getElementById('detail-emoji').textContent = r.emoji || guessEmoji(r.tags);
  document.getElementById('detail-title').textContent = r.title || 'Untitled';
  document.getElementById('detail-time').textContent = r.time ? '⏱ ' + r.time : '';
  document.getElementById('detail-servings').textContent = r.servings ? '👥 ' + r.servings : '';
  const srcEl = document.getElementById('detail-source');
  if (r.source_url) {
    srcEl.innerHTML = `<a class="detail-source-link" href="${r.source_url}" target="_blank" rel="noopener">↗ ${r.source_label || 'Source'}</a>`;
  } else {
    srcEl.innerHTML = r.source_label ? r.source_label : '';
  }
  document.getElementById('detail-added-by').textContent = r.added_by ? 'by ' + r.added_by : '';
  document.getElementById('detail-tags').innerHTML = (r.tags||[]).map(t => `<span class="detail-tag">${t}</span>`).join('');
  document.getElementById('detail-ingredients').textContent = r.ingredients || '';
  document.getElementById('detail-instructions').textContent = r.instructions || '';
  document.getElementById('detail-notes').value = localNotes[r.id] || '';

  // Image
  const img = document.getElementById('detail-image');
  const removeBtn = document.getElementById('remove-img-btn');
  const fetchBtn = document.getElementById('fetch-img-btn');
  if (r.image_url) {
    img.src = r.image_url; img.style.display = 'block';
    if (removeBtn) removeBtn.style.display = 'inline-flex';
  } else {
    img.style.display = 'none';
    if (removeBtn) removeBtn.style.display = 'none';
  }
  if (fetchBtn) fetchBtn.style.display = r.source_url ? 'inline-flex' : 'none';

  const starBtn = document.getElementById('star-btn');
  starBtn.textContent = r.starred ? '★' : '☆';
  starBtn.classList.toggle('active', !!r.starred);

  document.getElementById('img-status').textContent = '';
  document.getElementById('detail-overlay').classList.add('open');
}

function closeDetail() { document.getElementById('detail-overlay').classList.remove('open'); }

function saveNote() {
  if (!currentId) return;
  localNotes[currentId] = document.getElementById('detail-notes').value;
  localStorage.setItem('gc-notes', JSON.stringify(localNotes));
}

async function toggleStar() {
  const r = recipes.find(x => String(x.id) === String(currentId));
  if (!r) return;
  r.starred = !r.starred;
  try {
    await updateRecipeOnServer(currentId, { starred: r.starred });
  } catch {}
  const starBtn = document.getElementById('star-btn');
  starBtn.textContent = r.starred ? '★' : '☆';
  starBtn.classList.toggle('active', r.starred);
  renderRecipes();
}

async function deleteRecipe() {
  if (!currentId || !confirm('Delete this recipe?')) return;
  try {
    await deleteRecipeFromServer(currentId);
    recipes = recipes.filter(r => String(r.id) !== String(currentId));
    closeDetail(); renderTags(); renderRecipes();
  } catch (e) { alert('Delete failed: ' + e.message); }
}

function printRecipe() {
  const r = recipes.find(x => String(x.id) === String(currentId));
  if (!r) return;
  const w = window.open('', '_blank');
  w.document.write(`<html><head><title>${r.title}</title><style>
    body{font-family:Georgia,serif;max-width:700px;margin:40px auto;padding:0 20px;color:#1a1a18}
    h1{font-size:26px;margin-bottom:8px} .meta{color:#888;margin-bottom:16px}
    h2{font-size:16px;margin:20px 0 8px;text-transform:uppercase;letter-spacing:.05em}
    pre{white-space:pre-wrap;font-family:inherit;font-size:14px;line-height:1.7}
  </style></head><body>
    <h1>${r.title}</h1>
    <p class="meta">${[r.time,r.servings].filter(Boolean).join(' · ')}</p>
    <h2>Ingredients</h2><pre>${r.ingredients}</pre>
    <h2>Instructions</h2><pre>${r.instructions}</pre>
    ${r.notes ? `<h2>Notes</h2><pre>${r.notes}</pre>` : ''}
  </body></html>`);
  w.document.close(); w.print();
}

// ===== EDIT =====
function editRecipe() {
  const r = recipes.find(x => String(x.id) === String(currentId));
  if (!r) return;
  document.getElementById('edit-title').value = r.title || '';
  document.getElementById('edit-time').value = r.time || '';
  document.getElementById('edit-servings').value = r.servings || '';
  document.getElementById('edit-tags').value = (r.tags||[]).join(', ');
  document.getElementById('edit-ingredients').value = r.ingredients || '';
  document.getElementById('edit-instructions').value = r.instructions || '';
  document.getElementById('edit-recipe-notes').value = r.notes || '';
  document.getElementById('edit-modal').style.display = 'flex';
}

function closeEdit() { document.getElementById('edit-modal').style.display = 'none'; }

async function saveEdit() {
  const r = recipes.find(x => String(x.id) === String(currentId));
  if (!r) return;
  const updates = {
    title: document.getElementById('edit-title').value.trim(),
    time: document.getElementById('edit-time').value.trim(),
    servings: document.getElementById('edit-servings').value.trim(),
    tags: document.getElementById('edit-tags').value.split(',').map(t => t.trim()).filter(Boolean),
    ingredients: document.getElementById('edit-ingredients').value.trim(),
    instructions: document.getElementById('edit-instructions').value.trim(),
    notes: document.getElementById('edit-recipe-notes').value.trim()
  };
  updates.emoji = guessEmoji(updates.tags);
  try {
    await updateRecipeOnServer(currentId, updates);
    Object.assign(r, updates);
    closeEdit(); openDetail(currentId); renderRecipes();
  } catch (e) { alert('Save failed: ' + e.message); }
}

// ===== IMAGES =====
async function fetchImage() {
  const r = recipes.find(x => String(x.id) === String(currentId));
  if (!r || !r.source_url) return;
  setImgStatus('loading', 'Fetching image…');
  try {
    const res = await fetch('/.netlify/functions/fetch-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceUrl: r.source_url, recipeId: r.id })
    });
    const data = await res.json();
    if (!res.ok || !data.url) throw new Error(data.error || 'No image found');
    await updateRecipeOnServer(currentId, { image_url: data.url });
    r.image_url = data.url;
    const img = document.getElementById('detail-image');
    img.src = data.url; img.style.display = 'block';
    const removeBtn = document.getElementById('remove-img-btn');
    if (removeBtn) removeBtn.style.display = 'inline-flex';
    setImgStatus('success', '✓ Image added');
    renderRecipes();
  } catch (e) { setImgStatus('error', e.message); }
}

async function uploadImage(input) {
  const file = input.files[0]; if (!file) return;
  setImgStatus('loading', 'Uploading…');
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const SUPABASE_URL = 'https://jiejwvpjpejpozzxuamf.supabase.co';
      const ext = file.name.split('.').pop() || 'jpg';
      const filename = `recipe-${currentId}.${ext}`;
      const r = await fetch(`/.netlify/functions/recipes`); // just to get ANON key via proxy not needed
      // Upload directly via Supabase public upload
      const base64 = e.target.result.split(',')[1];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/recipe-images/${filename}`, {
        method: 'POST',
        headers: { 'Content-Type': file.type, 'x-upsert': 'true' },
        body: bytes
      });
      if (!uploadRes.ok) throw new Error('Upload failed');
      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/recipe-images/${filename}`;
      await updateRecipeOnServer(currentId, { image_url: publicUrl });
      const rec = recipes.find(x => String(x.id) === String(currentId));
      if (rec) rec.image_url = publicUrl;
      const img = document.getElementById('detail-image');
      img.src = publicUrl; img.style.display = 'block';
      const removeBtn = document.getElementById('remove-img-btn');
      if (removeBtn) removeBtn.style.display = 'inline-flex';
      setImgStatus('success', '✓ Photo uploaded');
      renderRecipes();
    } catch (err) { setImgStatus('error', err.message); }
  };
  reader.readAsDataURL(file);
  input.value = '';
}

async function removeImage() {
  const r = recipes.find(x => String(x.id) === String(currentId));
  if (!r || !confirm('Remove image?')) return;
  await updateRecipeOnServer(currentId, { image_url: null });
  r.image_url = null;
  const img = document.getElementById('detail-image');
  img.style.display = 'none';
  const removeBtn = document.getElementById('remove-img-btn');
  if (removeBtn) removeBtn.style.display = 'none';
  setImgStatus('', '');
  renderRecipes();
}

function setImgStatus(type, msg) {
  const el = document.getElementById('img-status');
  el.className = 'status-msg' + (type ? ' ' + type : '');
  el.innerHTML = type === 'loading' ? `<div class="spinner"></div>${msg}` : msg;
}

// ===== ADD FROM URL / YOUTUBE =====
async function addFromUrl() {
  const url = document.getElementById('url-input').value.trim();
  if (!url) { setStatus('url-status', 'error', 'Please enter a URL.'); return; }

  // Check if YouTube URL
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if (ytMatch) {
    await addFromYoutube('url-status', url);
    return;
  }

  setStatus('url-status', 'loading', 'Fetching recipe…');
  try {
    // Fetch the page
    const fetchRes = await fetch('/.netlify/functions/fetch-recipe-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const pageData = await fetchRes.json();
    if (!fetchRes.ok) throw new Error(pageData.error || 'Could not fetch page');

    let parsed;
    if (pageData.isStructured) {
      parsed = parseStructuredRecipe(pageData.text);
    }

    if (!parsed) {
      // Fall back to Claude
      const text = await callClaude(PROMPT('Source URL: ' + url + '\n\n' + (pageData.text || '')));
      parsed = parseJSON(text);
    }

    if (!parsed?.title) throw new Error('Could not parse a recipe from that URL.');

    let domain = url;
    try { domain = new URL(url).hostname.replace('www.', ''); } catch {}

    const recipe = {
      ...parsed,
      emoji: guessEmoji(parsed.tags || []),
      source: 'url',
      source_label: domain,
      source_url: url,
      added_by: userName,
      starred: false
    };

    const saved = await saveRecipeToServer(recipe);
    recipes.unshift({ ...recipe, id: saved.id || saved });
    renderTags(); renderRecipes();
    setStatus('url-status', 'success', `✓ "${parsed.title}" added!`);
    document.getElementById('url-input').value = '';
    switchTab('browse', document.querySelector('.tab'));
  } catch (e) {
    setStatus('url-status', 'error', e.message);
  }
}

async function addFromYoutube(statusId, directUrl) {
  const url = directUrl || document.getElementById('url-input').value.trim();
  const statusEl = statusId || 'url-status';

  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if (!ytMatch) { setStatus(statusEl, 'error', 'Not a valid YouTube URL.'); return; }
  const videoId = ytMatch[1];

  setStatus(statusEl, 'loading', 'Fetching YouTube video info…');

  try {
    // Get video info via YouTube API
    const ytRes = await fetch('/.netlify/functions/fetch-recipe-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, videoId })
    });
    const ytData = await ytRes.json();

    setStatus(statusEl, 'loading', 'Extracting recipe…');

    // Try to find a recipe URL in the description and fetch it
    let recipeText = ytData.text || '';
    let recipeUrl = null;
    const urlMatch = recipeText.match(/https?:\/\/[^\s]+/g);
    if (urlMatch) {
      const SKIP = ['youtube.com', 'youtu.be', 'instagram.com', 'facebook.com', 'twitter.com', 'tiktok.com', 'linktr.ee', 'bit.ly', 'amzn'];
      const candidate = urlMatch.find(u => !SKIP.some(s => u.includes(s)));
      if (candidate) recipeUrl = candidate;
    }

    let parsed = null;
    if (recipeUrl) {
      try {
        const pageRes = await fetch('/.netlify/functions/fetch-recipe-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: recipeUrl })
        });
        const pageData = await pageRes.json();
        if (pageData.isStructured) {
          parsed = parseStructuredRecipe(pageData.text);
        }
        if (!parsed) {
          const claudeText = await callClaude(PROMPT('Recipe from: ' + recipeUrl + '\n\n' + pageData.text));
          parsed = parseJSON(claudeText);
        }
      } catch {}
    }

    // Fall back to parsing description
    if (!parsed) {
      const claudeText = await callClaude(PROMPT(
        'YouTube video: ' + (ytData.title || url) + '\nDescription:\n' + recipeText
      ));
      parsed = parseJSON(claudeText);
    }

    if (!parsed?.title) throw new Error('Could not find a recipe in this video.');

    const thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    const recipe = {
      ...parsed,
      emoji: guessEmoji(parsed.tags || []),
      source: 'youtube',
      source_label: ytData.channelName || 'YouTube',
      source_url: url,
      image_url: thumbnail,
      added_by: userName,
      starred: false
    };

    const saved = await saveRecipeToServer(recipe);
    recipes.unshift({ ...recipe, id: saved.id || saved });
    renderTags(); renderRecipes();
    setStatus(statusEl, 'success', `✓ "${parsed.title}" added!`);
    document.getElementById('url-input').value = '';
    switchTab('browse', document.querySelector('.tab'));
  } catch (e) {
    setStatus(statusEl, 'error', e.message);
  }
}

// ===== ADD FROM TEXT =====
async function addFromText() {
  const text = document.getElementById('text-input').value.trim();
  if (!text) { setStatus('text-status', 'error', 'Please paste some text first.'); return; }
  setStatus('text-status', 'loading', 'Extracting recipe…');
  try {
    const isEmail = text.includes('From:') || text.includes('Subject:') || text.includes('To:');
    const claudeText = await callClaude(PROMPT(text));
    const parsed = parseJSON(claudeText);
    if (!parsed?.title) throw new Error('Could not find a recipe in that text.');
    const recipe = {
      ...parsed,
      emoji: guessEmoji(parsed.tags || []),
      source: isEmail ? 'email' : 'text',
      source_label: isEmail ? 'from email' : 'pasted text',
      added_by: userName,
      starred: false
    };
    const saved = await saveRecipeToServer(recipe);
    recipes.unshift({ ...recipe, id: saved.id || saved });
    renderTags(); renderRecipes();
    setStatus('text-status', 'success', `✓ "${parsed.title}" added!`);
    document.getElementById('text-input').value = '';
    switchTab('browse', document.querySelector('.tab'));
  } catch (e) { setStatus('text-status', 'error', e.message); }
}

function handleFile(input) {
  const file = input.files[0]; if (!file) return;
  if (file.name.endsWith('.pdf')) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target.result.split(',')[1];
      setStatus('text-status', 'loading', 'Reading PDF…');
      try {
        const r = await fetch('/.netlify/functions/claude-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{
              role: 'user',
              content: [
                { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
                { type: 'text', text: PROMPT('Extract the recipe from this PDF document.') }
              ]
            }]
          })
        });
        const data = await r.json();
        const text = (data.content || []).map(c => c.text || '').join('');
        const parsed = parseJSON(text);
        if (!parsed?.title) throw new Error('Could not find a recipe in that PDF.');
        const recipe = { ...parsed, emoji: guessEmoji(parsed.tags || []), source: 'pdf', source_label: 'PDF', added_by: userName, starred: false };
        const saved = await saveRecipeToServer(recipe);
        recipes.unshift({ ...recipe, id: saved.id || saved });
        renderTags(); renderRecipes();
        setStatus('text-status', 'success', `✓ "${parsed.title}" added!`);
        switchTab('browse', document.querySelector('.tab'));
      } catch (err) { setStatus('text-status', 'error', err.message); }
    };
    reader.readAsDataURL(file);
  } else {
    const reader = new FileReader();
    reader.onload = e => { document.getElementById('text-input').value = e.target.result; addFromText(); };
    reader.onerror = () => setStatus('text-status', 'error', 'Could not read that file.');
    reader.readAsText(file);
  }
  input.value = '';
}

// ===== CLAUDE API =====
const PROMPT = ctx => `Extract a recipe from the following and return ONLY a valid JSON object with these exact fields:
title (string), tags (array of 3-5 lowercase strings like cuisine, main ingredient, cooking method), time (string e.g. "30 min"), servings (string e.g. "4 servings"), ingredients (multi-line string, one item per line starting with quantity), instructions (multi-line numbered steps string), notes (string of tips or empty string).

${ctx}

Return ONLY the JSON object. No markdown fences, no explanation, no preamble.`;

async function callClaude(prompt) {
  const r = await fetch('/.netlify/functions/claude-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] })
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error?.message || 'API error ' + r.status); }
  const d = await r.json();
  return (d.content || []).map(c => c.text || '').join('');
}

function parseJSON(text) {
  try {
    const c = text.replace(/```json|```/g, '').trim();
    const start = c.indexOf('{');
    const end = c.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    return JSON.parse(c.slice(start, end + 1));
  } catch { return null; }
}

function parseStructuredRecipe(jsonStr) {
  try {
    const schema = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
    const r = schema['@type'] === 'Recipe' ? schema
      : (schema['@graph'] || []).find(n => n['@type'] === 'Recipe')
      || (Array.isArray(schema) ? schema.find(n => n['@type'] === 'Recipe') : null);
    if (!r) return null;
    const getTime = (iso) => {
      if (!iso) return '';
      const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
      if (!m) return '';
      const h = parseInt(m[1] || 0), min = parseInt(m[2] || 0);
      return h ? `${h}h ${min}m` : `${min} min`;
    };
    const ingredients = Array.isArray(r.recipeIngredient) ? r.recipeIngredient.join('\n') : '';
    const instructions = Array.isArray(r.recipeInstructions)
      ? r.recipeInstructions.map((s, i) => `${i + 1}. ${typeof s === 'string' ? s : s.text || ''}`).join('\n')
      : (typeof r.recipeInstructions === 'string' ? r.recipeInstructions : '');
    const totalTime = getTime(r.totalTime || r.cookTime);
    const servings = r.recipeYield ? (Array.isArray(r.recipeYield) ? r.recipeYield[0] : r.recipeYield) + '' : '';
    const keywords = (r.keywords || '').split(',').map(k => k.trim().toLowerCase()).filter(Boolean).slice(0, 5);
    const cuisine = (r.recipeCuisine || '').toLowerCase();
    const category = (r.recipeCategory || '').toLowerCase();
    const tags = [...new Set([...keywords, cuisine, category].filter(Boolean))].slice(0, 5);
    if (!r.name || !ingredients) return null;
    return { title: r.name, ingredients, instructions, time: totalTime, servings, tags, notes: r.description || '' };
  } catch { return null; }
}

// ===== UI UTILS =====
function setStatus(id, type, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = 'status-msg ' + type;
  el.innerHTML = type === 'loading' ? `<div class="spinner"></div>${msg}` : msg;
}

function switchTab(tab, btn) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-' + tab).classList.add('active');
  if (btn) btn.classList.add('active');
}

// ===== INIT =====
initUser();
