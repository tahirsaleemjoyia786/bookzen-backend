# BookZen — Real Database (Supabase) Guide

Ye guide Phase 1 ke liye hai: backend ki memory wali data ki jagah
asli database (Supabase / PostgreSQL) lagana. Is se PC band hone par
bhi businesses, bookings aur chats save rahenge.

**Abhi kya haal hai:** backend abhi bhi in-memory store par chal raha
hai. Jab tak neeche wale steps nahi karte, data restart par khatam
hota rahega — app phir bhi waisi hi chalegi jaisi ab chal rahi hai.

**Zaroori baat:** Supabase account aur connection string (password
jaisa secret) tumhara apna hai. **Connection string kabhi chat mein
mat bhejo, kisi ko mat do.** Muse ko bhi nahi — sirf apne laptop ki
CMD window mein likhna hai.

## Steps

### 1. Supabase par free project banao
1. Browser mein jao: **supabase.com** → **Start your project** (ya **Sign Up**).
2. Email se account banao aur login karo.
3. **New project** dabao.
4. Project ka naam likho, jaise `bookzen`.
5. Database password banao aur **kahi safe jagah likh lo** (ye password baad mein connection string mein chahiye hoga).
6. Region chuno: jo Pakistan / Asia ke qareeb ho (jaise **Singapore** ya **Mumbai**).
7. **Create new project** dabao, 1–2 minute wait karo, project khul jayega.

### 2. SQL Editor mein schema chalao
1. Left menu mein **SQL Editor** kholo.
2. **New query** dabao.
3. Apne laptop par ye file kholo: `bookzen-mvp/backend/db/schema.sql` (assistant wali copy mein ye file maujood hai; laptop par ye file tab aayegi jab Phase 1 wali backend files laptop par copy karoge).
4. Poori file ka text copy kar ke SQL Editor mein paste karo.
5. **Run** dabao. Neeche **Success** aana chahiye, koi error nahi.
6. Left menu mein **Table Editor** kholo — wahan `businesses`, `users`, `services`, `staff`, `appointments`, `chats`, `messages` tables dikhni chahiye. `businesses` mein **Demo Barbershop** ki ek row hogi.

### 3. Connection string (URI) copy karo
1. Left menu mein **Project Settings** (neeche gear icon) → **Database**.
2. **Connection string** wala hissa dhoondo, tab **URI** chuno.
3. **Copy** dabao. Is mein tumhara database password hota hai — agar password ki jagah `[YOUR-PASSWORD]` likha ho to us ki jagah Step 1 wala password likh do.
4. Ye string **sirf apne laptop par** use karni hai, chat mein nahi.

### 4. Laptop par backend mein `pg` install karo
Backend wale folder mein CMD kholo (`bookzen-mvp/backend`), phir:
```
npm install
```
(Pehli dafa `pg` install hoga. Agar ye pehle se install ho to ye step skip kar sakte ho.)

### 5. DATABASE_URL set karo aur server chalao
**Nayi CMD window** kholo (backend wali window nahi, ek nayi):
```
set DATABASE_URL=postgres://postgres:APNA_PASSWORD@db.xxxxx.supabase.co:5432/postgres
```
Ye sirf us ek CMD window ke liye hota hai, window band hote hi khatam.
Phir usi window mein:
```
node server.js
```
Agar sab theek hai to ye line aayegi:
```
BookZen MVP backend (DEMO) listening on http://localhost:3000
Store: Postgres (DATABASE_URL set)
```
Ab backend Supabase se data parh raha hai. App mein demo login karo — Dashboard, Services, Inbox waisi hi dikhni chahiye, lekin ab signup ki hui business PC restart ke baad bhi rahegi.

### 6. Check karo ke data save ho raha hai
1. App se ek nayi business signup karo (jaise Test Barbershop).
2. Supabase **Table Editor** → `businesses` table kholo — nayi row PENDING status ke sath dikhni chahiye.
3. Laptop restart kar ke backend dobara chalao — business ab bhi honi chahiye.

## Agar kuch ghalat ho
- **"DATABASE_URL is not set"**: Step 5 mein `set DATABASE_URL=...` wali line usi window mein likhni hai jis mein `node server.js` chalana hai.
- **Password ghalat / connection error**: connection string mein password theek likha hai ya nahi, aur Supabase project **Active** hai ya nahi, check karo.
- **"relation does not exist"**: Step 2 dobara karo — schema SQL Editor mein run nahi hua.
- Kisi bhi error ki screenshot bhej do, exact error ke sath.

## Wapas in-memory par jana ho to
DATABASE_URL wali window band kar do aur bina DATABASE_URL ke `node server.js` chalao — backend phir in-memory store par chalega (data restart par khatam).
