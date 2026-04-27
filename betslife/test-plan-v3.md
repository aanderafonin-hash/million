# BetLife v3 — adversarial test plan

**What changed:** site moved off localStorage onto a real FastAPI backend (Fly.io, SQLite). User accounts, balance, bets, events, streams, and chat are now stored server-side. Real sport events come from TheSportsDB and weather events from Open-Meteo, with a background resolver. Mobile media-queries, profile page with JSON export, and recovery-code reset added.

**Live targets:**
- Frontend: https://betslife-frontend-zdezuyqq.devinapps.com
- Backend:  https://betslife-backend-attcywev.fly.dev

**Why these tests are adversarial:** each one would visibly *fail* if the implementation were still localStorage-based or if the new endpoint were broken. They distinguish "real backend" from "fake".

## Test 1 — Shared DB across browsers

**Why this is adversarial:** if the app were still localStorage-only, account A registered in Chrome would NOT be visible from Chrome's Incognito. Forcing a different browser context is the canonical break-test for shared state.

Steps:
1. In Chrome (normal window) on the prod URL → Register user `e2e_<ts>` with password `pass1234`. Click "I've saved the code". Note recovery code shown in the modal.
2. Top up +5000 ₽ via the `+` button → balance jumps to **15 000 ₽** with a green flash animation.
3. Open Chrome Incognito → same prod URL → click "Sign in / Register" → Sign in tab → enter same `e2e_<ts>` / `pass1234`.

Pass criteria:
- Incognito window header MUST show the avatar of `e2e_<ts>` and balance **15 000 ₽** (NOT 10 000). If it shows 10 000 ₽ → test FAILS (means new account was created in Incognito because state wasn't shared).
- The same user's username appears in `GET /api/auth/me` from both browsers (verified via DOM `.username` element).

## Test 2 — Sport-event bet stays pending; life-event bet resolves immediately

**Why this is adversarial:** old behavior would resolve every bet on placement. New behavior must keep `source in (sportsdb, weather)` events pending for the background resolver. If both resolve immediately → backend regression.

Steps (logged in as `e2e_<ts>` from Test 1):
1. Click outcome on one **Featured** life event (`source="seed"`).
2. Click outcome on one **Sport** event (e.g., "Leyton Orient — Burton Albion", `source="sportsdb"`).
3. Stake 100 ₽ → "Place bet".

Pass criteria:
- Resolve-modal title MUST be "**Bet placed — wait for resolution**" (status pending).
- The sport leg MUST show "Pending" next to the outcome label.
- The life leg MUST show "→ <actual outcome>" (resolved). If both legs show Pending → bug A: life events not resolving. If both show resolved → bug B: sport events resolved without real data.
- Balance decreases by exactly 100 ₽.

## Test 3 — Real-time chat across two browsers

**Why this is adversarial:** if WS were broken, message posted in window A would not appear in window B without manual reload. localStorage chat (old behavior) would never appear in another browser at all.

Steps:
1. Window A (logged in): click 📺 **Go live** on event "Кот скинет что-то со стола сегодня" → stream modal opens.
2. Window B (Incognito, logged in same user): click 📺 **Go live** on the same event.
3. Window A: type `hello-from-A-<ts>` → Send.

Pass criteria:
- Within ≤ 3 s, Window B's `#chat-messages` MUST contain a message bubble with text `hello-from-A-<ts>` AND avatar emoji.
- Window B's viewer count badge MUST display ≥ 2 (we have two open WS connections to the same event).
- If the message only appears in Window A and not in Window B → WebSocket bridge is broken.

## Test 4 — Recovery-code password reset

**Why this is adversarial:** broken recovery would silently fail or reset to wrong account. We force a new password and prove it works.

Steps:
1. Window A: profile menu → Sign out.
2. Click "Sign in / Register" → **Recover** tab.
3. Enter username `e2e_<ts>`, recovery code from Test 1, new password `newpass5678` → Reset.
4. Log out → log in with `e2e_<ts>` / `newpass5678`.

Pass criteria:
- Step 4 succeeds (username + balance shown). If "Wrong credentials" appears → recovery failed.
- Step 4 with the OLD password (`pass1234`) MUST be rejected with "Wrong credentials" toast.

## Test 5 — Mobile viewport

**Why this is adversarial:** new media-queries are pure CSS additions; if a selector is wrong, the topbar/coupon overlap or the hamburger doesn't appear.

Steps:
1. Open DevTools → toggle device toolbar → **iPhone 12 (390 × 844)**.
2. Reload.

Pass criteria:
- The category tabs row scrolls horizontally without wrapping; "🌐 All" stays leftmost and "📜 History" reachable by swipe.
- Coupon panel is full-width below the events grid (NOT a fixed right column).
- The user-chip's `.username` text is hidden (only avatar emoji + balance visible) per `@media max-width: 720px` rule.
- A standalone `≡` (hamburger) button is visible (display=inline-block on small viewport).

---

This is intentionally ONE primary flow (Tests 1+2+3 are the canonical "two devices, real-money-style bookmaker" scenario) plus two narrower checks (4 = recovery, 5 = mobile). Total target ~5 minutes of recorded video.
