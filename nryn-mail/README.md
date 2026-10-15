# NRYN Mail — standalone AI Email Agent (mobile)

A separate application from the NRYN WhatsApp agent. Own folder, own backend
process, own database, own `.env`. It copies patterns from the WhatsApp codebase
(AI provider fallback, service/controller/route layering, Socket.IO) but
**imports nothing from it**.

```
nryn-mail/
├── backend/     Express + Mongoose API on :4100   (JavaScript)
└── mobile/      Expo / React Native app           (TypeScript)
```

The app runs on a real Android phone or iPhone through **Expo Go** — no Android
Studio, no Xcode, no Mac required to start.

---

## 1. What you still need to do

You've already done these three:

- ✅ Google Cloud project
- ✅ Gmail API enabled
- ✅ OAuth consent screen (External, Testing mode, yourself as a Test user)

Two things left:

### a) Create the OAuth Client ID

Google Cloud Console → **APIs & Services → Credentials → Create credentials →
OAuth client ID**

- Application type: **Web application** — yes, *Web*, even though this is a
  phone app. The backend performs the code exchange, not the phone, so Google
  only ever sees the backend's redirect URI. (An "Android"/"iOS" client type
  would be for an app that talks to Google directly, which this one doesn't.)
- **Authorized redirect URIs** — add exactly this, character for character:

```
http://localhost:4100/api/auth/google/callback
```

Copy the Client ID and Client secret into `backend/.env`:

```bash
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
```

### b) Add your OpenRouter key (can wait)

```bash
OPENROUTER_API_KEY=sk-or-v1-...
```

Without it the app still connects Gmail, syncs your inbox, and renders every
screen — triage / summarize / draft answer `503 no_llm_provider` naming the
missing key. Add it and restart; nothing else changes.

Everything else in `backend/.env` is filled in already, including a unique
`JWT_SECRET` and `TOKEN_ENCRYPTION_KEY` generated for this project, and
`MONGO_URI=mongodb://127.0.0.1:27017/nryn_email`.

---

## 2. The one setting people get wrong

**`localhost` on a phone means the phone.** Your laptop is a different machine.

Find your computer's LAN IP:

| OS | Command |
|---|---|
| macOS | `ipconfig getifaddr en0` |
| Linux | `hostname -I` |
| Windows | `ipconfig` → IPv4 Address |

Put it in `mobile/.env`:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.5:4100     # ← your IP
```

| Running on | Use |
|---|---|
| Real phone via Expo Go | `http://<your-LAN-IP>:4100` — phone and computer on the same Wi-Fi |
| Android emulator | `http://10.0.2.2:4100` |
| iOS simulator | `http://localhost:4100` |

After changing it: `npx expo start -c` (the `-c` clears the cache; env values are
baked into the bundle).

The Account screen inside the app shows which URL it's actually using — check
there first when a request fails.

---

## 3. Run it

Two terminals.

```bash
# terminal 1 — API
cd backend
npm install
npm run db:indexes     # proves mongod is reachable and creates the indexes
npm run dev            # http://localhost:4100

# terminal 2 — app
cd mobile
npm install
npx expo start
```

Install **Expo Go** from the Play Store or App Store, then scan the QR code in
terminal 2. Android scans from inside the Expo Go app; iOS scans with the normal
Camera app.

Press **Connect Gmail**. A browser sheet opens on Google's consent screen, then
closes itself and drops you back in the app, signed in.

### Useful commands

| Command | Where | What |
|---|---|---|
| `npm run check` | backend | Loads every module — catches a typo without needing Mongo, Google or an LLM key |
| `npm run db:indexes` | backend | Connects to Mongo and prints every index it created |
| `npm run db:stats` | backend | Counts, priority breakdown, latest insights — the fastest way to check each step with no UI |
| `npm run typecheck` | mobile | `tsc --noEmit` |
| `npx expo start -c` | mobile | Restart with a cleared cache — needed after editing `.env` |

---

## 4. How mobile sign-in works

This is the part that differs most from a web app, and it's worth understanding
once because every "it didn't come back to the app" problem lives here.

