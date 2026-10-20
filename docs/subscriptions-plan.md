# Subscriptions + OnePay: implementation plan

## 1. Current state

**Backend**
- **User model** `backend/app/models/user.py:11-29`: `first_name`, `last_name`, `phone` (E.164), `country`, `avatar_url`, `token_version`, and `created_at` as epoch-ms `BigInteger` with `_now_ms()` at :7. There are no entitlement fields yet.
- **Migrations**: `backend/migrations/001…003`. The latest is `003_user_profile.sql`. The convention is idempotent `ADD COLUMN IF NOT EXISTS` with a header comment. `create_all` runs in `core/database.py:21-23` and only creates missing tables.
- **Auth** `backend/app/core/security.py:121-147`:
  - `get_current_session` and `get_current_user` read the cookie first and fall back to Bearer.
  - A token is valid only while `ver` matches `token_version`.
  - The cookie is host-only, `lax`, httpOnly (`config.py:40-43`).
- **Auth routes** `api/auth.py`: signup creates the user at :237, Google-create at :452-460, `/me` at :269-271, `UserOut` at :88-119. `_NoStoreRoute` at :51-70 is reused by sync.
- **Mounting** `main.py:83-96`: auth, candles, symbols, indicators and sync are under `/api/v1`. **None of the data routers have any auth dependency.** The 9 WS routers have no prefix.
- **WebSockets**: every endpoint calls `ws.accept()` with no auth at all (`candle_stream.py:42`, `delta_stream.py:46`, `dom_stream.py:85`, `footprint_stream.py:172`, `heatmap_stream.py:77`, `tape_stream.py:93`, `volume_profile_stream.py:24`, `whale_stream.py:131`, generic `routes.py:14`).
  - The frontend never uses the generic `/ws/{channel}`, but it is reachable, so it must be gated too.
- **Can WS upgrades read the cookie? Yes, in both environments.**
  - Prod is same-origin.
  - Dev: the frontend calls `http://localhost:8000` directly (`api.ts:6`, `WS_BASE` in 8 components), not through the Vite proxy. Ports don't affect cookies, and localhost:5173 → localhost:8000 is same-site, so the Lax cookie is sent on the WS handshake.
  - Starlette exposes it as `ws.cookies`.
- **Origin middleware** `main.py:66-72`: it only checks unsafe methods on `/api/`, and **a missing Origin passes**, so OnePay's server-to-server callback is fine. **The catch:** if the gateway sends the browser back with a form POST, that request carries a foreign Origin and gets a 403. The return path therefore needs an exemption (see §3).
- **Sync** `api/sync.py:144-219` requires authentication only.
- **Rate limiting** `core/rate_limit.py:16` uses Redis and fails open.
- **httpx** is already used in `core/google_oauth.py:69`.

**Frontend**
- **`authStore.ts`**:
  - `AuthStatus` (`'checking' | 'authenticated' | 'anonymous'`) at :7
  - `ProfileTab` at :9
  - `init()` at :92-104
  - `handleSessionExpired` at :155-176, registered at :185
- **`api.ts`**:
  - `request()` at :105-124; a 401 on an `authRequired` request calls the handler at :119.
  - `AuthUser` at :26-43
- **`App.tsx:68-116`** renders the full app unconditionally. URL params are handled at :49-66, which is the pattern to copy for `?payment=`.
- **`Toolbar.tsx:203-227`** `AuthControls`.
- **`ProfileModal.tsx`**: `TABS` at :67-70; the tab keyboard handler at :79-85 assumes exactly 2 tabs; panels at :127-132.
- **`AccountMenu.tsx:31-32`**: menu items.
- **WS reconnects** unconditionally every 2s. The `onclose` handlers are at `TradingChart.tsx:407`, `DeltaPanel.tsx:321`, `DOMPanel.tsx:75`, `FootprintCanvas.tsx:536`, `HeatmapCanvas.tsx:253`, `TapePanel.tsx:69`, `VolumeProfile.tsx:199`, `WhaleMarkers.tsx:214`.

