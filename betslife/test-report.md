# BetLife — Phase 2 E2E Test Report

**Tested deploy:** https://betslife-cpcmjldy.devinapps.com
**PR:** https://github.com/aanderafonin-hash/million/pull/3
**Devin session:** https://app.devin.ai/sessions/7901ee0ed97a41c9b79c917edfc69f6b
**Mode:** incognito Chrome, fresh localStorage, single sequential flow

## Summary

Ran the full 9-test plan in one continuous session on the live deploy. **All 9 tests passed.** No blockers, no regressions, no CI to verify (repo has no CI configured).

## Results

| # | Test | Result |
|---|------|--------|
| 1 | Anonymous gate — outcome click → sign-in modal + "Sign in to do that" toast | passed |
| 2 | Registration with avatar picker (🐶 selected, "tester" / "qwerty") | passed |
| 3 | Language switch to 中文 — full UI re-renders (tabs, coupon, FAB, lang pill) | passed |
| 4 | Top up balance: 10 000 → 15 000 ₽ via +5 000 ₽ chip + Confirm | passed |
| 5 | Create custom event — title/description/🚀 emoji/gradient → "Mine" tab | passed |
| 6 | Express bet (2 legs, stake 1000) → confetti + win 4 924,59 ₽ | passed |
| 7 | Open broadcast → animated canvas + LIVE pill, post chat comment | passed |
| 8 | F5 reload — user/balance/LIVE state persist | passed |
| 9 | Logout → user chip replaced by "Sign in / Register" | passed |

## Evidence

### Test 1 — gate

![Sign in modal blocks outcome click](https://app.devin.ai/attachments/25abb59e-bcf7-4edf-a134-8cf36b5e5efb/screenshot_d85a112800da443db622a80338d857c5.png)

Toast: "Sign in to do that". Coupon stayed empty.

### Test 2 — registration with avatar picker

| Avatar grid (Register tab only) | After register |
|---|---|
| ![Avatar grid](https://app.devin.ai/attachments/6212971b-4cf3-4e97-be53-3026964ce4c6/screenshot_05e4b1f0945443378094ca12699d4168.png) | ![tester chip 10 000 ₽](https://app.devin.ai/attachments/df2a5942-9975-4cb1-8bf9-97280b97da03/screenshot_3b04cf3ba21a48d5a33c077453c52abb.png) |

Avatar row hidden in Sign in mode and shown only in Register mode. Toast: "Registered, tester!"

### Test 3 — Chinese UI

![Chinese UI](https://app.devin.ai/attachments/6b81e621-186c-4699-b413-0048a2bdcbb7/screenshot_4cb500c4e0594c848083ecc50d44509e.png)

Tabs: 生活 / 直播 / 体育 / 荒诞 / 办公室 / 家 / 我的 / 历史. Coupon header: 投注单. FAB: + 创建事件. Lang pill: 🌐 ZH.

### Test 4 — top up

![15 000 ₽ + toast](https://app.devin.ai/attachments/fac2e872-714f-451f-8e0c-0045d6bada8b/screenshot_f3a871b8e7534c2286b28b502965b046.png)

Final balance 15 000 ₽; toast "Topped up 5 000 ₽". Count-up animation (cubic ease-out, 700 ms) runs between the modal close and final value (visual confirmed in transition; only end-state captured because screenshots are taken after the animation completes).

### Test 5 — custom event

![Custom event card on Mine](https://app.devin.ai/attachments/83890f22-95db-4e39-8447-379676e3dcf6/screenshot_e9cba28e82ff49ba969f2bb06cc24e06.png)

🚀 emoji in card avatar, title "Сосед Вася опоздает на работу", description "Любые опоздания засчитываются", author chip "tester" 🐶, both outcomes at 2.11. Auto-switched to **Mine** tab. Toast "Event added".

### Test 6 — winning express bet

![Confetti + result modal](https://app.devin.ai/attachments/7915fe62-37cf-417f-bc28-84ba29fc7f9a/screenshot_f574a650ae83430cb09f3b8da0d8cbff.png)

Stake 1 000 ₽ on a 2-leg express. Both legs resolved to user picks → "You won 4 924,59 ₽ 🎉". Confetti canvas burst over the page. Balance ledger after: 15 000 − 1 000 + 4 924,59 = **18 924,59 ₽** (matches topbar in next screenshots).

### Test 7 — broadcast + chat

![Stream canvas + chat](https://app.devin.ai/attachments/143279e6-07af-44a7-ba9c-75e0a5bf439f/screenshot_021d8e7b4a7a458e90420b4cf2476621.png)

Canvas placeholder animates (LIVE pill with pulsing red dot; "Live · 74 watching"). Chat message rendered with 🐶 avatar, "tester · 08:05 PM · Hello from tester!".

### Test 8 — persistence after reload

![After F5: balance and LIVE badge persisted](https://app.devin.ai/attachments/1be75dd5-a87b-4029-9fbf-76c092a8fd2e/screenshot_6de0e1cb4a3049b4b732f118c4d3d802.png)

`tester / 18 924,59 ₽` still in topbar; first card shows persisted red **LIVE** badge from the stream started above.

### Test 9 — logout

![Anonymous topbar after sign out](https://app.devin.ai/attachments/53508415-bfe2-4af8-b0ff-d4b8872b4cc0/screenshot_75e79bc9fb0349efa54f84d35c1e560d.png)

User chip replaced by **Sign in / Register** button. Coupon empty, FAB still visible (clicking would open the auth modal).

## Notes / non-blocking observations

- Stream URL is collected via the browser's native `prompt()` dialog. Cancel falls back cleanly to the canvas placeholder, but the modal styling is OS-controlled. Acceptable for a localStorage-only demo, but a custom in-app modal would feel more polished if you want to iterate later.
- "Possible win" calculation includes the 5% margin via the per-outcome odds (`1 / (p · (1 − margin))`), so effective payout is slightly below the raw probability inverse — this matches a normal bookmaker UX.
- Reload preserves the started stream's `LIVE` badge — that is intentional (state in `localStorage`), and clicking the same card re-opens the stream and chat history.

## Out of scope (not tested)

- 2-user chat sync (requires a backend; the chat is per-device localStorage).
- Real payment processing (virtual balance only).
- iframe embed of YouTube/Twitch (would need user-supplied URL).
- Translations for the ~126 ISO codes that fall back to English (only 中文 verified live).
