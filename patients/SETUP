# Patient Registration & EMR — Setup

This module is plain HTML/CSS/JS (no build step), so it works directly on
GitHub Pages. The database lives on Supabase (free tier) since GitHub Pages
can't run a backend itself.

## 1. Create the database (5 min)
1. Go to supabase.com → sign up (free) → **New project**.
2. Once it's ready, open **SQL Editor** → **New query**.
3. Paste the contents of `schema.sql` and click **Run**.
4. Go to **Project Settings → API**. Copy the **Project URL** and the
   **anon public** key.

## 2. Connect this app to it
Open `config.js` and replace the two placeholder values:
```js
const SUPABASE_URL = "https://xxxxxxxxxxxx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOि...";
```

## 3. Add these files to your repo
In the `MEDICAL-CHAMPION-` repo, create a folder called `patients/` and add:
`index.html`, `style.css`, `app.js`, `config.js` (with your real keys),
`schema.sql`, this file.

## 4. Enable GitHub Pages (if not already on)
Settings → Pages → Source: `main` branch, `/root` folder → Save.

Your module will be live at:
`https://oasismedical1.github.io/MEDICAL-CHAMPION-/patients/`

## What this gives you
- Register a patient with a unique auto-generated Patient ID (UPI)
- Search/browse the patient list
- Click a patient to view their record in a detail panel
- Data is stored centrally in Supabase — the same database every other
  module (Clinical, Pharmacy, Labs) will read from as they're built

## What's intentionally left out (next steps)
- **Login/user roles** — right now anyone with the link can register
  patients. Before real use, add Supabase Auth so only your staff can
  access it. Say the word and we can add this next.
- **Editing/deleting patients**, vitals history, and the clinical
  timeline — these belong to the next modules (Clinical, Vitals) per
  the blueprint, built on top of this same `patients` table.
- A note on the `anon insert/select` policy in `schema.sql`: it's
  intentionally open so you can test immediately. Tighten it once
  login is in place — see Supabase's Row Level Security docs.