**Other**
- No OnePay or subscription code exists yet.
- `frontend/Dockerfile:12` copies `nginx.conf`, but that file isn't in git. I can't see how prod routes `/api` and `/ws`.

## OnePay facts: what I verified

The sources are the official PHP SDK (`src/OnePayClient.php`, `src/Support/HttpClient.php`, `Validator.php`) and docs.onepay.lk/api-documentation/payment-api.

**Confirmed**
- **Hash**: `sha256(app_id + currency + amount_2dp + salt)`, lowercase hex.
- **Header**: `Authorization: <APP_TOKEN>` with no "Bearer" prefix, plus `Content-Type: application/json`.
- **Redirect URL**: in `response["data"]["gateway"]["redirect_url"]`.
- **Reference**: at least 10 characters; Laravel caps it at 64.
- The SDK's base URL is `https://api.onepay.lk` and it appends `/v3/checkout/link/`. Your `ONEPAY_BASE_URL` already includes `/v3`, so we append `/checkout/link/` and `/transaction/status/`.
- **Status**: `POST /v3/transaction/status/` with `{app_id, onepay_transaction_id}` returns `status` (bool), `ipg_transaction_id`, `amount` (a number), `currency`, `paid_on` (`YYYY-MM-DD HH:mm:ss`, timezone unstated). The headers aren't documented; send the same `Authorization`.
- **Callback**: `{"transaction_id":"WQBV…","status":1,"status_message":"SUCCESS","additional_data":""}`. **It has no signature.**

**Unconfirmed: check in sandbox**
1. Where `ipg_transaction_id` sits in the create response (probably `data.ipg_transaction_id`). We store the raw JSON either way.
2. Whether the callback's `transaction_id` is OnePay's IPG id. It's undocumented, and a third-party Laravel package reads it as the merchant reference. **Mitigation:** we send our reference in `additionalData` and match on either field.
3. Whether the return is GET or POST, and whether an existing query string on the return URL is preserved. **Mitigation:** put the reference in the path.
4. Whether sandbox uses the same base URL with separate sandbox app credentials. The docs only list test cards (Visa 4508750015741019, 01/39, CVV 100).

The WHMCS plugin uses an older callback format with a `hash` field, `merchant_transaction_id` and `secretKey`. That's a different API version, so ignore it.

`ONEPAY_API_KEY` and `ONEPAY_VERIFY_URL` aren't used by the SDK's v3 checkout or the docs' status endpoint (only app_id, token and salt are). Drop them.

## 2. Data model

**`backend/app/models/user.py`** (after :29):
- `trial_ends_at = Column(BigInteger, nullable=True, default=_trial_end)`, where `_trial_end()` returns `_now_ms() + settings.trial_days * 86_400_000`. Because it's a model default, both signup (`auth.py:237`) and Google-create (`auth.py:452`) get it with no route changes. You can still set it explicitly at those two lines if you prefer.
- `subscription_ends_at = Column(BigInteger, nullable=True)`.

**New `backend/app/models/payment.py`**, registered in `models/__init__.py` and `main.py:10-12`:

| column | type | notes |
|---|---|---|
| id | BigInteger PK | |
| user_id | BigInteger FK users.id **ON DELETE RESTRICT** | Payments are financial records. No account-delete feature exists; if one is added, anonymise instead. |
| reference | String(64) unique not null | `"CYC" + secrets.token_hex(12)` (27 chars) |
| ipg_transaction_id | String(64) unique nullable | from the create response |
| amount | Numeric(10,2) | copied from the price **at checkout time** |
| currency | String(3) | `'LKR'` |
| status | String(16) | `pending`, `paid`, `failed`, `cancelled` (and `refunded` later). Plain string, no DB enum, so adding values stays cheap. |
| created_at, paid_at | BigInteger epoch ms | |
| period_start, period_end | BigInteger nullable | filled when paid |
| last_checked_at | BigInteger nullable | throttles status-API calls |
| last_status_json | Text nullable | raw status or create response, for audit |

Also add `Index(user_id, created_at)`.

