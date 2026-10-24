# FunnyMela - complete package

FunnyMela ek 3D mela game hai (Mummy-Papa se bacho, jhoole, thele, patake, donation pole, store).

```
funnymela/
  frontend/index.html      <- poora game (single file, koi build step nahi)
  admin/index.html         <- admin panel (ID + password login)
  backend/server.js        <- Razorpay + Supabase backend (Node 18+)
  backend/schema.sql       <- database tables
  backend/.env.example     <- secrets ki list
  backend/package.json
  ANTIGRAVITY_PROMPT.md    <- Antigravity ko dene wala prompt
```

## 1. Game preview (backend ke bina)
`frontend/index.html` kholo (kisi static host par ya `npx serve frontend`). Backend nahi hai to **demo mode** chalta hai:
store/donation "free test unlock" dikhata hai aur data sirf us device par rehta hai.

## 2. Backend chalana
1. Supabase project banao, `backend/schema.sql` SQL editor me chalao.
2. `cd backend && cp .env.example .env` aur saari values bharo, phir `npm install && npm start`.
3. Razorpay Dashboard: API keys (pehle TEST), aur Webhook: URL `https://YOUR-API/webhook`, event `payment.captured`, secret = `RZP_WEBHOOK_SECRET`.
4. Host: Render / Railway / Fly.io / VPS (HTTPS zaroori).

## 3. Game ko backend se jodna
`frontend/index.html` ke bilkul upar:
```html
<script>window.MELA_API="https://YOUR-API";window.MELA_ENDPOINT="https://YOUR-API/event";</script>
```
Bas itna. Ab store/donation Razorpay se chalte hain, donation pole sabko dikhta hai, admin ko events milte hain.

## 4. Admin panel
`admin/index.html` me `API=` line me apna backend URL daalo, kisi bhi host par rakho. ID/password `.env` wale (`ADMIN_ID`, `ADMIN_PASS_HASH`). Baad me ise game se alag kahin bhi shift kar sakte ho; sirf yahi ek file badalni hai.

## 5. API
| Method | Path | Kaam |
|---|---|---|
| POST | `/order` `{uid,item}` | store item ka Razorpay order (price server se) |
| POST | `/donate/order` `{uid,name,amount}` | donation order (Rs 10 - 10000) |
| POST | `/verify` `{razorpay_*}` | signature check, item/donation grant |
| POST | `/webhook` | Razorpay `payment.captured` (browser band ho to bhi grant) |
| GET | `/entitlements?uid=` | kharide hue items |
| POST | `/use` `{uid,item}` | shield/slow use (server count ghatata hai) |
| GET | `/donations` | `{top (top 10 by amount), recent (latest 20), total}` |
| POST | `/event` | game analytics (rate limited) |
| POST | `/admin/login` | ID+password -> 12h token |
| GET | `/admin/events` | admin data (Bearer token) |
| GET | `/health` | status |

## 6. Kya secure hai aur kya nahi (sach)
- **Secure:** keemat server par, Razorpay signature verify, webhook se double-grant nahi (idempotent), donation naam server par saaf hota hai, tables par RLS, admin token.
- **Poori tarah secure nahi ho sakta:** game browser me chalta hai, to koi apne browser me game code badal kar apne liye coins/skin visual dikha sakta hai. Isse aapki kamai par asar nahi padta (paise ka item server se hi milta hai), par in-game coins client par hi hain. Agar coins bhi asli kamai se jude hon to coins ka hisaab bhi server par le jaana hoga.
- Login nahi hai: purchases guest ID (`localStorage`) se jude hain. Browser data saaf hua to purchases dikhne band honge. Asli user account chahiye to Supabase Auth jodna.

## 7. Go-live checklist
- `frontend/index.html` me `SITE={name,owner,email,phone,addr}` apni details se badlo (About/Privacy/Terms/Refund/Contact pages yahin se banate hain). Policy pages template hain, kisi vakeel se check karwao.
- Razorpay LIVE keys, KYC aur website ka domain approval.
- Ads: AdSense/AdMob ID admin settings me; app ke liye AdMob alag.
- Real device par test: Android Chrome, iPhone Safari, PC.