```
  app                       backend                      Google
   │                           │                            │
   │ 1. Linking.createURL('auth')                           │
   │    Expo Go  → exp://192.168.1.5:8081/--/auth           │
   │    build    → nrynmail://auth                          │
   │                           │                            │
   │ 2. GET /auth/google/url?redirect=<that URI>            │
   │──────────────────────────►│                            │
   │                           │ checks it against an       │
   │                           │ allowlist, then signs it   │
   │                           │ into the OAuth `state`     │
   │ ◄─────────────────────────│ consent URL                │
   │                           │                            │
   │ 3. openAuthSessionAsync ──┼───────────────────────────►│
   │                           │ ◄── code ──────────────────│
   │                           │ exchanges for tokens,      │
   │                           │ encrypts + stores them     │
   │ ◄─── redirect to <URI>?code=ONE-TIME ──────────────────│
   │                           │                            │
   │ 4. POST /auth/exchange {code}                          │
   │──────────────────────────►│                            │
   │ ◄── { token } ────────────│  stored in the device keychain
```

Three things to know:

- **The redirect URI changes between Expo Go and a real build.** In Expo Go it
  contains your LAN IP and port 8081. That's why the backend allowlists `exp://`
  as well as `nrynmail://` rather than hardcoding one value.
- **The deep link carries a one-time code, not the session token.** The code
  dies after one use or two minutes. A JWT sitting in a URL could be retained by
  the OS, the browser, or the clipboard; a spent code is worthless.
- **`APP_SCHEME` in `backend/.env` must match `scheme` in `mobile/app.json`.**
  Both are `nrynmail`. If you change one, change the other, or a standalone
  build will never reopen after consent.

---

## 5. Verify in this order

Steps 1–5 are backend-only, and that's where the risk is. Don't debug the app
and the pipeline at the same time.

| # | Check | Passes when |
|---|---|---|
| 1 | `npm run db:indexes` | Prints indexes for all 7 `mail_*` collections |
| 2 | `curl localhost:4100/api/health` | `mongo: "connected"`, `googleConfigured: true` |
| 3 | Open the app, tap Connect Gmail | Consent screen appears, browser closes itself, inbox loads |
| 4 | `npm run db:stats` | `emails` > 0 — your last 30 days synced |
| 5 | `npm run db:stats` a minute later | `insights` matches `emails`; eyeball 20 priorities and agree with them |
| 6 | Mail yourself something | Appears within 3 minutes with an insight, and a toast pops with no refresh |
| 7 | Open an email → Summarize | Key points, Important note, action items; flip a switch, leave and come back — it persisted |
| 8 | Draft Reply | Tone pills regenerate, Edit saves, version stepper is correct |
| 9 | Send Reply | **Check in real Gmail that it's in the same thread** — not just a success screen |

Step 9 is the one that silently goes wrong. A reply needs `In-Reply-To` and
`References` headers *and* `threadId` in the send request. Both are implemented
and unit-tested, but verify with your own eyes once.

---

## 6. Architecture

```
Gmail  ──OAuth──►  backend/src/auth/google.oauth.js
                        │  tokens AES-256-GCM encrypted at rest
                        ▼
                   gmail.sync.service.js          ◄── jobs/sync.job.js  (cron */3)
                        │  bootstrap: 30d / 300 cap
                        │  incremental: history.list from stored historyId
                        ▼
                   mail_emails  (processedAt: null)
                        │
                        ▼
                   email.processor.js  ──►  ai/triage.service.js
                        │                      │ openrouter → groq → openai
                        ▼                      ▼
                   mail_email_insights    priority · category · insight · deadline
                        │
                        ├──► GET  /api/email/inbox           Priority Inbox
                        ├──► POST /api/email/:id/summarize   on demand, cached
                        ├──► POST /api/email/:id/draft       on demand, versioned
                        └──► POST /api/email/draft/:id/send  RFC822 + threadId
                                     │
                                     └──► Socket.IO per-user room → in-app toast
```

### Screens (`mobile/src/app/`, expo-router file-based)

