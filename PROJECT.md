# Rate My Coconut Water — project guide

Read this first before changing anything. It explains what the app is, how it is put together, where it is hosted, and how to make changes safely.

Live site: https://ratemycoconutwater.com

---

## 1. What the app does

A phone-first web app for photographing, naming, categorizing, rating (1–10) and reviewing coconut water and anything else.

- Each person creates an account with **email + password**. Your ratings are private to you **and the friends you've accepted** — nobody else. There are no public profiles, no search of other users, no likes or comments — by design.
- **Friends tab:** pick a unique username (3–20 characters: a–z, 0–9, _), send a request by typing a friend's exact username, accept or decline requests you receive, cancel requests you sent, and remove friends. A pink badge on the tab shows new requests. Tap a friend to see their ratings — read-only, with the same search, category chips and sort. If someone sends you a request while you've already sent them one, you become friends straight away.
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
| `supabase/002-friends.sql` | Friends: usernames, friend requests, friends-can-read rules | Reference; run after `setup.sql` if rebuilding |
| `PROJECT.md` | This guide | Update with every change |

Useful places in `app.js`: `DEFAULT_CATS` (default categories), `LABELS` (score words), `shrink()` (photo size), `renderAuth()` (login screen), `openForm()` (add/edit form), `render()` (tabs + badge, then picks the screen), `renderList()` (your list or a friend's), `renderFriends()` (Friends screen), `loadSocial()` (username + friend list), `loadFriend()` (a friend's ratings), `sendRequest()` (the messages shown after Send).

**Important:** your own list is loaded with `.eq('user_id', uid)`. Because friends' ratings are now readable, any new query for "my" ratings must filter by user the same way, or friends' ratings will mix into yours.

---

## 3. Supabase (backend)

- Project URL: `https://vhipoagjztecsobfrjsz.supabase.co`
- The **publishable** key in `config.js` is meant to be public. Privacy is enforced by the database rules, not by hiding the key.
- **Never** put the `secret` / `service_role` key or the database password in this repo.

### Data

- `ratings` table — one row per rating: `id`, `user_id`, `name`, `category`, `score` (1–10), `notes`, `photo_path`, `created_at`, `updated_at`.
- `categories` table — each person’s category list: `user_id`, `name`, `sort`. Defaults are added the first time a person logs in, so changing `DEFAULT_CATS` only affects new accounts.
- `photos` storage bucket — **private**, JPEG only, 5 MB max. Each photo is stored at `<user_id>/<rating_id>.jpg`. The app shows photos through temporary links that last 24 hours and are renewed on each load.
- `profiles` table — `id` (the user), `username` (unique, lowercase). Each person can read and change only their own. Nobody can browse or search other profiles.
- `friendships` table — one row per pair: `requester`, `addressee`, `status` (`pending` or `accepted`). People can read rows they're part of, but **can't change them directly** — all changes go through these database functions, which check who's calling:
  - `send_friend_request(username)` → returns `sent`, `accepted`, `already_friends`, `already_sent`, `not_found`, `self`, `no_username` or `too_many` (50 pending sent requests max)
  - `respond_friend_request(id, accept)` — only the person who received it; declining deletes the row
  - `remove_friendship(id)` — either person; used for Cancel and Remove
  - `my_friendships()` — your list with the other person's username; `friend_ids()` — used by the read rules
- Row Level Security on everything. You can **change** only your own rows and photos. You can **read** your own plus those of accepted friends (`ratings: friends read`, `photos: friends read`). Logged-out visitors can’t read anything. Removing a friend cuts off their access straight away; friends' photo links last only 1 hour (yours last 24).

### Dashboard settings in use

- Data API: **on**. Automatically expose new tables: **off** (access is granted in `setup.sql`). Automatic RLS: **on**.
- Authentication → Sign In / Providers → Email: **on**, with **“Confirm email” on**. Keep it on now that friends exist — otherwise someone could sign up with another person's email address.
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

- No “delete my account” button (needs a secure server function in Supabase). Deleting a user in the Supabase dashboard also removes their profile and friendships.
- No email or push notification for friend requests — they show in the app with a badge.
- Can't hide individual ratings from friends; friends see everything, notes and photos included.
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
| 2026-10 | Friends: usernames, Friends tab with requests (send / accept / decline / cancel / remove) and badge, read-only view of a friend's ratings. New `supabase/002-friends.sql`; `setup.sql` moved into `supabase/`; own ratings now filtered by user; “Confirm email” back on. Cache `rmcw-v2`. |