**`backend/migrations/004_subscriptions.sql`**:
- `ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at BIGINT;` and the same for `subscription_ends_at`.
- `UPDATE users SET trial_ends_at = (EXTRACT(EPOCH FROM now())*1000)::bigint + 7*86400000 WHERE trial_ends_at IS NULL;`. The 7 is hard-coded with a comment saying it must match `TRIAL_DAYS`.
- `CREATE TABLE IF NOT EXISTS payments (...)`, kept for the record.
- **Run it before deploy, then run it again after deploy.** It's idempotent and only fills NULLs, so the second run catches users who signed up through the old code in between.

**`backend/app/core/config.py`** (after :51):
- `subscription_price_lkr: Decimal = Decimal("1000.00")`, with a validator requiring 2 decimal places and > 0.
- `subscription_days = 30`, `trial_days = 7`, `banner_days = 3`.
- `onepay_app_id`, `onepay_app_token`, `onepay_hash_salt`, `onepay_base_url = "https://api.onepay.lk/v3"`.
- `onepay_return_base_url: str = ""`: the public HTTPS base of the API. Validate that it starts with `https://`.
- `onepay_enabled` property, mirroring `google_enabled` at :70-72.
- Add the matching entries to `backend/.env.example`.

**New `backend/app/core/entitlement.py`** (pure functions):
- `access_until(user) = max(trial_ends_at or 0, subscription_ends_at or 0)`.
- `plan(user, now)`:
  - `"active"` if `subscription_ends_at > now`
  - otherwise `"trial"` if `trial_ends_at > now`
  - otherwise `"expired"`
- If someone pays during the trial, their plan reads "active" immediately, and the new end date stacks on top of the trial end.

## 3. Backend endpoints

New `backend/app/api/payments.py` uses `APIRouter(prefix="/payments", route_class=_NoStoreRoute)` and is mounted in `main.py:83-87`. New `backend/app/core/onepay.py` is a thin httpx client with `create_checkout()`, `get_status()` and `make_hash()`, plus `OnePayError`. Use a 15-second timeout.

| Method + path | Auth | Behaviour |
|---|---|---|
| `POST /api/v1/payments/checkout` | session (expired users allowed) | See details below. Returns `{reference, redirect_url}`. |
| `GET` + `POST /api/v1/payments/return/{reference}` | **none** | Find the payment by reference. If it's pending, `verify_and_apply`. Then **302** to `{FRONTEND_URL}/?payment=success\|pending\|failed&ref=…`. Never return a 500: any exception becomes `pending`. |
| `POST /api/v1/payments/onepay/callback` | **none** | See details below. **Always returns 200 `{"ok":true}`.** |
| `GET /api/v1/payments/{reference}` | session, owner only (404 otherwise) | Used by the frontend poll. If the payment is pending and `last_checked_at` is more than 10s old, verify it again. This covers a missed callback. Returns `{status, period_end, access_until, plan}`. |
| `GET /api/v1/payments` | session | Payment history, newest 50. |
| `GET /api/v1/auth/me` | session | `UserOut` (`auth.py:88-119`) gains `plan`, `access_until`, `trial_ends_at`, `subscription_ends_at`, `server_now`, `price_lkr` (as a string), `period_days` and `banner_days`. All values are server-driven, so the env vars control the UI. |

**`POST /payments/checkout` in detail**
1. Requires `first_name`, `last_name` and a `phone` matching E.164 (reuse `_PHONE_RE` at `auth.py:131`). If any is missing, return 409 `profile_incomplete`.
2. Rate limit with `rate_limit.hit(f"checkout:{uid}", 5, 600)`, giving 429.
3. Insert a pending row and commit it before calling OnePay.
4. Call OnePay with:
   - `amount = f"{price:.2f}"`
   - `hash` over that exact string
   - `transaction_redirect_url = {ONEPAY_RETURN_BASE_URL}/api/v1/payments/return/{reference}`
   - `additionalData = reference`
5. Store `ipg_transaction_id` and the raw response. If OnePay returns an error, mark the row `failed` and return 502.