| Route | File | What |
|---|---|---|
| `/` | `index.tsx` | Connect Gmail |
| `/inbox` | `inbox.tsx` | Priority Inbox, pull-to-refresh runs a real Gmail sync |
| `/email/[id]` | `email/[id]/index.tsx` | Full email + NRYN Insight card |
| `/email/[id]/summary` | `email/[id]/summary.tsx` | Key points, Important, action items |
| `/email/[id]/reply` | `email/[id]/reply.tsx` | Tone pills, edit, regenerate, send |
| `/account` | `account.tsx` | Connection status, API URL, disconnect |

### Collections (all prefixed `mail_`)

`mail_users` · `mail_email_accounts` · `mail_emails` · `mail_email_insights` ·
`mail_email_summaries` · `mail_email_action_items` · `mail_email_drafts`

Its own database, `nryn_email`, so nothing here can touch the WhatsApp app's
data even on the same local `mongod`. Created on first write — you don't need to
make it by hand.

A user **is** a Google account — the Gmail consent screen is the login. No signup
form, no password. `account_jid` appears nowhere; that was a WhatsApp concept.

### API

| Method | Route | Notes |
|---|---|---|
| GET | `/api/health` | No auth. Reports mongo / google / llm configuration |
| GET | `/api/auth/google/url?redirect=` | Redirect is allowlist-checked, then signed into `state` |
| GET | `/api/auth/google/callback` | **Outside** session middleware — Google sends no headers of ours |
| POST | `/api/auth/exchange` | One-time code → session token |
| GET | `/api/auth/me` | User + account status + whether send is granted |
| POST | `/api/auth/disconnect` | Revokes at Google, marks the account `revoked` |
| GET | `/api/email/inbox` | `{ stats, priority[], other[] }`. `?includeIgnored=1` shows filtered mail |
| POST | `/api/email/sync` | Pull-to-refresh. Rate-limited 6/min |
| GET | `/api/email/:id` | Email + insight + cached summary + drafts |
| POST | `/api/email/:id/summarize` | Cached; `?force=1` regenerates. Rate-limited 12/min |
| PATCH | `/api/email/action-items/:id` | Checkbox state |
| POST | `/api/email/:id/draft` | `{ tone }`. Regenerate = call again, inserts a new version |
| GET | `/api/email/:id/drafts` | All versions, for the version stepper |
| PATCH | `/api/email/draft/:id` | Save manual edits, sets `isUserEdited` |
| POST | `/api/email/draft/:id/send` | The only call needing `gmail.send` |

---

## 7. Things that were done deliberately

**Cost control.** Triage runs on every email, so it's the only pass that scales
with inbox volume. Automated senders (`no-reply@`, `notifications@` …) go
straight to `ignore` with **no LLM call at all**; quoted reply chains are
stripped before the body is sent (otherwise you pay for the same thread on every
reply); bodies truncate at `TRIAGE_BODY_CHAR_LIMIT`. Summarize and Draft only run
when you tap them, are rate-limited per user, and summaries are cached — a second
tap costs nothing.

**The draft guard rail.** The reply prompt is explicitly forbidden from granting
an approval, a price, a date, or any commitment you haven't already made. If the
email asks for a decision, the draft acknowledges and asks the question instead.
This is the most important instruction in the app; don't loosen it.

**Security.** Gmail tokens are AES-256-GCM encrypted at rest and never leave the
server. The session token lives in the device keychain (`expo-secure-store`), not
AsyncStorage. Every database query is scoped to `req.userId` from the session
middleware, never an id from a request body. The OAuth redirect is allowlisted,
so the callback can't be turned into an open redirect. Socket.IO joins per-user
rooms — no global `io.emit()`, which would hand one user's mail metadata to every
connected client. Email bodies are never logged.

**Reliability.** The cron body is fully wrapped in try/catch, because an
unhandled rejection inside a `node-cron` tick kills the whole Node process. A
sync lock stops a slow bootstrap overlapping the next tick. Token refresh lives
in one `withFreshToken()` wrapper, which flips the account to `reauth_required`
on `invalid_grant` so a revoked account shows a **Reconnect Gmail** banner
instead of failing silently every 3 minutes. Every LLM JSON parse gets one repair
retry — that is where these pipelines actually break.

---

## 8. The `gmail.send` decision (still open)

