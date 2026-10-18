# Rate My Coconut Water — project guide

Read this first before changing anything. It explains what the app is, how it is put together, where it is hosted, and how to make changes safely.

Live site: https://ratemycoconutwater.com

---

## 1. What the app does

A phone-first web app for photographing, naming, categorizing, rating (1–10) and reviewing coconut water and anything else.

- Each person creates an account with **email + password** and sees **only their own ratings**. There is no sharing, no public profiles, no social features — by design.
- A rating has: photo (optional), product name, category, score 1–10, notes (optional), date.
- Home screen: search by name, filter by category chips, sort (newest, highest, lowest, A–Z).
- Tap a rating to see it full size, edit it, or delete it (with a confirm step).
- Account screen (person icon, top right): shows the signed-in email, sends a password-reset email, logs out.
- Installable to the iPhone home screen (Share → Add to Home Screen). The app itself opens offline; ratings need a connection.

### Design decisions (keep unless deliberately changing)

- **Look:** night-sky pixel style — navy checkerboard background, glowing double-edged blue frames, yellow pixel stars, pixel clouds at the bottom, rounded *Nunito* font. Selected chips/buttons are yellow; Save is pink; the add button is violet.
- **Score colors:** 8–10 teal, 5–7 yellow, 1–4 pink.
- **Score words:** 1 Avoid, 2 Poor, 3 Weak, 4 Meh, 5 Okay, 6 Decent, 7 Good, 8 Great, 9 Excellent, 10 Perfect.
- **Default categories** for new accounts: Coconut Water (first, and the default pick), Food, Drinks, Gear, Home, Other. People can add their own with “+ New”.
- Photos are shrunk on the phone before upload (longest side 1100 px, JPEG) to save storage and data.

---

## 2. How it is built

Three free services, no server of our own:

| Piece | Service | What it does |
|---|---|---|
| App files | **GitHub Pages** (this repo) | Hosts the website files |
| Domain | **Porkbun** | `ratemycoconutwater.com` points at GitHub Pages |
| Logins, data, photos | **Supabase** | Accounts, database, photo storage, privacy rules |

### Files in this repo

| File | What it is | Edit it to… |
|---|---|---|
| `index.html` | Page structure (header, search, list, buttons) | Change layout or static text |
| `styles.css` | All styling. Colors and fonts are tokens at the top (`:root`) | Change the look |
| `app.js` | All app behavior: login, list, form, saving, search | Change features or wording |
| `config.js` | Supabase project URL + publishable key | Only if the Supabase project changes |
| `supabase.js` | Supabase’s official library (v2.118.0), copied in so the app works offline | Don’t edit; replace only to upgrade |
| `sw.js` | Service worker: caches the app for offline use | **Bump `CACHE` on every update** (see §5) |
| `manifest.webmanifest` | App name, colors, icons for home-screen install | Change app name/icon |
| `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` | App icons (pixel star) | Replace to change the icon |
| `CNAME` | Created by GitHub; holds the custom domain | **Never delete** |
| `supabase/setup.sql` | The database setup that was run once in Supabase | Reference; re-run only if rebuilding |
| `PROJECT.md` | This guide | Update with every change |

Useful places in `app.js`: `DEFAULT_CATS` (default categories), `LABELS` (score words), `shrink()` (photo size), `renderAuth()` (login screen), `openForm()` (add/edit form), `render()` (home list).

---

## 3. Supabase (backend)

- Project URL: `https://vhipoagjztecsobfrjsz.supabase.co`
- The **publishable** key in `config.js` is meant to be public. Privacy is enforced by the database rules, not by hiding the key.
- **Never** put the `secret` / `service_role` key or the database password in this repo.

### Data

- `ratings` table — one row per rating: `id`, `user_id`, `name`, `category`, `score` (1–10), `notes`, `photo_path`, `created_at`, `updated_at`.
- `categories` table — each person’s category list: `user_id`, `name`, `sort`. Defaults are added the first time a person logs in, so changing `DEFAULT_CATS` only affects new accounts.
- `photos` storage bucket — **private**, JPEG only, 5 MB max. Each photo is stored at `<user_id>/<rating_id>.jpg`. The app shows photos through temporary links that last 24 hours and are renewed on each load.
- Row Level Security on everything: a logged-in person can only read or change rows and photos that belong to them. Logged-out visitors can’t read anything.

### Dashboard settings in use

- Data API: **on**. Automatically expose new tables: **off** (access is granted in `setup.sql`). Automatic RLS: **on**.
- Authentication → Providers → Email: **on**. “Confirm email” was turned **off** for testing — check its current state.
- Authentication → URL Configuration: Site URL `https://ratemycoconutwater.com`, Redirect URL `https://ratemycoconutwater.com/**`.

### Free-plan limits to remember

- The project **pauses after about a week with no activity**. While paused nobody can log in; restore it from the Supabase dashboard. Paid plans don’t pause.
- 500 MB database, 1 GB file storage (roughly 10,000 photos at current sizes), 50,000 monthly active users. Check Supabase’s pricing page for current numbers.

---

## 4. Hosting and domain

- **GitHub Pages:** repo Settings → Pages → deploy from branch `main`, folder `/ (root)`. Custom domain `ratemycoconutwater.com`, **Enforce HTTPS** ticked once available.
- **Porkbun DNS** for `ratemycoconutwater.com`:
  - A records (blank host) → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
  - CNAME `www` → `<github-username>.github.io`
  - TXT record from GitHub’s domain verification (profile → Settings → Pages)
  - Porkbun’s default parking records (ALIAS to `pixie.porkbun.com` and the `*` CNAME) were deleted — don’t add them back.

---

## 5. How to make a change

1. **Edit the file on GitHub:** open it in the repo → pencil icon (Edit) → make the change → **Commit changes**. Or upload a replacement file with **Add file → Upload files** (same file name overwrites it).
2. **Bump the cache version** in `sw.js` on every change to any app file, e.g. `rmcw-v1` → `rmcw-v2`. Without this, phones keep showing the old version.
3. **Wait about a minute** for GitHub Pages to publish, then open the site. Phones may need the app closed and reopened (sometimes twice) to pick up the new version.
4. **Database changes** (new columns, tables, rules) go in Supabase → SQL Editor. Add the same SQL to `supabase/setup.sql` (or a new numbered file like `supabase/002-add-brand.sql`) so this repo stays the full record.
5. **Update this guide** — the relevant section and the change log below.

### Quick test after any change

Log in → add a rating with a photo → search for it → edit it → delete it → log out and back in.

---

## 6. Known limits and ideas for later

- No “delete my account” button (needs a secure server function in Supabase).
- No export/backup of ratings from inside the app.
- Ratings need a connection to add, edit or load; only the app shell works offline.
- Ideas: export to CSV, stats page (averages by category), brand/price/flavor fields, sorting by category, multiple photos per rating.

---

## 7. Starting a new chat to change the app

Share this repo’s link (or a zip of it) and say something like:

> “Read PROJECT.md first. I want to change ___. Give me the updated files and tell me exactly where to put them, and update PROJECT.md and the cache version in sw.js.”

---

## 8. Change log

| Date | Change |
|---|---|
| 2026-10 | First release: accounts (Supabase), ratings with photos, categories, search, night-sky pixel design, PWA install, custom domain. |
