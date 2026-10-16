(function () {
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LABELS = ['', 'Avoid', 'Poor', 'Weak', 'Meh', 'Okay', 'Decent', 'Good', 'Great', 'Excellent', 'Perfect'];
const DEFAULT_CATS = ['Coconut Water', 'Food', 'Drinks', 'Gear', 'Home', 'Other'];
const BUCKET = 'photos';
const CFG = window.APP_CONFIG || {};

/* ---------- pixel art + icons ---------- */
const PAL = { o: '#E8A200', y: '#FFD84D', w: '#FFF6C2', c: '#C9DAFF', e: '#5A6BFF', f: '#2B2FA0' };
const STAR = ['.....o.....', '....oyo....', '....oyo....', 'ooooyyyoooo', 'oywyyyyyyyo', '.oyyyyyyyo.', '..oyyyyyo..', '..oyyyyyo..', '.oyyoooyyo.', '.oyo...oyo.', '..o.....o..'];
const SPARK = ['..c..', '..c..', 'ccccc', '..c..', '..c..'];
function pixel(rows) {
  const h = rows.length, w = rows[0].length; let r = '';
  for (let y = 0; y < h; y++) { let x = 0; while (x < w) { const k = rows[y][x]; if (k === '.') { x++; continue } let n = 1; while (x + n < w && rows[y][x + n] === k) n++; r += `<rect x="${x}" y="${y}" width="${n}" height="1" fill="${PAL[k]}"/>`; x += n } }
  return `<svg viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${r}</svg>`;
}
function cloudRows() {
  const W = 80, H = 11, C = [[8, 8, 4], [17, 5.5, 5.5], [27, 6.5, 5], [36, 8, 4], [46, 5.5, 5.8], [56, 6.5, 5], [65, 7.5, 4.2], [73, 8, 3.6], [78, 9, 3]];
  const f = (x, y) => y >= H ? true : x < 0 || x >= W ? false : ((y >= 9 && x >= 2 && x <= 78) || C.some(([cx, cy, r]) => (x + .5 - cx) ** 2 + (y + .5 - cy) ** 2 <= r * r));
  const rows = []; for (let y = 0; y < H; y++) { let s = ''; for (let x = 0; x < W; x++) { s += !f(x, y) ? '.' : (f(x - 1, y) && f(x + 1, y) && f(x, y - 1)) ? 'f' : 'e' } rows.push(s) } return rows;
}
const CLOUDS = pixel(cloudRows());
const SKY = [[3, 9, 22, 0, 'S'], [92, 6, 22, .8, 'S'], [5, 27, 10, 1.4, 'K'], [91, 24, 10, .3, 'K'], [2, 46, 22, 1.1, 'S'], [93, 43, 11, 1.9, 'S'], [5, 63, 10, .6, 'K'], [91, 61, 33, 1.5, 'S'], [3, 80, 11, .2, 'S'], [94, 78, 10, 1, 'K'], [48, 3, 10, 1.7, 'K'], [22, 94, 15, .9, 'K']];
const skyInner = () => SKY.map(([l, t, s, d, k]) => `<span class="sk" style="left:${l}%;top:${t}%;width:${s}px;animation-delay:${d}s">${pixel(k === 'S' ? STAR : SPARK)}</span>`).join('');
const skyHTML = () => `<div class="sky" aria-hidden="true">${skyInner()}</div>`;
const cloudsHTML = () => `<div class="clouds" aria-hidden="true">${CLOUDS}</div>`;
const IC = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M4 18l6-5 4 3 3-2 3 3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>'
};
const ic = (n, s = 22) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]}</svg>`;

/* ---------- state ---------- */
const sb = (window.supabase && CFG.supabaseUrl && CFG.supabaseKey)
  ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;
let user = null, currentUid = null;
let items = [], cats = [], filter = 'All', sort = 'new', q = '';
let draft = null, openId = null, lastCat = null, saving = false;
let loadState = 'loading'; // loading | ready | error
let authMode = 'in', authEmail = '', authBusy = false, lastLoad = 0;

/* ---------- helpers ---------- */
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 3200) }
function friendly(e) {
  if (!navigator.onLine) return "You're offline. Try again when you're connected.";
  const m = (e && e.message) || String(e || '');
  if (/failed to fetch|networkerror|load failed/i.test(m)) return "Can't reach the server. Check your connection and try again.";
  return m || 'Something went wrong. Try again.';
}
const tier = n => n <= 4 ? 't-lo' : n <= 7 ? 't-mid' : 't-hi';
const fmt = ts => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: new Date(ts).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16) }));
function hl(name, needle) {
  if (!needle) return esc(name); const l = name.toLowerCase(); if (l.length !== name.length) return esc(name);
  let out = '', i = 0, j; while ((j = l.indexOf(needle, i)) >= 0) { out += esc(name.slice(i, j)) + '<mark>' + esc(name.slice(j, j + needle.length)) + '</mark>'; i = j + needle.length }
  return out + esc(name.slice(i));
}
function shrink(file, max = 1100) {
  return new Promise((res, rej) => {
    const u = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight)), w = Math.round(im.naturalWidth * k), h = Math.round(im.naturalHeight * k);
      const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(im, 0, 0, w, h); URL.revokeObjectURL(u);
      c.toBlob(b => b ? res(b) : rej(new Error('encode')), 'image/jpeg', .82);
    };
    im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('load')) }; im.src = u;
  });
}
const fromRow = r => ({ id: r.id, name: r.name, cat: r.category, score: r.score, notes: r.notes || '', photoPath: r.photo_path || null, photoUrl: null, created: Date.parse(r.created_at), updated: Date.parse(r.updated_at) });

/* ---------- local cache (instant first paint, read-only offline) ---------- */
const ckey = () => 'ra-cache-v1-' + currentUid;
function writeCache() { try { localStorage.setItem(ckey(), JSON.stringify({ items, cats })) } catch (_) { } }
function readCache() { try { const c = JSON.parse(localStorage.getItem(ckey())); if (c && Array.isArray(c.items)) return c } catch (_) { } return null }
function clearCache(uid) { try { localStorage.removeItem('ra-cache-v1-' + uid); localStorage.removeItem('ra-lastcat-' + uid) } catch (_) { } }

/* ---------- data ---------- */
async function signPhotos(list) {
  const paths = list.filter(i => i.photoPath).map(i => i.photoPath); if (!paths.length) return;
  try {
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(paths, 86400); if (error) throw error;
    const m = new Map(data.map(d => [d.path, d.signedUrl]));
    list.forEach(i => { if (i.photoPath) i.photoUrl = m.get(i.photoPath) || null });
  } catch (_) { /* photos are optional; ratings still show */ }
}
async function seedCats() {
  cats = [...DEFAULT_CATS];
  try { await sb.from('categories').upsert(DEFAULT_CATS.map((name, i) => ({ user_id: currentUid, name, sort: i })), { onConflict: 'user_id,name', ignoreDuplicates: true }) } catch (_) { }
}
async function loadData() {
  if (!sb || !currentUid) return;
  const uid = currentUid;
  if (!items.length) loadState = 'loading';
  render();
  try {
    const [c, r] = await Promise.all([
      sb.from('categories').select('name,sort').order('sort').order('name'),
      sb.from('ratings').select('*').order('created_at', { ascending: false })
    ]);
    if (c.error) throw c.error; if (r.error) throw r.error;
    if (uid !== currentUid) return;
    cats = c.data.map(x => x.name);
    if (!cats.length) await seedCats();
    const list = r.data.map(fromRow);
    for (const i of list) if (!cats.includes(i.cat)) cats.push(i.cat);
    await signPhotos(list);
    if (uid !== currentUid) return;
    items = list; loadState = 'ready'; lastLoad = Date.now(); writeCache();
  } catch (e) {
    if (items.length) { loadState = 'ready'; toast(friendly(e)) } else { loadState = 'error'; $('#statusMsg').textContent = friendly(e) }
  }
  render();
}

/* ---------- list ---------- */
const needle = () => q.trim().toLowerCase();
function visible() {
  const n = needle();
  const l = items.filter(i => (filter === 'All' || i.cat === filter) && (!n || i.name.toLowerCase().includes(n)));
  const s = { new: (a, b) => b.created - a.created, high: (a, b) => b.score - a.score || b.created - a.created, low: (a, b) => a.score - b.score || b.created - a.created, name: (a, b) => a.name.localeCompare(b.name) }[sort];
  return l.sort(s);
}
function render() {
  if (!currentUid) return;
  const used = [...new Set(items.map(i => i.cat))];
  if (filter !== 'All' && !used.includes(filter)) filter = 'All';
  const n = needle(), has = items.length > 0, ready = loadState === 'ready';
  $('#chips').innerHTML = ['All', ...used].map(c => `<button class="chip" type="button" data-filter="${esc(c)}" aria-pressed="${c === filter}">${esc(c)}</button>`).join('');
  $('#chips').hidden = !has;
  $('#searchBox').hidden = !has;
  $('#qclear').hidden = !q;
  const l = visible();
  $('#shown').textContent = `${filter === 'All' ? 'All ratings' : filter} (${l.length})`;
  $('#toolbar').hidden = !has || !l.length;
  $('#status').hidden = ready || has;
  $('#statusMsg').textContent = loadState === 'error' ? $('#statusMsg').textContent : 'Loading your ratings…';
  $('#retry').hidden = loadState !== 'error';
  $('#empty').hidden = !(ready && !has);
  const nomatch = has && !l.length;
  $('#nomatch').hidden = !nomatch;
  if (nomatch) {
    $('#nomatchMsg').textContent = n ? `Nothing named "${q.trim()}"${filter !== 'All' ? ' in ' + filter : ''}.` : `No ratings in ${filter} yet.`;
    $('#nomatchBtn').textContent = n ? 'Clear search' : 'Show all';
  }
  $('#list').innerHTML = l.map(it => `<li><button class="card frame" type="button" data-open="${esc(it.id)}">
    <span class="thumb">${it.photoUrl ? `<img src="${esc(it.photoUrl)}" alt="" loading="lazy" decoding="async">` : pixel(STAR)}</span>
    <span style="min-width:0"><h3>${hl(it.name, n)}</h3><div class="meta">${esc(it.cat)} · ${fmt(it.created)}</div></span>
    <span class="score ${tier(it.score)}">${it.score}<small>/10</small></span></button></li>`).join('');
}

/* ---------- sheets ---------- */
const corners = '<i></i><i></i><i></i><i></i>';
function showSheet(html) { const s = $('#sheet'); s.innerHTML = skyHTML() + cloudsHTML() + html; s.hidden = false; s.scrollTop = 0; document.documentElement.style.overflow = 'hidden' }
function closeSheet() {
  const s = $('#sheet'); if (draft && draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
  s.hidden = true; s.innerHTML = ''; draft = null; openId = null; document.documentElement.style.overflow = '';
  if (!$('#shell').hidden) $('#add').focus?.();
}
function openDetail(id) {
  const it = items.find(i => i.id === id); if (!it) return; openId = id;
  showSheet(`<div class="sheet-in">
    <div class="sheet-bar frame"><button class="iconbtn" data-act="close" type="button" aria-label="Back">${ic('x')}</button><h2>${esc(it.cat)}</h2><span></span></div>
    ${it.photoUrl ? `<div class="pframe">${corners}<img class="d-photo" src="${esc(it.photoUrl)}" alt="Photo of ${esc(it.name)}"></div>` : ''}
    <div class="d-head frame"><h2>${esc(it.name)}</h2><div class="score ${tier(it.score)}">${it.score}<small>/10</small></div></div>
    <div class="meta" style="margin:0 4px">${LABELS[it.score]} · rated ${fmt(it.created)}${it.updated - it.created > 60000 ? ' · edited ' + fmt(it.updated) : ''}</div>
    ${it.notes ? `<div class="notes frame">${esc(it.notes)}</div>` : '<div class="meta" style="margin:0 4px">No review written.</div>'}
    <div class="actions" id="dActions"><button class="btn violet" data-act="edit" type="button">Edit</button><button class="btn danger" data-act="askdel" type="button">Delete</button></div>
  </div>`);
}
function openAccount() {
  showSheet(`<div class="sheet-in">
    <div class="sheet-bar frame"><button class="iconbtn" data-act="close" type="button" aria-label="Close">${ic('x')}</button><h2>Account</h2><span></span></div>
    <div class="block frame"><div class="lbl">Signed in as</div><div class="acct-email">${esc(user?.email || '')}</div></div>
    <div class="block frame"><div class="lbl">Password</div><p class="meta" style="margin:0">We'll email you a link to choose a new one.</p><button class="btn" data-act="pwreset" type="button">Email me a reset link</button></div>
    <div class="block frame"><div class="lbl">Log out</div><p class="meta" style="margin:0">Your ratings stay saved to your account.</p><button class="btn danger" data-act="logout" type="button">Log out</button></div>
  </div>`);
}

/* ---------- form ---------- */
function openForm(it) {
  draft = it ? { ...it, isNew: false, blob: null, previewUrl: null }
    : { id: newId(), name: '', cat: lastCat && cats.includes(lastCat) ? lastCat : cats[0], score: 0, notes: '', photoPath: null, photoUrl: null, blob: null, previewUrl: null, isNew: true };
  showSheet(`<div class="sheet-in">
    <div class="sheet-bar frame"><button class="iconbtn" data-act="cancel" type="button" aria-label="Cancel">${ic('x')}</button><h2>${draft.isNew ? 'Rate something' : 'Edit rating'}</h2><span></span></div>
    <div class="pframe">${corners}<div class="photo" id="photoBox"></div></div>
    <div class="photo-btns"><button class="btn" data-act="camera" type="button">${ic('camera', 20)}Take photo</button><button class="btn" data-act="library" type="button">${ic('image', 20)}Choose photo</button></div>
    <input type="file" id="fCam" accept="image/*" capture="environment" hidden>
    <input type="file" id="fLib" accept="image/*" hidden>
    <div class="block frame"><label for="name">Product name</label><input type="text" id="name" maxlength="120" autocomplete="off" placeholder="e.g. Vita Coco Pure" value="${esc(draft.name)}"></div>
    <div class="block frame"><div class="lbl">Category</div><div id="catChips" class="chips wrap" role="radiogroup" aria-label="Category"></div>
      <div class="row" id="newCatRow" hidden><input type="text" id="newCat" maxlength="40" placeholder="New category name" autocomplete="off" aria-label="New category name"><button class="btn" data-act="addcat" type="button">Add</button></div></div>
    <div class="block frame"><div class="lbl"><span>Rate it</span><span id="rlabel"></span></div><div id="rate" class="rate" role="radiogroup" aria-label="Rating from 1 to 10"></div></div>
    <div class="block frame"><label for="notes"><span>Add a note</span><span class="opt">(optional)</span></label><textarea id="notes" rows="5" maxlength="5000" placeholder="What did you think? Taste, quality, vibes…">${esc(draft.notes)}</textarea></div>
    <div class="savebar"><button class="save" id="save" data-act="save" type="button">${pixel(STAR)}<span id="saveLbl">Save</span>${pixel(STAR)}</button></div>
  </div>`);
  paintPhoto(); paintCats(); paintRate(); validate();
  $('#name').addEventListener('input', e => { draft.name = e.target.value; validate() });
  $('#notes').addEventListener('input', e => { draft.notes = e.target.value });
  $('#newCat').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addCat() } });
  for (const id of ['fCam', 'fLib']) $('#' + id).addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f || !draft) return;
    try { const b = await shrink(f); if (!draft) return; draft.blob = b; if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl); draft.previewUrl = URL.createObjectURL(b); paintPhoto() }
    catch (err) { toast("Couldn't read that photo. Try another.") }
  });
  if (draft.isNew) $('#name').focus({ preventScroll: true });
}
function paintPhoto() {
  const b = $('#photoBox'); if (!b || !draft) return;
  const u = draft.previewUrl || draft.photoUrl;
  b.classList.toggle('has', !!u);
  b.innerHTML = u ? `<img src="${esc(u)}" alt="Product photo preview">` : '<span>No photo yet.<br>Take one or choose from your library.</span>';
}
function paintCats() {
  $('#catChips').innerHTML = cats.map(c => `<button class="chip" type="button" role="radio" aria-checked="${c === draft.cat}" data-cat="${esc(c)}">${esc(c)}</button>`).join('') + `<button class="chip" type="button" data-act="newcat">+ New</button>`;
}
function paintRate() {
  $('#rate').innerHTML = Array.from({ length: 10 }, (_, i) => `<button type="button" role="radio" aria-checked="${draft.score === i + 1}" aria-label="${i + 1}, ${LABELS[i + 1]}" data-score="${i + 1}">${i + 1}</button>`).join('');
  $('#rlabel').textContent = draft.score ? `${draft.score}/10 · ${LABELS[draft.score]}` : 'Tap a number';
}
function validate() { const b = $('#save'); if (!b || !draft) return; b.disabled = saving || !(draft.name.trim() && draft.score && draft.cat) }
async function addCat() {
  const el = $('#newCat'), v = el.value.trim(); if (!v) return;
  const ex = cats.find(c => c.toLowerCase() === v.toLowerCase());
  if (!ex) {
    cats.push(v);
    sb.from('categories').insert({ name: v, sort: cats.length - 1 }).then(() => writeCache(), () => { }); // best effort; also derived from your ratings
  }
  draft.cat = ex || v; el.value = ''; $('#newCatRow').hidden = true; paintCats(); validate();
}
async function save() {
  if (!draft || saving || !draft.name.trim() || !draft.score) return;
  saving = true; validate(); $('#saveLbl').textContent = 'Saving…';
  try {
    const d = draft; let photoPath = d.photoPath || null;
    if (d.blob) {
      const path = `${currentUid}/${d.id}.jpg`;
      const up = await sb.storage.from(BUCKET).upload(path, d.blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' });
      if (up.error) throw up.error; photoPath = path;
    }
    const row = { name: d.name.trim(), category: d.cat, score: d.score, notes: d.notes.trim(), photo_path: photoPath };
    const res = d.isNew ? await sb.from('ratings').insert({ id: d.id, ...row }).select().single()
      : await sb.from('ratings').update(row).eq('id', d.id).select().single();
    if (res.error) throw res.error;
    const it = fromRow(res.data);
    if (it.photoPath) { try { const s = await sb.storage.from(BUCKET).createSignedUrl(it.photoPath, 86400); it.photoUrl = s.data?.signedUrl || null } catch (_) { } }
    const i = items.findIndex(x => x.id === it.id); if (i >= 0) items[i] = it; else items.push(it);
    if (!cats.includes(it.cat)) cats.push(it.cat);
    lastCat = it.cat; try { localStorage.setItem('ra-lastcat-' + currentUid, lastCat) } catch (_) { }
    loadState = 'ready'; writeCache();
    const wasNew = d.isNew; saving = false; closeSheet(); render(); toast(wasNew ? 'Saved' : 'Updated');
  } catch (e) {
    saving = false; toast(friendly(e)); const l = $('#saveLbl'); if (l) l.textContent = 'Save'; validate();
  }
}
async function remove() {
  const it = items.find(i => i.id === openId); if (!it) return;
  try {
    const r = await sb.from('ratings').delete().eq('id', it.id); if (r.error) throw r.error;
    if (it.photoPath) sb.storage.from(BUCKET).remove([it.photoPath]).catch(() => { });
    items = items.filter(i => i.id !== it.id); writeCache(); closeSheet(); render(); toast('Deleted');
  } catch (e) { toast(friendly(e)) }
}

/* ---------- auth screens ---------- */
function showShell() { $('#auth').hidden = true; $('#shell').hidden = false }
function showAuth(mode = 'in', msg = null, kind = 'err') {
  authMode = mode; $('#shell').hidden = true; $('#auth').hidden = false;
  if ($('#sheet').hidden === false) closeSheet();
  renderAuth(msg, kind);
}
function renderAuth(msg, kind) {
  const m = authMode, tabs = m === 'in' || m === 'up';
  const title = m === 'forgot' ? 'Reset your password' : m === 'reset' ? 'Choose a new password' : '';
  const submit = { in: 'Log in', up: 'Create account', forgot: 'Email me a reset link', reset: 'Save new password' }[m];
  $('#auth').innerHTML = `<div class="authwrap">
    <div class="auth-brand"><span class="logo big">${pixel(STAR)}</span><h1>Rate My Coconut Water</h1><p class="meta c" style="margin:0">Your ratings, saved to your own account.</p></div>
    <form class="authcard frame" id="authForm" novalidate>
      ${tabs ? `<div class="tabs" role="group" aria-label="Log in or create account"><button type="button" class="chip" data-mode="in" aria-pressed="${m === 'in'}">Log in</button><button type="button" class="chip" data-mode="up" aria-pressed="${m === 'up'}">Create account</button></div>` : `<h2 class="auth-title">${title}</h2>`}
      ${m !== 'reset' ? `<div class="field"><label for="aemail">Email</label><input type="email" id="aemail" autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" required value="${esc(authEmail)}"></div>` : ''}
      ${m !== 'forgot' ? `<div class="field"><label for="apw"><span>${m === 'reset' ? 'New password' : 'Password'}</span>${m !== 'in' ? '<span class="opt">8+ characters</span>' : ''}</label><input type="password" id="apw" autocomplete="${m === 'in' ? 'current-password' : 'new-password'}" required><button type="button" class="linkbtn" id="togglePw" style="align-self:flex-start">Show password</button></div>` : ''}
      <div id="authMsg" role="alert" class="msg ${kind === 'ok' ? 'ok' : 'err'}" ${msg ? '' : 'hidden'}>${esc(msg || '')}</div>
      <button class="btn violet wide" id="authSubmit" type="submit">${submit}</button>
      <div class="auth-links">
        ${m === 'in' ? '<button type="button" class="linkbtn" data-mode="forgot">Forgot password?</button>' : ''}
        ${m === 'forgot' ? '<button type="button" class="linkbtn" data-mode="in">Back to log in</button>' : ''}
      </div>
    </form></div>`;
  const em = $('#aemail'); if (em) em.addEventListener('input', e => { authEmail = e.target.value });
}
function authMsg(text, kind = 'err') { const b = $('#authMsg'); if (!b) return; b.textContent = text; b.className = 'msg ' + (kind === 'ok' ? 'ok' : 'err'); b.hidden = !text }
function authError(e) {
  const m = (e && e.message) || '';
  if (!navigator.onLine) return "You're offline. Try again when you're connected.";
  if (/invalid login credentials/i.test(m)) return 'Email or password is incorrect.';
  if (/email not confirmed/i.test(m)) return 'Confirm your email first. Check your inbox for the link.';
  if (/already registered|already exists/i.test(m)) return 'That email already has an account. Try logging in.';
  if (/rate limit|too many|security purposes/i.test(m)) return 'Too many tries. Wait a minute and try again.';
  if (/password/i.test(m) && /(short|least|weak|characters)/i.test(m)) return 'Use at least 8 characters for your password.';
  if (/valid email|invalid.*email/i.test(m)) return 'Enter a valid email address.';
  return friendly(e);
}
async function submitAuth(ev) {
  ev.preventDefault(); if (authBusy || !sb) return;
  const email = ($('#aemail')?.value || '').trim(), pw = $('#apw')?.value || '', m = authMode;
  if (m !== 'reset' && !email) return authMsg('Enter your email.');
  if (m !== 'forgot' && !pw) return authMsg(m === 'in' ? 'Enter your password.' : 'Choose a password.');
  if ((m === 'up' || m === 'reset') && pw.length < 8) return authMsg('Use at least 8 characters for your password.');
  authBusy = true; const btn = $('#authSubmit'); btn.disabled = true; authMsg('');
  const back = location.origin + location.pathname;
  try {
    if (m === 'in') {
      const { error } = await sb.auth.signInWithPassword({ email, password: pw }); if (error) throw error;
    } else if (m === 'up') {
      const { data, error } = await sb.auth.signUp({ email, password: pw, options: { emailRedirectTo: back } }); if (error) throw error;
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) authMsg('That email already has an account. Try logging in.');
      else if (!data.session) authMsg('Check your email to confirm your account, then log in.', 'ok');
    } else if (m === 'forgot') {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: back }); if (error) throw error;
      authMsg('If that email has an account, a reset link is on its way.', 'ok');
    } else if (m === 'reset') {
      const { error } = await sb.auth.updateUser({ password: pw }); if (error) throw error;
      toast('Password updated');
      const { data } = await sb.auth.getSession(); const u = data.session?.user;
      authMode = 'in';
      if (!u) showAuth('in'); else if (u.id === currentUid) { user = u; showShell(); render() } else enterApp(u);
    }
  } catch (e) { authMsg(authError(e)) }
  finally { authBusy = false; const b = $('#authSubmit'); if (b) b.disabled = false }
}

/* ---------- session ---------- */
function enterApp(u) {
  user = u; currentUid = u.id; authMode = 'in';
  try { lastCat = localStorage.getItem('ra-lastcat-' + currentUid) } catch (_) { lastCat = null }
  const c = readCache();
  if (c) { items = c.items; cats = c.cats?.length ? c.cats : [...DEFAULT_CATS]; loadState = 'ready' } else { items = []; cats = []; loadState = 'loading' }
  filter = 'All'; q = ''; $('#q').value = '';
  showShell(); render(); loadData();
}
function leaveApp() {
  if (currentUid) clearCache(currentUid);
  user = null; currentUid = null; items = []; cats = []; filter = 'All'; q = ''; loadState = 'loading';
  if (!$('#sheet').hidden) closeSheet();
  $('#list').innerHTML = ''; $('#q').value = '';
}
async function logout() {
  try { await sb.auth.signOut() } catch (_) { }
  if (currentUid) { leaveApp(); showAuth('in') }
}

/* ---------- events ---------- */
function clearSearch() { q = ''; $('#q').value = ''; render() }
document.addEventListener('click', async e => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.closest('#auth')) {
    if (t.dataset.mode) { authMode = t.dataset.mode; return renderAuth() }
    if (t.id === 'togglePw') { const p = $('#apw'); const show = p.type === 'password'; p.type = show ? 'text' : 'password'; t.textContent = show ? 'Hide password' : 'Show password'; return }
    return;
  }
  if (t.id === 'add') return openForm();
  if (t.id === 'acct') return openAccount();
  if (t.id === 'retry') return loadData();
  if (t.id === 'qclear') { clearSearch(); return $('#q').focus() }
  if (t.id === 'nomatchBtn') { if (needle()) clearSearch(); else { filter = 'All'; render() } return }
  if (t.dataset.filter) { filter = t.dataset.filter; return render() }
  if (t.dataset.open) return openDetail(t.dataset.open);
  if (t.dataset.cat && draft) { draft.cat = t.dataset.cat; paintCats(); return validate() }
  if (t.dataset.score && draft) { draft.score = +t.dataset.score; paintRate(); return validate() }
  switch (t.dataset.act) {
    case 'close': case 'cancel': return closeSheet();
    case 'save': return save();
    case 'camera': return $('#fCam').click();
    case 'library': return $('#fLib').click();
    case 'newcat': { $('#newCatRow').hidden = false; return $('#newCat').focus() }
    case 'addcat': return addCat();
    case 'edit': { const it = items.find(i => i.id === openId); return it && openForm(it) }
    case 'askdel': $('#dActions').innerHTML = '<span class="meta" style="flex-basis:100%">Delete this rating for good?</span><button class="btn" data-act="candel" type="button">Keep it</button><button class="btn danger" data-act="del" type="button">Delete</button>'; return;
    case 'candel': $('#dActions').innerHTML = '<button class="btn violet" data-act="edit" type="button">Edit</button><button class="btn danger" data-act="askdel" type="button">Delete</button>'; return;
    case 'del': return remove();
    case 'logout': return logout();
    case 'pwreset': {
      t.disabled = true;
      try { const { error } = await sb.auth.resetPasswordForEmail(user.email, { redirectTo: location.origin + location.pathname }); if (error) throw error; toast('Reset link sent. Check your email.') }
      catch (err) { toast(authError(err)) } finally { t.disabled = false }
      return;
    }
  }
});
document.addEventListener('submit', e => { if (e.target.id === 'authForm') submitAuth(e) });
$('#q').addEventListener('input', e => { q = e.target.value; render() });
$('#q').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur() });
$('#sort').addEventListener('change', e => { sort = e.target.value; try { localStorage.setItem('ra-sort', sort) } catch (_) { } render() });
$('#list').addEventListener('error', e => { if (e.target.tagName === 'IMG') { const it = items.find(i => i.photoUrl === e.target.getAttribute('src')); if (it) it.photoUrl = null; e.target.outerHTML = pixel(STAR) } }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet() });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && currentUid && $('#sheet').hidden && Date.now() - lastLoad > 60000) loadData() });

/* ---------- boot ---------- */
(function boot() {
  $('#sky0').innerHTML = skyInner();
  $('#clouds0').innerHTML = CLOUDS;
  document.querySelectorAll('[data-px]').forEach(el => el.innerHTML = pixel(el.dataset.px === 'spark' ? SPARK : STAR));
  document.querySelectorAll('[data-ic]').forEach(el => el.innerHTML = ic(el.dataset.ic));
  try { sort = localStorage.getItem('ra-sort') || 'new'; $('#sort').value = sort } catch (_) { }
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
  if (!sb) { showAuth('in'); authMsg('The app is missing its connection settings (config.js).'); return }
  sb.auth.onAuthStateChange((event, session) => {
    setTimeout(() => { // never await Supabase calls inside this callback
      if (event === 'PASSWORD_RECOVERY') { showAuth('reset'); return }
      if (event === 'SIGNED_OUT') { if (currentUid) { leaveApp() } showAuth('in'); return }
      if (session?.user) { if (authMode === 'reset' && !$('#auth').hidden) return; if (session.user.id !== currentUid) enterApp(session.user); else user = session.user }
      else if (event === 'INITIAL_SESSION') showAuth('in');
    }, 0);
  });
})();
})();
