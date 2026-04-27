# BetLife v3 — End-to-End Test Report

**Build under test:** PR [#3](https://github.com/aanderafonin-hash/million/pull/3) (branch `devin/1776984978-betslife`)
**Frontend:** https://betslife-frontend-zdezuyqq.devinapps.com
**Backend:**  https://betslife-backend-attcywev.fly.dev
**Methodology:** drove the live deployment from two separate browser contexts (Chrome normal + Chrome Incognito) to prove the FastAPI backend is the source of truth (not localStorage), then verified pending-vs-immediate bet resolution, real-time WS chat, recovery-code reset, and the mobile media-queries.

## Result summary
| # | Test | Result |
|---|---|---|
| 1 | Shared DB across two browsers | passed |
| 2 | Sport bet stays Pending, life bet resolves immediately | passed |
| 3 | Real-time WebSocket chat across browsers | passed |
| 4 | Recovery-code password reset | passed (with one cosmetic i18n bug) |
| 5 | Mobile viewport (390px) | passed |

## Escalations
- **Cosmetic i18n bug (low severity):** the toast shown after a successful recovery reset is `Signed in as {name} e2e_andrey` — the `{name}` placeholder isn't substituted because `recovery` confirms via `T('logged_in') + ' ' + state.user.username` instead of the parameterized template used elsewhere. Functionality is unaffected; only the toast string is ugly. <ref_snippet file="/home/ubuntu/repos/million/betslife/app.js" lines="112-112" />

No other regressions or unexpected behavior.

---

## Test 1 — Shared DB across browsers (passed)

1. Registered `e2e_andrey` / `pass1234` in Chrome normal → recovery code `218B3902` shown and saved.
2. Topped up balance from 10 000 ₽ to 15 000 ₽ via the `+` button.
3. Opened Chrome **Incognito**, ran `localStorage.clear()` to defeat any cross-tab sharing, signed in with same credentials.
4. Incognito header showed avatar of `e2e_andrey` and balance **15 000 ₽** (not the new-account default of 10 000) — proving the value came from the backend.

Bonus evidence: after Test 2 deducted 100 ₽ in Chrome normal, the Incognito session immediately reflected `14 900 ₽` once it reloaded — the backend is the single source of truth.

## Test 2 — Sport stays Pending, life resolves immediately (passed)

Coupon: П1 (Leyton Orient — Burton Albion, `source=sportsdb`) + Будут (метро задержки, `source=featured`), stake 100 ₽.

- Resolve modal title: **"Bet placed — wait for resolution"**.
- Sport leg label: `Leyton Orient — Burton Albion П1 (Pending)`.
- Life leg label: `… Будут → Всё ок` (resolved on placement, lost).
- Balance: 15 000 → **14 900 ₽** (exactly −100 ₽).

This proves the resolution branch in <ref_snippet file="/home/ubuntu/repos/million/betslife/backend/app/routers/bets_router.py" lines="87-93" /> correctly skips `sportsdb`/`weather` events and leaves them to the background resolver.

## Test 3 — Real-time WebSocket chat (passed)

1. **Window A** (Chrome normal, logged in): clicked `📺 Go live` on Leyton Orient — Burton Albion → stream modal opened with **1 👀** viewer.
2. **Window B** (Incognito, same user logged in): clicked `📺 Go live` on the same event → both modals updated to **2 👀** viewers within ~1 s.
3. Window A typed `hello-from-A-1234` → Send.
4. Within ~1 s, Window B's chat panel showed `👻 e2e_andrey · hello-from-A-1234` — message bubble + avatar + viewer count badge all correct.

![Window A — message sent](https://app.devin.ai/attachments/06d0e248-7d71-4bd6-8735-b69efed2cbff/screenshot_0fed56a1bd044a1ab03256c634b6b9fa.png)
![Window B (Incognito) — same message received via WS](https://app.devin.ai/attachments/98407338-8f7c-47b1-aba3-4aa65319f9a6/screenshot_0a0ed27eb8ab4f23a94bef5d007dc064.png)

## Test 4 — Recovery-code reset (passed, with cosmetic note)

1. Signed out, opened Sign in / Register → **Recover** tab.
2. Submitted `e2e_andrey` + recovery code `218B3902` + new password `newpass5678` → Reset.
3. Server auto-issued a new JWT and the avatar+balance returned to the header. The toast read `Signed in as {name} e2e_andrey` — see escalation above.
4. Signed out, attempted login with **old** password `pass1234` → "Wrong credentials" (rejected).
5. Logged in with **new** password `newpass5678` → success, balance 14 900 ₽ preserved.

| Old password rejected | New password accepted |
|---|---|
| ![Wrong credentials toast](https://app.devin.ai/attachments/6b2d286d-0550-4cb9-b6af-4342721f6a24/screenshot_33c5a841fc48452c96ec7433062378e8.png) | ![Signed in](https://app.devin.ai/attachments/609df530-7ea5-47c6-8dfb-0bd051c80aad/screenshot_748ac308b016414dbbc6da1235d5199f.png) |

## Test 5 — Mobile viewport 390 × 844 (passed)

DevTools device toolbar set to Responsive 390 × 906. Reloaded.

Verified `@media (max-width: 720px)` rules from `style.css`:
- Tabs row scrolls horizontally (visible: 🌐 All, 🎭 Life, 🔴 Live, ⚽ Sport, ☔ We…) — `🌐 All` stays leftmost.
- Coupon panel is full-width below the events grid (no longer a fixed right column).
- User-chip's `.username` text is hidden — only avatar emoji + balance visible.
- `≡` hamburger button is visible inline next to the language flag.

![Mobile 390px layout](https://app.devin.ai/attachments/66a62a9f-10d6-42cb-a284-bb447aa01385/screenshot_98a604c3ab234dfd81a68898180f932a.png)

---

## Methodology notes

- All tests were executed against the live `betslife-backend-attcywev.fly.dev` API.
- Two browser contexts (Chrome normal window + Chrome Incognito window) were used to defeat any localStorage-based cross-tab sharing.
- The Incognito balance was verified after explicit `localStorage.clear()` to prove the data came from the backend, not a cached client.
- Screen recording tooling was unavailable for this run; screenshots provide the evidence trail. Total run time ~6 min of interactive driving.

## Devin session
https://app.devin.ai/sessions/7901ee0ed97a41c9b79c917edfc69f6b