**`POST /payments/onepay/callback` in detail**
1. Parse the JSON leniently; malformed input is logged and still gets a 200.
2. Look up the payment by `ipg_transaction_id == transaction_id`, falling back to `reference == additional_data`.
3. If it's pending, run `verify_and_apply` using **our stored IPG id**, never a value from the callback.
4. Add a per-IP rate limit so a flood can't hammer OnePay's status API.

**Exemption:** `check_origin` (`main.py:68`) must skip `/api/v1/payments/return/` and `/api/v1/payments/onepay/callback`. Neither uses the session, so CSRF doesn't apply to them.

**`verify_and_apply(db, payment_id)`** is shared by the return, callback and poll paths:
1. Call `get_status(payment.ipg_transaction_id)` **outside any DB lock**. A network call must never hold a row lock.
2. Payment counts as verified only if **all** of these hold:
   - `resp.status is True`
   - `resp.ipg_transaction_id == payment.ipg_transaction_id`
   - `Decimal(str(resp.amount)).quantize(Decimal("0.01")) == payment.amount`. This compares against the stored checkout amount, not the current env price, so a price change can't break in-flight payments.
   - `resp.currency == "LKR"`
3. Inside one transaction, lock rows in a fixed order: `SELECT users … FOR UPDATE`, then `SELECT payments … FOR UPDATE`. Then:
   - Proceed only if the payment's status is `pending` or `failed` (`paid` is terminal, which makes this idempotent).
   - `now = _now_ms()`
   - `period_start = max(now, access_until(user))`
   - `period_end = period_start + SUBSCRIPTION_DAYS * 86_400_000`
   - `user.subscription_ends_at = period_end`
   - On the payment, set `status='paid'`, `paid_at=now` and `last_status_json`.
4. The user-row lock serialises two different payments for the same user, so both extensions stack correctly. The pattern is the same one `sync.py:164` already uses.
5. `status false` stays `pending`. The status API is boolean, so false can also mean "not paid yet." A row becomes `failed` only when the callback says it failed **and** the status API also returns false. Pending rows older than 24h show as "abandoned" in the history.
6. Periods start at **verification time**, not `paid_on`, because `paid_on`'s timezone is unknown. A late callback costs the user nothing, since we take `max(now, end)`.

## 4. Entitlement enforcement

**REST.** Add `require_entitlement` to `core/entitlement.py`:
- It runs `get_current_user`, giving 401 when there's no session.
- If the plan is expired it raises **402** `{"detail":"subscription_required"}` with no-store headers.
- Apply it at mount time in `main.py:84-86`: `app.include_router(candles_router, prefix="/api/v1", dependencies=[Depends(require_entitlement)])`, and the same for symbols and indicators. The router files don't change.

**WebSockets.** Add a pure ASGI middleware, `WSEntitlementMiddleware` in `core/entitlement.py`, registered in `main.py` next to CORS. It covers all 9 endpoints and any future ones in one place:
1. For a `websocket` scope with a `/ws/` path, check `Origin` against `settings.cors_origins`. This blocks cross-site WS hijacking, which becomes relevant once the cookie carries entitlement.
2. Parse the cookie from the scope headers, then `decode_token`, load the user, and check `ver`, `is_active` and the plan.
3. To deny, the middleware itself sends `websocket.accept` followed by `websocket.close` with code **4401** (no session) or **4402** (expired). It accepts first because a close before accept reaches the browser as an opaque 1006.

**Mid-session expiry on WS** (decision for you):
- **(a) Recommended:** check at connect time plus a frontend timer (§5). Honest users see the paywall at the exact moment access ends, and the unmount closes all sockets.
- **(b) Hardening:** the middleware also wraps `receive` and injects `websocket.disconnect` at `access_until`. It's riskier because the relay loops in the stream files only send and never receive.

**Sync** stays auth-only, not entitlement-gated. Expired users must still be able to flush and pull their settings and drawings, and it's not market data.

**Open routes:**
- `/health`
- `/api/v1/auth/*`
- all of `/api/v1/payments/*` (return and callback are anonymous; the rest are session-only)
- `/api/v1/sync*` (session only)

