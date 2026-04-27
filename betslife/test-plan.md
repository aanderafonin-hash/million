# BetLife — E2E Test Plan (PR #3 phase 2)

Site under test: https://betslife-cpcmjldy.devinapps.com

Single recorded flow that exercises every new feature so a broken implementation would fail at one of the explicit assertions below.

## Pre-state
- Open the site in an incognito window (clean localStorage) so no prior user exists. No login on entry.
- Browser maximized via `wmctrl -r :ACTIVE: -b add,maximized_vert,maximized_horz`.

## Test 1 — Gate: anonymous user cannot bet
- Click any outcome in any event card on the **Life** tab.
- **Pass criteria:** the auth modal opens with the title "Sign in" (or localised equivalent) AND a toast appears containing "log in" / "войти" / equivalent. The coupon stays empty (Events count stays at 0 if visible).
- **Fail signal (would mean the gate is broken):** the outcome gets added to the coupon without the modal opening.

## Test 2 — Registration with avatar picker
- Switch to the "Register" tab in the auth modal. The avatar grid appears with 32 emoji buttons. The 🐶 (dog) button gets a highlighted (filled) background after click.
- Type username `tester` and password `qwerty`, click Register.
- **Pass criteria:**
  - The auth modal closes.
  - A toast appears reading "Registered, tester!" (en) or "Зарегистрирован, tester!" (ru).
  - The user chip in the top-right shows the dog emoji 🐶, the username `tester`, and balance `10 000 ₽`.

## Test 3 — Language switch end-to-end
- Click the 🌐 language picker, choose **中文**.
- **Pass criteria:** ALL of the following text strings change away from English/Russian to Chinese characters in a single render:
  - tab labels (e.g. "Life" → "生活")
  - "Coupon" panel header
  - "Place bet" button on the coupon
  - the "+ Create event" FAB label
- Switch back to **English** before continuing.

## Test 4 — Top-up balance with count-up animation
- Click the user chip → menu opens → click **Top up**.
- Click the chip "+5 000 ₽" (it fills the input with 5000) and click **Confirm**.
- **Pass criteria:**
  - During ~700 ms after clicking Confirm, the balance text in the top-right is observed at an intermediate value (any value strictly between 10 000 ₽ and 15 000 ₽) — proves count-up animation runs.
  - Final balance reads `15 000 ₽`.
  - A toast contains "+5 000 ₽" / "Top up done" / "Пополнено".
  - The balance element flashes green (background flash class applied).

## Test 5 — Create custom event with avatar + gradient + description
- Click **+ Create event** (FAB).
- Title: `Сосед Вася опоздает на работу`
- Description: `Любые опоздания засчитываются`
- Emoji: `🚀`
- BG color 1: `#ff7a1a` (default), BG color 2: change to `#2fbf71` via the colour picker.
- Outcomes: leave the two default outcomes ("Да"/"Нет") with prob 0.5 each.
- Click **Save**.
- **Pass criteria:**
  - Modal closes; tab switches to **🧑‍🎨 Mine**.
  - A new card appears at the top with emoji 🚀, the typed title, the description, an author chip with username `tester` and the dog avatar, and a visible orange→green gradient background tint.

## Test 6 — Place express bet (custom event + a default event) and verify deduction
- On the just-created event, click the **Да** outcome → coupon now has 1 leg.
- Switch to **Life** tab; click any outcome of any default event → coupon has 2 legs.
- Coupon summary shows: Events 2, Total odds equals product of the two listed odds (sanity check: > 1.00).
- Set Stake = `1000`. The "Place bet" button label updates to include `1 000 ₽`.
- Click **Place bet**.
- **Pass criteria:**
  - Resolve modal opens with two rows, each showing "Your pick" and "Actually" lines.
  - Toast appears with "Won" or "Lost" text matching modal summary.
  - Balance count-up animates again; final balance = 14 000 ₽ (lost) or 14 000 + win (won).
  - On a **win**: confetti canvas paints multi-coloured pieces (visible in screenshot/recording for ~2 s).

## Test 7 — Open broadcast modal and post chat comment
- On any event card, click **Go live**. When prompted for stream URL, leave blank and OK.
- **Pass criteria:**
  - Stream modal opens. Live pill with red pulsing dot is visible top-left of the player. Animated canvas placeholder draws (bubbles, "🔴 LIVE" text). Viewer counter updates from 0 to a non-zero number.
- Type `Привет, BetLife!` in chat input, press **Send**.
- **Pass criteria:**
  - Message appears in chat list with the dog avatar 🐶, name `tester`, the typed text, and a timestamp `HH:MM`.
  - After closing and reopening the same broadcast modal, the message is still there (localStorage persistence).

## Test 8 — Persistence after reload
- Reload the page (F5).
- **Pass criteria:**
  - The user chip still shows `tester / 🐶` and the balance remembered from Test 6.
  - The custom event still appears in the **Mine** tab.
  - The broadcast still appears in the **Live** tab; opening it shows the previous chat message.

## Test 9 — Logout returns to gated state
- Open user menu → **Logout**.
- **Pass criteria:** topbar shows "Sign in / Register" again. The Coupon panel says "Pick an outcome to add it to the coupon." Clicking an outcome reopens the auth modal (same gate as Test 1).

## Notes on what would be hidden if the feature were broken
- If `display:flex` overrode the `[hidden]` attribute (the bug we already fixed once), Test 1 and the auth modal in Test 2 would *both* show the avatar grid in login mode and Test 7's stream modal would be visible on page load.
- If localStorage namespacing per user is wrong, Test 8 would show somebody else's history or balance.
- If i18n re-render is broken, Test 3 would only translate static `data-i18n` text but leave dynamically-rendered strings (e.g. "Place bet — 1 000 ₽") in English.
- If the count-up animation hooks the wrong DOM node, Test 4 would jump from 10 000 to 15 000 with no intermediate values.
