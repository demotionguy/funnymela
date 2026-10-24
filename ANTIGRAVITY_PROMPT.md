# Prompt for Antigravity

You are given the project `funnymela/`:
- `frontend/index.html` : finished single-file 3D game (three.js r128 from cdnjs). Do NOT rewrite the game.
- `backend/server.js`, `backend/schema.sql`, `backend/.env.example`, `backend/package.json` : starting Node/Express backend (Razorpay + Supabase).
- `admin/index.html` : admin dashboard (ID + password login).

## Tasks
1. Read `README.md`, then run the backend locally. Fix any bug you find in `backend/server.js`. Keep every endpoint and its JSON shape exactly as the README table says, because the frontend already calls them.
2. Write automated tests (supertest or similar) for: `/order` (bad item/uid rejected, price comes only from CATALOG), `/donate/order` (amount 10..10000, name sanitised), `/verify` (valid vs invalid signature, double verify must not double-grant), `/webhook` (valid vs invalid signature, idempotent), `/use`, `/donations` (top 10 by total amount, `recent` newest first), `/event` (rate limit), admin login/token.
3. Add Dockerfile + `render.yaml` (or Railway config) so it deploys with one click. Health check: `GET /health`.
4. Add a small seed/check script that prints whether all env vars are present.
5. Deploy backend, then set `window.MELA_API` and `window.MELA_ENDPOINT` at the top of `frontend/index.html`, and `API` in `admin/index.html`.
6. Run an end-to-end test with Razorpay TEST mode: buy an item, make a donation, confirm it shows on the donation pole data (`GET /donations`) and in admin.
7. Optional upgrades (ask before doing): Supabase Auth for real user accounts, server-side coin balance, leaderboards for other things.

## Rules
- Never put `SUPABASE_SERVICE_KEY` or `RZP_KEY_SECRET` in frontend files.
- Do not change prices on the client; prices live only in `CATALOG` on the server (keep the client `CAT` list in sync by id).
- Keep the donation name filter and the Rs 10 - 10000 limits.
- Report what you changed and what is still manual (Razorpay KYC, domain, policy text).