**DB outage behaviour changes.** Today the chart works without a database (`main.py:36-37`). With gating, a DB outage turns data routes into 500s and fails every WS. I recommend failing closed and noting it.

## 5. Frontend

**`services/api.ts`**
- Extend `AuthUser` (:26-43) with the new `/me` fields.
- Add `registerEntitlementHandler`. In `request()` at :119, also route **402** to it, for every request and not just `authRequired` ones. This matters because callers like `useCandles.ts:16` and the overlays swallow errors.
- Add `paymentsCheckout`, `paymentStatus(ref)` and `paymentsList`.

**`store/authStore.ts`**
- Add `ProfileTab` value `'subscription'` (:9).
- Add `refreshMe()`, which re-fetches `/me` and sets `user`.
- Add `entitlementLost()`, which calls `refreshMe` with a guard like the `expiring` flag at :79-ish.
- Add an expiry timer set to `access_until - server_now`:
  - Clamp it to ≤ 2³¹-1 ms (setTimeout overflow) and re-arm when it fires.
  - Also refresh on `visibilitychange` and every 10 minutes.
- Add derived selectors: `plan`, `daysLeft = ceil((access_until - now)/86400000)`, and `showBanner = 0 < left ≤ banner_days·day`.

**`App.tsx:68-116`**: render one of four states.
- `checking`: full-screen splash.
- `anonymous`: `<LoginWall/>`, a new `components/Auth/LoginWall.tsx`:
  - It shows a branded panel with the `AuthModal` form embedded.
  - `AuthModal` needs an `embedded` or non-dismissable variant without the close button.
- `authenticated` and `plan === 'expired'`: `<Paywall/>`, a new `components/Subscription/Paywall.tsx`:
  - Shows "Subscribe to continue – LKR 1000.00 / 30 days".
  - Buttons: Subscribe, Account (opens the profile on the subscription tab), Log out.
- Otherwise: the current app plus `<SubscriptionBanner/>` above the Toolbar.
- Keep `AuthModal`, `ProfileModal` and `ToastStack` **outside** the gate.
- `AlertsEngine` goes **inside** it, because it polls gated endpoints.
- Unmounting the app on expiry closes every socket and stops all polling.

**`?payment=` handling**: add it next to `auth_error` at :52-60.
- Read `payment` and `ref`, then strip them from the URL.
- Open the Subscription tab in a "verifying…" state.
- Poll `GET /payments/{ref}` every 3s for up to 2 minutes.
- When it's paid: `refreshMe()` and a success toast.
- If it times out: "Still processing. We'll update automatically. Contact support with ref XYZ."

**WS close handling** in the 8 `onclose` handlers listed in §1:
- If `ev.code === 4401 || 4402`, don't reconnect.
- Call `useAuthStore.getState().entitlementLost()` (4401 goes to `handleSessionExpired`).
- Put this in a tiny shared helper, `utils/wsAccess.ts`.

**`ProfileModal.tsx`**
- Add a third entry to `TABS` (:67-70).
- Make the tab-ref record and the arrow-key handler (:77-85) cycle through N tabs.
- Add `SubscriptionPanel`. It shows:
  - the plan badge
  - the end date ("Access until …") and days left
  - a Subscribe or Renew button
  - history from `GET /payments`: date, amount, status, period
- The button is disabled if `onepay` isn't configured.

**Profile-completeness prompt**
- Before checkout, if first name, last name or phone is missing, show an inline notice and switch to the Profile tab, focusing the first missing field.
- After the user saves, they go back to Subscription.
- Checkout itself navigates with `window.location.assign(redirect_url)`.

**`AccountMenu.tsx:31-32`**: add a "Subscription" item.

## 6. Local testing and prod config

**Local (sandbox credentials)**
1. Run `cloudflared tunnel --url http://localhost:8000`. It prints `https://<random>.trycloudflare.com`.
2. Set these in `backend/.env`:
   - `ONEPAY_RETURN_BASE_URL=https://<random>.trycloudflare.com`
   - the sandbox `ONEPAY_APP_ID`, `ONEPAY_APP_TOKEN` and `ONEPAY_HASH_SALT`
   - `FRONTEND_URL=http://localhost:5173` (unchanged)