`gmail.send` is a Google **sensitive scope**. In Testing mode it works
immediately for accounts added as Test users — fine for your own mailbox and up
to 100 testers. Opening it to any Gmail account needs a Google verification
review (days to weeks; needs a privacy policy URL, a homepage, and a demo video).

Everything up to a fully written, edited draft works on `gmail.readonly`. Only
the final Send is gated.

---

## 9. Shipping a real app (later)

Expo Go is for development. For an installable app:

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform android --profile preview     # .apk you can sideload
eas build --platform ios --profile preview         # needs an Apple Developer account
```

Two things change in a real build:

1. The deep link becomes `nrynmail://auth` instead of `exp://…`. Already handled —
   the backend allowlists both.
2. The backend can no longer be `http://192.168.x.x:4100`. Deploy it somewhere
   with HTTPS, set `EXPO_PUBLIC_API_URL` to that, set `NODE_ENV=production`, and
   add the deployed callback URL to the Google Console redirect URIs.

---

## 10. Not done here: Phase 0

This project doesn't touch the NRYN WhatsApp repo. That cleanup is still yours,
in one commit:

1. `rm -rf backend/src/email backend/src/jobs/email-sync.job.js backend/add-email-tables.js`
2. `rm backend/src/controllers/email.controller.js backend/src/routes/email.routes.js`
3. Remove the three phase-1 additions from `backend/server.js`: the `email.routes`
   require, the `app.use('/api/email', …)` mount, and the email cron start call
4. Remove `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI`
   from the WhatsApp app's `.env` and `.env.example`
5. Remove `googleapis` from its `package.json`, then `npm install` to prune
6. Drop its orphan email tables once this app has synced
7. **Gate:** NRYN still pairs WhatsApp, still ingests messages, still renders the
   Action Center — and `GET /api/email/inbox` returns 404 there

---

## 11. Troubleshooting

| Symptom | Cause |
|---|---|
| App shows "Cannot reach the NRYN Mail API" | `EXPO_PUBLIC_API_URL` is `localhost` or the wrong IP, or phone and computer are on different Wi-Fi networks. Check the URL on the Account screen |
| Changed `.env`, nothing changed | Env values are bundled. Restart with `npx expo start -c` |
| Browser opens for consent but never returns | `APP_SCHEME` in `backend/.env` doesn't match `scheme` in `mobile/app.json` |
| `redirect_not_allowed` from the backend | Same mismatch, or you're on a dev client with an unusual scheme. The allowlist is in `backend/src/auth/google.oauth.js` |
| `redirect_uri_mismatch` from Google | The URI in Credentials must match `GOOGLE_REDIRECT_URI` exactly — `http`, the port, no trailing slash |
| `mongo: "disconnected"` in `/api/health` | `mongod` isn't running. Test with `mongosh "mongodb://127.0.0.1:27017/nryn_email"` |
| Signed in, but every sync fails after an hour | No `refresh_token`. Google returns it only with `access_type=offline` + `prompt=consent` (both set) and only on a fresh consent — disconnect in Account and reconnect |
| Inbox loads but no insights | No LLM key, or triage hasn't run. Check `npm run db:stats` and the backend log |
| `403 missing_send_scope` | Account was connected before `gmail.send` was requested. Disconnect and reconnect |
| Signed out constantly | The token is cleared on any 401. Usually the backend restarted with a different `JWT_SECRET` |

---

## 12. What's next (the "agent" layer)

Once the nine verification steps pass, these turn a summarizer into an assistant,
and most need no new AI:

- **Push notifications** — `expo-notifications` on the `email:new_insight` event,
  so an urgent mail reaches you without the app open. The natural next feature now
  that this is a phone app
- **Daily digest** at 8am — "5 emails need replies, Sarah's is due today"
- **Waiting on you / waiting on them** — pure queries over `mail_emails` +
  `mail_email_drafts`
- **Snooze / remind me tomorrow** — a `remindAt` field and a cron sweep
- **Bulk draft** — loop the draft endpoint, present a review queue
- **Natural-language search** — embed subject + snippet, similarity search

If you later want one dashboard across WhatsApp and Email, build it as a *third*
thin aggregator that calls both backends. Merging the two codebases back together
is the thing to avoid.