3. In the OnePay portal, under APP for the sandbox app, set the callback to `https://<random>.trycloudflare.com/api/v1/payments/onepay/callback`. **A quick tunnel's URL changes on every run**, so update both each time, or use a named tunnel.

How cookies and redirects behave in this setup:
- The browser calls checkout on localhost:8000 with the localhost cookie and is sent to OnePay.
- OnePay returns the browser to the **tunnel host**, which has no cookie. That's fine, because the return handler is sessionless by design.
- The handler 302s to `http://localhost:5173/?payment=…`, where the localhost cookie applies again, so polling works.
- The callback reaches the backend through the tunnel with no Origin, so it passes.

Smoke test: `curl -X POST <tunnel>/api/v1/payments/onepay/callback -d '{}'` should return 200.

**Prod**
1. Set the env vars: the live `ONEPAY_*`, `ONEPAY_RETURN_BASE_URL=https://checkyourchart.net`, `FRONTEND_URL=https://checkyourchart.net`, plus the 4 price and duration vars.
2. In the portal, set the callback to `https://checkyourchart.net/api/v1/payments/onepay/callback`.
3. **Cloudflare:** add a WAF skip rule for `/api/v1/payments/onepay/callback` and `/payments/return/*`. Otherwise Bot Fight Mode or a challenge can silently block OnePay's server POST. Add a cache bypass for `/api/*`.
4. Run migration 004, deploy, then run 004 again.
5. Confirm the missing `nginx.conf` forwards `/api` and `/ws` with the upgrade headers.

## 7. Phases

**P1: Data model, trial and plan info in `/me`** (deployable on its own; nothing is enforced yet)
- **Files:**
  - backend: `config.py`, `models/user.py`, `core/entitlement.py` (pure functions), `auth.py` (`UserOut`), `migrations/004`, `.env.example`
  - frontend: `api.ts` (`AuthUser`), `authStore` (selectors and timer), a read-only `SubscriptionPanel`, `ProfileModal` tabs, `AccountMenu`, `SubscriptionBanner`
- **Risk:** existing prod users. Run 004 at deploy time, because the 7-day clock starts when it runs.
- **Test:**
  - A new email user and a new Google user both get `trial_ends_at ≈ now+7d`.
  - The migration fills only NULLs, and running it twice is a no-op.
  - Plan transitions work: set `trial_ends_at` in the past with SQL and the plan reads `expired`.
  - Set it to now+2d and the banner shows "2 days".
  - The tab keyboard navigation works with 3 tabs.

**P2: OnePay checkout, return, callback and status (sandbox)**
- **Files:**
  - backend: `core/onepay.py`, `models/payment.py`, `api/payments.py`, `main.py` (router, model import, `check_origin` exemption)
  - frontend: `api.ts`, Subscribe/Renew, profile-completeness flow, `?payment=` handling with polling, history
- **Risks:** the 4 unconfirmed items under "OnePay facts", and whether OnePay accepts non-Latin names (Sinhala first names).
- **Test (with the tunnel):**
  - The hash for a known input matches the PHP SDK's output.
  - A test-card payment marks the payment paid and extends access to `max(now, end) + 30d`. Paying twice stacks to +60d.
  - Replaying the callback 3 times extends access only once.
  - A forged callback carrying a pending payment's id doesn't mark it paid.
  - With the portal callback disabled, the return and poll paths alone settle the payment.
  - Cancelling at the gateway leaves the payment pending or failed and shows the right message.
  - A wrong amount (edit the DB row) is not marked paid.
  - A missing phone gives 409 and the UI prompt appears.
  - The 6th checkout within 10 minutes gives 429.
  - A gateway POST-return isn't blocked by `check_origin`.

**P3: Enforcement, login wall, paywall and mid-session handling**
- **Files:**
  - backend: `core/entitlement.py` (`require_entitlement` plus the WS middleware), `main.py:84-86` plus middleware registration
  - frontend: `App.tsx`, `LoginWall.tsx`, `Paywall.tsx`, `AuthModal` embedded variant, `api.ts` 402 handler, 8 `onclose` handlers plus `utils/wsAccess.ts`
- **Risks:**
  - An extra DB query on every data call. That's acceptable; add caching later if needed.
  - A DB outage now blocks everything.
  - `dist`-built clients already open in browsers won't understand 402 or 4402 until they reload, though their sockets will just fail to connect.
- **Test:**
  - Anonymous `curl` to `/api/v1/candles/BTCUSDT` gives 401. With an expired user's cookie it gives 402.
  - The `websocat` WS handshake closes with 4401 and 4402 respectively. A foreign Origin is rejected.
  - Sync still works for an expired user.
  - Logged out, you see the login wall, and Google `auth_error` still shows on it.
  - With an expired plan, the paywall works, and you can still open Account and log out.
  - Pushing `trial_ends_at` to now+60s with the app open swaps in the paywall within about a minute and stops sockets reconnecting.
  - Paying from the paywall brings back the full app.

Optional **P4**: an admin grant/refund CLI script and the WS mid-session watchdog (option b).

## 8. Decisions for you

1. **Mid-session WS expiry:** frontend-driven, which I recommend, or the server watchdog?
2. **Sync for expired users:** keep it open, as I recommend? Anonymous sync doesn't exist; behind the login wall, anonymous localStorage use simply goes away.
3. **Manual grants and refunds:** there's no admin UI. I'd propose `python -m app.scripts.grant_access <email> <days>`, plus a documented SQL snippet for refunds that sets the payment `refunded` and pulls back `subscription_ends_at`. The refund itself is done in the OnePay portal.
4. **Stacking cap:** should we refuse checkout when access already runs more than N days ahead (e.g. 90)? That avoids accidental triple payments.
5. **Displayed timezone:** the browser's local timezone, or the chart's `timezoneStore` setting? Day counts use `server_now` to avoid clock skew.
6. **Existing prod users:** 7 days from when 004 runs. Do you want to announce it in-app beforehand?
7. **Payments FK:** `RESTRICT` (my proposal) or `SET NULL` if you plan account deletion.
8. **DB outage:** fail closed (my proposal) or let the data routes keep working?
9. **Get answers from OnePay or sandbox before P2:** the 4 unconfirmed items under "OnePay facts", the sandbox base URL, and whether the return is GET or POST.

Sources: [OnePay payment API docs](https://docs.onepay.lk/api-documentation/payment-api), [OnePay test cards](https://docs.onepay.lk/testing/test-cards), [php-checkout-sdk](https://github.com/onepay-srilanka/php-checkout-sdk), [onepay-laravel](https://github.com/onepay-srilanka/onepay-laravel), [onepay-WHMCS](https://github.com/onepay-srilanka/onepay-WHMCS), [@onepay-payment-sdk/server README](https://app.unpkg.com/@onepay-payment-sdk/server@0.0.3/files/README.md), [developer.onepay.lk](https://developer.onepay.lk)

## Decisions

1. **Mid-session WS expiry:** frontend-driven timer (option a). No server watchdog for now.
2. **Sync** stays open (auth-only) for expired users.
3. **Phase 4 (optional, later):** `python -m app.scripts.grant_access <email> <days>` plus a documented refund SQL snippet.
4. **Stacking cap:** refuse checkout with **409 `too_far_ahead`** when `access_until > now + 90 days`. The 90 is configurable (`MAX_PREPAID_DAYS=90`).
5. **Dates** are shown in the browser's local timezone; day counts are based on `server_now`.
6. **P1-P3 are deployed together.** Migration 004 runs at that deploy (before and again after), so the trial clock starts when enforcement goes live.
7. **`payments.user_id`** FK is `ON DELETE RESTRICT`.
8. **Data routes fail closed** on a DB outage.
9. **Unconfirmed OnePay items** are resolved during P2 sandbox testing; the return handler accepts both GET and POST.
10. **Non-Latin names:** if OnePay rejects customer names (e.g. non-Latin letters), show a clear message asking for the name in English letters.
