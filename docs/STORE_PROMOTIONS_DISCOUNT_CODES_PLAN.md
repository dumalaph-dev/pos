# Store Promotions and Discount Codes Implementation Plan

**Status:** Deferred future plan — saved for later on 2026-09-14; not scheduled
**Created:** 2026-09-14
**Scope:** Owner-managed promotions and discount codes at `/admin/promotions`, redeemable at the POS, in the online store, or both, with schedules, expiry, usage limits, and a redemption ledger
**Implementation state:** Planning only. Do not start implementation until the decisions in §15 are approved.

## 1. Executive summary

Today `/admin/promotions` is a **read-only discount report**. It summarizes Senior Citizen, PWD, and custom-percentage discounts that cashiers applied at the POS. Store owners cannot create an offer, schedule it for a holiday, give it a code, stop it on a date, or see who used it.

This plan turns the page into a **promotions workspace** built on three concepts:

1. **Promotion.** One offer with a purpose, for example *Pasko Sale 2026: 15% off, max ₱300, minimum spend ₱1,000*. It has an occasion, a discount rule, a schedule, the channels it works in (POS, online, or both), the branches it covers, and usage limits.
2. **Code.** What a customer or cashier types, for example `PASKO26`. One promotion can have several codes, such as one per influencer or one for Facebook and another for flyers. Each code can have its own usage cap.
3. **Redemption.** An append-only record created each time a code discounts a real order. It keeps the order, channel, branch, discount amount, and whether a void, refund, or cancellation later reversed it.

The server owns the discount math. The POS and online checkout show a preview, but `place_order` and `place_online_order` recompute and enforce every rule. A tampered client or stale tablet therefore cannot give away more than the owner configured.

Holiday and event support comes from **occasion templates**, such as Christmas, Valentine's Day, payday weekends, or a store anniversary. A template pre-fills the name, suggested code, dates, and a sensible offer. **Duplicate for next year** turns a past campaign into a new draft.

## 2. Current state and constraints

### 2.1 What exists

| Area | Current implementation | Relevance |
|---|---|---|
| Promotions page | [src/app/admin/promotions/page.tsx](../src/app/admin/promotions/page.tsx): server-rendered report with discount KPIs, a daily trend, a type mix, and recent discounted orders | Becomes the **Overview** tab; the analytics are kept and extended |
| POS discounts | `DiscountModal` in [src/components/pos/SellScreen.tsx](../src/components/pos/SellScreen.tsx): None / Senior / PWD / Custom % | Gains a **Promo code** option |
| Discount math | [src/lib/pos/pricing.ts](../src/lib/pos/pricing.ts): `discountAmount`, `saleTotals`; VAT is computed on the discounted, VAT-inclusive total | Promo evaluation must produce the same `SaleTotals` shape |
| Discount types | `discount_type` enum `none, senior, pwd, custom` ([SCHEMA.md §1](SCHEMA.md)); `orders.discount_amount`, `discount_ref`, `discount_approval_id` | Gains a `promo` value and promotion foreign keys |
| Custom-discount policy | `0032_admin_pin_discount_policy.sql`: `place_order(p_order, p_items)` enforces the Admin PIN threshold for `custom`, using one-use `discount_approvals` | Promo discounts are pre-approved by the owner and skip the PIN, but `place_order` must validate them |
| Offline POS | [src/lib/offline.ts](../src/lib/offline.ts): sales queue in the IndexedDB outbox and replay through the idempotent `place_order` on `local_uuid`; the offline profile caches display promotions and the discount threshold | Promotions must be cached for offline use; replay must never reject a sale the customer already paid for |
| Online ordering | `place_online_order` (latest in `0063_online_ordering_protection.sql`) computes `subtotal`, `tax_amount`, `delivery_fee`, and `total` server-side, with per-store locking, phone verification, and `online_order_attempts` rate limiting. The public checkout lives in [src/components/online-ordering/PublicMenuClient.tsx](../src/components/online-ordering/PublicMenuClient.tsx), and totals come from `calculateOnlineOrderTotals` in [src/lib/online-ordering.ts](../src/lib/online-ordering.ts) | Gains a promo-code input and server-side redemption |
| Online → POS handoff | When a ready pickup is loaded, the POS **rebuilds the cart from `online_order_items`** and finishes with `complete_online_order` (`0056`) | The promo discount from the online order must carry into the POS sale without being revalidated |
| Reversals | `0020` voids and refunds insert a linked reversal row; reports drop reversed originals through `selectNetSales` | Reversals must mark the redemption reversed |
| Reports and receipts | [src/lib/admin/sales-reports.ts](../src/lib/admin/sales-reports.ts) has discount rows by type; [src/lib/receipt.ts](../src/lib/receipt.ts) prints a discount line and shift discount totals | `promo` rows and a promo label on receipts |
| Calendar | [src/components/calendar/CalendarScreen.tsx](../src/components/calendar/CalendarScreen.tsx) stores `holiday`/`promotion` events in **browser localStorage only** (`dumala.calendar.events.v2`) | Can overlay promotions read-only; it is not a data source |

### 2.2 Naming collisions to avoid

The codebase already uses "promotion" for two unrelated things:

- `display_promotions` (`0042`): image and copy cards rotating on the customer display.
- `platform_promotions` (`0040`): Dumala's own SaaS billing promo codes for subscribers.

New tables therefore use the **`store_promotion`** prefix. UI copy says "Promotions" for the owner, and code and SQL comments must say which kind is meant.

### 2.3 Hard constraints

- **Money is integer centavos** (`bigint`). Percentages are `numeric(5,2)`.
- **Organization and branch isolation** through the existing `auth_org_id()`, `auth_store_id()`, and `auth_is_admin()` helpers. Anonymous visitors never read promotion tables directly.
- **Business day is Philippine time (UTC+8).** Existing pages format with `Asia/Singapore`, which has the same offset. Schedules store `timestamptz` and are entered and displayed as Asia/Manila local time.
- **Offline-first POS.** A cashier must be able to finish a sale during an internet outage.
- **Statutory discounts come first.** Senior Citizen and PWD discounts are legally mandated (PRD §4) and must never be blocked by a promotion.
- **Append-only history.** Redemptions, like orders and audit logs, are never deleted or rewritten; reversals are new state, not edits.
- **Next.js in this repo has breaking changes** ([AGENTS.md](../AGENTS.md)). Read the relevant guide in `node_modules/next/dist/docs/` before writing route, Server Action, or caching code.

## 3. Goals

### 3.1 Primary goals

- Owners can create, schedule, pause, resume, duplicate, and archive promotions without developer help.
- Each promotion can target **POS**, **online store**, or **both**, and **all branches** or selected branches.
- Promotions have a **start** and an optional **expiry**, and move automatically between Scheduled, Active, and Expired.
- Owners can issue **one or many codes** per promotion, with total and per-customer usage caps.
- Owners can track **every redemption**: who, where, when, which order, and how much discount, plus usage against the cap.
- Holiday and event **templates** make seasonal campaigns fast, and **duplicate** makes recurring ones repeatable.
- Cashiers can apply a promotion by typing a code or picking from today's available promotions.
- Online customers can enter a code at checkout and see the discount before placing the order.
- Every rule is enforced server-side, and every change and redemption is audited.

### 3.2 Secondary goals

- Promotions appear on the Calendar as read-only campaign bars.
- The dashboard warns about promotions expiring within 7 days and promotions that hit their cap.
- The existing Senior, PWD, and Custom discount analytics remain available.

### 3.3 Non-goals for the first release

- Product-, category-, or item-specific discounts, and Buy-X-Get-Y or bundle pricing. Promotions discount the whole order subtotal in v1; §15 decision 2 covers the later extension.
- Stacking several discounts on one order.
- Automatic promotions with no code or cashier action. Showing available promotions to the cashier covers the in-store case.
- Customer accounts, loyalty points, or unique single-use codes generated in bulk. v1 caps per verified phone number instead.
- Discounting the delivery fee.
- Paid-media integrations, SMS or email blasts, and QR code printing. Codes can be copied for the owner's own channels.

## 4. Domain model

### 4.1 Promotion

| Field | Rule |
|---|---|
| `name` | 3–80 characters, shown to cashiers, customers, receipts, and reports |
| `description` | Optional, up to 280 characters, shown as online checkout helper text when the promotion is public |
| `occasion` | `holiday`, `event`, `seasonal`, `payday`, `anniversary`, `clearance`, `other`; drives icons, filters, and templates |
| `occasion_label` | Optional free text, for example "Sinulog 2027" |
| `discount_kind` | `percent` or `fixed` |
| `percent_off` | Required for `percent`: 0.01–100 |
| `amount_off_centavos` | Required for `fixed`: at least 1 |
| `max_discount_centavos` | Optional cap for `percent` offers, for example 15% off with a ₱300 maximum |
| `min_subtotal_centavos` | Optional minimum item subtotal before the discount; defaults to 0 |
| `channels` | `pos` and/or `online`; at least one |
| `branch_scope` | `all` or `selected`; `selected` uses `store_promotion_branches` |
| `starts_at` | Required. When the promotion becomes usable |
| `ends_at` | Optional. When set, it must be after `starts_at`; the promotion stops at that instant |
| `usage_limit_total` | Optional cap on non-reversed redemptions across every code |
| `usage_limit_per_customer` | Optional; online only, keyed by the verified phone number |
| `visibility` | `private` (the customer must know the code) or `public` (listed at online checkout and in the POS picker) |
| `allow_offline` | Derived, never set directly: true only when there is no total or per-code cap; see §9.4 |
| `paused_at`, `archived_at` | Owner state. Nothing is ever hard-deleted once a code has been redeemed |
| `created_by`, `updated_by`, timestamps | Audit context |

**Derived status.** Status is computed on read, never stored, so it cannot drift:

| Status | Condition, in precedence order |
|---|---|
| `archived` | `archived_at` is set |
| `paused` | `paused_at` is set |
| `draft` | No active code exists yet |
| `used_up` | `usage_limit_total` reached |
| `expired` | `ends_at` ≤ now |
| `scheduled` | `starts_at` > now |
| `active` | Otherwise |

### 4.2 Code

| Field | Rule |
|---|---|
| `code` | Stored as typed for display; matched on `code_normalized` |
| `code_normalized` | Uppercase, trimmed; 3–20 characters of `A–Z`, `0–9`, and `-`; **unique per organization forever**, including archived codes, so the ledger is never ambiguous |
| `usage_limit` | Optional per-code cap, for example "first 50 Facebook customers" |
| `disabled_at` | Stops this code without affecting the others |
| `source_label` | Optional tag for tracking, for example "Facebook", "Flyer", or "Influencer: Ana" |

Suggested codes are generated from the name and year, for example `PASKO26` or `VDAY27`. The owner can edit them, and the form checks uniqueness while they type.

### 4.3 Redemption

| Field | Rule |
|---|---|
| `org_id`, `store_id`, `promotion_id`, `code_id` | Scope and linkage |
| `channel` | `pos` or `online` |
| `order_id` | POS `orders.id`. Set on POS sales and when an online order is completed at the POS |
| `online_order_id` | Set for online redemptions |
| `subtotal_centavos`, `discount_centavos` | Snapshot at redemption time; `discount_centavos` ≤ subtotal |
| `customer_phone_hash` | Online only; SHA-256 of the normalized verified phone, matching the `online_order_attempts` pattern, for per-customer caps |
| `cashier_id` | POS only |
| `status` | `applied`, `reversed` (void, refund, or online cancellation), or `needs_review` (offline replay broke a rule; §9.4) |
| `reversed_at`, `reversal_reason` | Set once; never cleared |
| `redeemed_at`, `created_at_device` | Server time and device time |

Only `applied` and `needs_review` redemptions count toward usage caps. A reversal frees the use; see §15 decision 4.

### 4.4 Discount calculation

One pure function is shared by the POS, the online preview, and the tests. It lives at `src/lib/promotions/evaluate.ts` and is mirrored exactly in SQL:

```
eligible_subtotal = item subtotal (delivery fee excluded)
if eligible_subtotal < min_subtotal           → not eligible ("Spend ₱X more to use this code")
raw = percent: round(eligible_subtotal × percent_off / 100)
      fixed:   amount_off
discount = min(raw, max_discount (if set), eligible_subtotal)
total    = eligible_subtotal − discount (+ delivery fee online)
VAT      = existing vatFromInclusiveTotal(total − delivery fee, rate)   // unchanged rule
```

Rounding uses half-up to the centavo, matching `discountAmount` in `pricing.ts` and the SQL `round()`. A shared fixture table of subtotal, rule, and expected discount runs in both the Node tests and the SQL smoke script, so the two implementations cannot diverge.

### 4.5 Interaction with existing discounts

- **One discount per order.** A promotion replaces None, Senior, PWD, or Custom, and vice versa.
- **Senior Citizen or PWD versus a promotion.** The customer gets the more beneficial one, not both. When a promotion is applied and the cashier switches to Senior or PWD, the modal compares the two amounts and suggests the higher. The Senior/PWD VAT exemption stays with the Senior/PWD choice only. **Owner and legal confirmation required** (§15 decision 1).
- **Admin PIN threshold.** It does not apply to promotions: the owner approved the offer when creating it. It still applies to Custom %.

## 5. Occasion templates

Templates are static data in `src/lib/promotions/templates.ts`, not database rows. Choosing one pre-fills the form; nothing is saved until the owner confirms. Dates resolve for the upcoming occurrence in Asia/Manila time.

| Template | Default window | Suggested offer | Suggested code |
|---|---|---|---|
| New Year | Dec 31 – Jan 2 | 10% off, ₱1,000 minimum | `NEWYEAR27` |
| Valentine's Day | Feb 13 – Feb 15 | ₱100 off, ₱800 minimum | `VDAY27` |
| Holy Week | Maundy Thursday – Easter Sunday (computed) | 10% off | `HOLYWEEK27` |
| Independence Day | Jun 12 | 12% off | `KALAYAAN27` |
| Mother's Day / Father's Day | 2nd Sunday of May / 3rd Sunday of June (computed) | 15% off, ₱300 cap | `NANAY27` / `TATAY27` |
| Ber months kickoff | Sep 1 – Sep 7 | 10% off | `BER26` |
| All Saints' / All Souls' | Oct 31 – Nov 2 | ₱150 off, ₱1,500 minimum | `UNDAS26` |
| Christmas (Pasko) | Dec 15 – Dec 26 | 15% off, ₱300 cap, ₱1,000 minimum | `PASKO26` |
| Payday weekend | The 15th and 30th of the month, plus the next day | 5% off | `PAYDAY` |
| Store anniversary | Owner picks a date; 3 days | 20% off, ₱500 cap | `ANNIV3` |
| Custom event | Owner picks | Owner picks | Generated from name |

Holiday dates are defaults, not a legal calendar: the owner can change every date. "Payday weekend" creates one promotion with a single window. Automatic recurrence is a later extension; §14 Phase 5 covers the calendar overlay, and **Duplicate** covers next month.

## 6. Owner workspace at `/admin/promotions`

The page keeps its URL and sidebar entry. It becomes four tabs selected by `?tab=`, following the `/admin/pos?tab=` pattern:

### 6.1 Overview (`?tab=overview`, default)

- **KPI cards:** Active promotions · Discount given (range) · Promo-driven orders and share of orders · Average order value with promo versus without.
- **Needs attention:** promotions expiring within 7 days, at 80% or more of their cap, used up, or with `needs_review` redemptions.
- **Top promotions** by redemptions and by net sales, with a channel split (POS versus Online).
- **Discount mix:** the existing Senior / PWD / Custom cards, plus Promo.
- **Daily discounts given:** the existing chart, stacked by type.
- Range selector: the existing 7d / 30d / all.

### 6.2 Promotions (`?tab=list`)

- **Header actions:** `New promotion` (primary) and `Start from a holiday` (opens the template picker).
- **Filters:** status chips (All, Active, Scheduled, Paused, Draft, Expired, Used up, Archived), channel (POS, Online), branch, occasion, and search by name or code.
- **Table columns:** Promotion (name + occasion icon) · Offer ("15% off · max ₱300 · min ₱1,000") · Channels · Branches · Schedule ("Dec 15 – Dec 26, 2026" or "No end date") · Codes (first code plus count) · Usage ("42 / 100" with a bar) · Status chip · row menu.
- **Row actions:** View · Edit · Pause/Resume · Duplicate · Add code · Copy code · Archive.
- **Responsive:** below 768px the table becomes cards. Tap targets are at least 44px, following [POS_ACCESSIBILITY_TABLET_CHECKLIST.md](POS_ACCESSIBILITY_TABLET_CHECKLIST.md).
- **Empty state:** a primary call to action plus the next three upcoming holiday templates, for example "Christmas is in 92 days. Set up a Pasko promo."

### 6.3 Create and edit flow

A single dialog with steps and a sticky live preview. It reuses the existing admin primitives: `AdminDialog`, `AdminMutationForm`, and the dialog-controller pattern from `ProductCreateDialog`.

1. **Occasion:** a template grid or "Custom", plus name, occasion, and description.
2. **Offer:** percent or fixed, the value, an optional cap, and an optional minimum spend. The live example updates as values change: "On a ₱1,200 order the customer saves ₱180 and pays ₱1,020."
3. **Where:** POS and/or Online store toggles, with a note when online ordering is disabled for a branch; All branches or selected branches; Public or Private visibility.
4. **When:** start date and time, then an end date and time or "No end date", both in Philippine time. The step warns when the end is in the past or the window overlaps another active promotion on the same channel and branch. Overlaps are allowed; only one discount applies per order.
5. **Codes and limits:** one generated code, editable, with **Add another code**, each with an optional source label and cap; total usage limit; per-customer limit (online). The step shows "Capped promotions only work while the till is online" when a cap is set.
6. **Review:** a plain-language summary, then **Save as draft** or **Save and schedule/activate**.

**Editing rules after the first redemption.** These keep history truthful:

| Field | Editable after the first redemption? |
|---|---|
| Name, description, occasion label, source labels | Yes |
| End date (extend or shorten), pause/resume | Yes |
| Usage limits | Raise yes. Lower only down to current usage |
| Add codes, disable codes | Yes |
| Channels and branches | Add yes. Remove yes, with a warning; not retroactive |
| Discount kind, value, cap, minimum spend, start date | **No.** The form offers **Duplicate with changes** instead |

### 6.4 Promotion detail (`?tab=list&promotion=<id>`)

A side panel or page section showing the offer summary, status timeline (created → scheduled → active → paused → expired), and a code table with per-code usage, source labels, a copy button, and a disable action. It also shows usage by branch and channel and the latest redemptions, with a link to the ledger filtered to this promotion.

### 6.5 Redemptions (`?tab=redemptions`)

- A ledger table: When · Order no. (opens the existing `OrderDialogController` receipt) · Promotion · Code · Channel · Branch · Cashier or masked customer ("Online · ••• 4030") · Subtotal · Discount · Status.
- **Filters:** date range, promotion, code, channel, branch, and status (`applied`, `reversed`, `needs_review`).
- **Needs review** rows get an "Acknowledge" action for admins. It writes an audit event and does not change the sale.
- **CSV export** through a route handler, matching `/admin/reports/export`.

### 6.6 Roles

| Action | Admin | Manager | Cashier |
|---|:--:|:--:|:--:|
| View workspace and ledger | ✅ | ✅ (read-only) | ⛔ (redirects to `/pos`, as today) |
| Create, edit, duplicate, archive | ✅ | ⛔ | ⛔ |
| Pause / resume | ✅ | ⛔ (§15 decision 6) | ⛔ |
| Apply a promotion to a sale | ✅ | ✅ | ✅ |
| Acknowledge `needs_review` | ✅ | ⛔ | ⛔ |

## 7. POS experience

- **Discount modal.** A fifth option, **Promo**, sits beside None, Senior, PWD, and Custom. It has two entry paths:
  - A **code field** with an uppercase keypad-friendly input and an Apply button.
  - **Available today** chips listing the public promotions active for this branch on the POS channel, for walk-in holiday offers that nobody has a code for.
- **Feedback.** The modal shows the promotion name, the computed discount, and the new total, or a specific reason it does not apply: "Minimum spend ₱1,000 (₱250 more)", "Starts Dec 15", "Expired Dec 26", "Not available at this branch", "Online-only code", "Usage limit reached", or "Needs connection (limited-use promotion)".
- **Cart changes.** The discount recalculates when the cart changes. If the cart drops below the minimum, the promotion is removed with a toast ("PASKO26 removed: spend ₱1,000 to use it") and never silently kept.
- **Held orders.** Parked orders keep the applied promotion. Eligibility is rechecked on resume.
- **Customer display.** It shows "PASKO26 · Pasko Sale −₱180" in the existing discount line.
- **Receipt.** The discount line reads `Promo PASKO26 (Pasko Sale 15%)`; `discount_ref` stores `PASKO26 · Pasko Sale`. X/Z shift readings break discounts down by type, including Promo.
- **Online pickup handoff.** When the cashier loads an online order that already has a promo, the POS locks the discount at the online order's `discount_amount` as a read-only "Online promo PASKO26" chip. It is not revalidated or counted again, because it was redeemed when the customer ordered. `complete_online_order` links the existing redemption to the POS `order_id`.
- **Audit.** The existing `discount.applied` audit event gains `promotion_id`, `code`, and `channel`.

## 8. Online store experience

- **Checkout.** Under the order total, a collapsed **Have a promo code?** row opens an input and Apply button. Public promotions valid for the branch, channel, and today are listed as tappable suggestions.
- **Preview.** Applying calls a rate-limited preview Server Action that wraps `preview_store_promotion_code` and returns eligibility, discount, and new totals. The totals block and the final **Review** panel gain a `Promo PASKO26  −₱180` row.
- **Error copy.** Codes that exist show specific reasons ("expired", "starts on", "minimum spend", "not available for delivery at this branch"). **Unknown codes** always get the generic "This code isn't valid", so random guessing reveals nothing.
- **Placing the order.** `p_promo_code` is passed to `place_online_order`, which revalidates and redeems atomically. If the code became invalid between preview and submit (expired, capped), the order is **not** placed. The customer sees "PASKO26 can no longer be used. Your total is ₱1,200" and can resubmit without the code. A customer is never charged a total they did not see.
- **Confirmation.** The confirmation page and status tracker show the discount and the final total due at pickup or delivery.
- **Cancellation.** A store or customer cancellation through `set_online_order_status` marks the redemption `reversed`, which frees the use.
- **Optional public banner (Phase 5).** When a public promotion is active for the menu's branch, the public menu can show a slim banner, for example "Pasko Sale: use PASKO26 for 15% off orders over ₱1,000". The owner can turn it on in the online-ordering editor.

## 9. Server enforcement

### 9.1 Schema

The migrations are split because `alter type … add value` must be committed before the new value is used:

**`0085_store_promotions_discount_type.sql`**

```sql
alter type discount_type add value if not exists 'promo';
```

**`0086_store_promotions.sql`** (outline)

- `store_promotions`: fields in §4.1, with check constraints mirroring platform_promotions (`0040`): kind-specific value presence, percent 0.01–100, amount ≥ 1, `ends_at > starts_at`, at least one channel, and `max_discount_centavos` only with `percent`.
- `store_promotion_branches (promotion_id, store_id)`: primary key on both columns; the store must belong to the same organization, enforced by a trigger.
- `store_promotion_codes`: `unique (org_id, code_normalized)`; format check `^[A-Z0-9-]{3,20}$`.
- `store_promotion_redemptions`: fields in §4.3. There is **no UPDATE grant** to `authenticated`; status changes only through SECURITY DEFINER functions. An append-only trigger allows only `applied → reversed` and `needs_review → reversed`, and blocks every other change and all deletes. It is modeled on the `no_mutate_audit` append-only trigger in `0002_rls.sql`, but permits that single status transition.
- `orders`: add `promotion_id`, `promotion_code_id`, both nullable foreign keys.
- `online_orders`: add `discount_amount bigint not null default 0`, `promotion_id`, `promotion_code_id`, and `promo_code_snapshot text`.
- **Indexes:**
  - `store_promotions (org_id, archived_at, starts_at, ends_at)`
  - `store_promotion_codes (org_id, code_normalized)`
  - `store_promotion_redemptions (promotion_id, status)`, `(code_id, status)`, `(org_id, redeemed_at desc)`, and `(promotion_id, customer_phone_hash) where channel = 'online'`
- `store_promotion_code_attempts`: `(store_id, ip_hash, created_at)` for online preview and brute-force limiting, following `online_order_attempts`. Neither table has a retention cleanup today, so add a bounded purge of rows older than 30 days for both.

### 9.2 RLS and grants

- `store_promotions`, `_branches`, `_codes`:
  - Admins: `ALL` within `auth_org_id()`.
  - Managers: `SELECT` within the organization.
  - Cashiers: `SELECT` limited to non-archived promotions that include the POS channel and cover `auth_store_id()`. This is what the POS caches.
  - Anonymous visitors: no access.
- `store_promotion_redemptions`: admins and managers get `SELECT` in their organization. No direct writes for anyone.
- Every write goes through audited SECURITY DEFINER RPCs:
  - `upsert_store_promotion`
  - `set_store_promotion_paused`
  - `archive_store_promotion`
  - `add_store_promotion_code`
  - `disable_store_promotion_code`
  - `acknowledge_store_promotion_redemption`

  Each checks `auth_is_admin()` and enforces the §6.3 edit-after-redemption rules in the database, not only in the UI.
- Register every new RPC in `scripts/rpc-contracts.test.ts` and apply the ACL normalization pattern from `0065`/`0083`. End the migration with a PostgREST reload, matching `0073`/`0075`.

### 9.3 Evaluation RPCs

- **`evaluate_store_promotion(p_org_id, p_store_id, p_channel, p_code, p_subtotal, p_at, p_phone_hash)`**: internal, not granted to clients. Returns `{eligible, reason, promotion_id, code_id, discount}` using the §4.4 rules, locking the promotion and code rows `for update` when called inside a redemption.
- **`preview_store_promotion_code(p_store_id, p_code, p_subtotal, p_channel)`**: two variants:
  - The `authenticated` variant is for the POS; its organization and store come from the profile.
  - The service-role variant is called only by the public menu Server Action. It takes a hashed client IP, is rate-limited per store and IP (for example 10 failed attempts per 15 minutes, then a cooldown), and returns the generic reason for unknown codes.
- **`list_available_store_promotions(p_store_id, p_channel)`**: public, active promotions for the picker and the online suggestions. It returns names, codes, and offer summaries only.

### 9.4 POS `place_order` changes

`place_order` gains a promo branch, applied when `p_order.discount_type = 'promo'`, with `promotion_code_id` and `created_at_device`.

1. The replay guard runs first, unchanged: an existing `local_uuid` returns the existing order, so replays never double-redeem.
2. Resolve the code within the order's organization and branch, lock it, and evaluate at **`created_at_device`**, clamped to server `now()` plus or minus 24 hours so a wrong tablet clock cannot backdate a sale into an expired promotion indefinitely.
3. Recompute the discount from the server-validated item subtotal. Accept a client discount within 1 centavo; otherwise use the server value.
4. **Online sale, rule fails:** raise an exception. The POS surfaces the reason and nothing is charged, because an online POS validates before taking payment.
5. **Offline replay, rule fails:** payment was already taken, so **never reject the sale.** Insert the order as recorded, write the redemption as `needs_review` with the reason (expired while offline, cap exceeded, promotion paused before the sale), and write a `promotion.redemption.needs_review` audit event. The owner sees it in the ledger and on the Overview.
6. Write the redemption (`applied`) and set `orders.promotion_id`/`promotion_code_id`.

**Offline eligibility on the tablet.** The offline profile caches branch-eligible promotions and codes, refreshed on each online load like `display_promotions`.
- **Uncapped promotions** (no total or per-code cap) can be applied offline using the cached rules, the device clock, and the cached `paused_at`/`archived_at`.
- **Capped promotions are blocked offline** with "Needs connection (limited-use promotion)", mirroring how above-threshold Custom discounts are blocked offline today. This prevents a cap from being oversold across disconnected tablets.

**Reversals.** The `0020` void and refund RPCs mark the original order's redemption `reversed`, setting `reversal_reason` to `void` or `refund`, in the same transaction.

### 9.5 Online `place_online_order` changes

- New optional parameter `p_promo_code text default null`. Keep the signature backward-compatible and register it in the RPC contract test.
- After the existing subtotal computation and minimum-order check, and before `v_total`:
  1. Evaluate with a lock at `now()`, using the `online` channel and the store.
  2. Enforce the per-customer cap using the verified phone hash.
- **Invalid:** raise a typed exception (`promo_code_invalid:<reason>`), which the Server Action maps to the §8 message. The failure is recorded in `store_promotion_code_attempts`.
- **Valid:**
  - `v_total = v_subtotal − discount + delivery_fee`.
  - `tax_amount` is computed on `v_subtotal − discount`.
  - Persist the discount, promotion, code, and snapshot on `online_orders`.
  - Insert the redemption (`applied`) in the same transaction.
- The duplicate-request early return also returns the stored discount fields.
- Concurrency: the per-store advisory lock already serializes placement per store, and the promotion row lock covers caps shared across stores.

### 9.6 Online-to-POS completion

`complete_online_order(p_online_order_id, p_pos_order_id)` sets `order_id` on the existing online redemption. The POS sale for a handed-off online order has `discount_type = 'promo'`, an amount equal to `online_orders.discount_amount`, and the same promotion and code IDs. `place_order` accepts it **without** re-evaluating when `online_order_id` points to an online order whose redemption is `applied` and whose amount matches.

## 10. Reporting

- `SalesDiscountType` in `sales-reports.ts` gains `promo`. The discount report adds a row per promotion (redemptions, discount, net sales) under Promo.
- **Promotions Overview metrics** (§6.1) are computed from redemptions joined to non-reversed orders, using the same `selectNetSales` reversal rule as `/admin/reports`.
- **Shift X/Z readings** list discount totals by type, including Promo.
- **Branch performance export** gains a promo discount column.
- **Existing typed unions to update in the same change** (a `promo` order must not crash these):
  - `src/app/admin/promotions/page.tsx`
  - `src/app/admin/orders/page.tsx`
  - `src/lib/admin/sales-reports.ts`
  - `src/lib/admin/order-receipts.ts`
  - `src/components/pos/OrderHistory.tsx`
  - `src/lib/pos/types.ts`
  - the offline order-number and drill scripts (`scripts/offline-drill-verify.sql` identity `subtotal − discount = total` still holds)

## 11. Audit events

| Event | Written by |
|---|---|
| `promotion.created`, `promotion.updated` (before/after), `promotion.paused`, `promotion.resumed`, `promotion.archived`, `promotion.duplicated` | Admin RPCs |
| `promotion.code.created`, `promotion.code.disabled` | Admin RPCs |
| `discount.applied` with `promotion_id`, `code`, `channel` | POS (existing event, extended) |
| `promotion.redeemed_online` | `place_online_order` |
| `promotion.redemption.reversed` | Void/refund/cancel RPCs |
| `promotion.redemption.needs_review`, `promotion.redemption.acknowledged` | `place_order` replay; admin acknowledge |

All events are written to the existing append-only `audit_logs` with organization, branch, and actor, and appear in `/admin/audit`.

## 12. Offline and caching

- **Offline profile.** `OfflineProfileSnapshot` gains `store_promotions?: CachedStorePromotion[]`, validated like `display_promotions`. It holds only POS-channel, branch-eligible, non-archived promotions with their codes.
- **Refresh.** The cache refreshes on every online POS load and at most every 5 minutes while online. Pausing a promotion takes effect on online tablets within that window and immediately server-side; offline tablets honor it from their last refresh, and replay flags later sales `needs_review`.
- **Held orders.** Parked orders store `promotion_code_id`; eligibility is rechecked on resume.
- **Service worker.** No change: promotions are data, not static assets.

## 13. Security and abuse controls

- **Code guessing.** Unknown-code responses are generic; failed attempts are rate-limited per store and IP hash, and repeated failures from the same phone are also limited at order placement. Codes need at least 3 characters, and the UI recommends 6 or more for private codes.
- **Tampering.** Every total is recomputed server-side, and client discount amounts are advisory only.
- **Enumeration.** `list_available_store_promotions` returns public promotions only. Private codes are never listed to anonymous visitors.
- **Privacy.** Only a phone hash is stored with redemptions. The ledger shows masked phone digits, taken from the online order the admin can already read.
- **Cross-organization isolation.** Tests cover a code from organization A not resolving in organization B, and a cashier in branch 1 not seeing branch-2-only promotions.
- **Money invariants.** Check constraints enforce `0 ≤ discount ≤ subtotal` on redemptions, `online_orders.total = subtotal − discount_amount + delivery_fee`, and the existing POS `subtotal − discount = total`.

## 14. Implementation phases

Each phase ends with typecheck, lint, build, targeted tests, docs updates ([SCHEMA.md](SCHEMA.md), [SETUP.md](SETUP.md), [tasks.md](tasks.md)), and its own commit or PR.

### Phase 0: Decisions and design approval

- [ ] Owner approves §15 decisions, especially 1 (Senior/PWD versus promo) and 3 (offline caps).
- [ ] Confirm the template list and default offers in §5.
- [ ] Review the create-flow wireframe and list layout against [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) and [UI_SPEC.md](UI_SPEC.md).

### Phase 1: Data model, evaluation, and RPCs

- [ ] `0085_store_promotions_discount_type.sql` and `0086_store_promotions.sql` (§9.1–9.3), with RLS, grants, the append-only trigger, and indexes.
- [ ] `src/lib/promotions/evaluate.ts`, `status.ts`, `codes.ts` (normalize, validate, suggest), and `templates.ts`.
- [ ] Shared evaluation fixture used by `scripts/store-promotions.test.ts` (`npm run test:promotions`) and `scripts/store-promotions-smoke.sql` (`npm run promotions:validate`, rollback-scoped).
- [ ] RPC contract registrations; `platform-schema-manifest` regeneration.
- [ ] Local migration apply, then RLS isolation tests (cross-organization, cross-branch, cashier read scope, anonymous denied).

### Phase 2: Owner workspace

- [ ] Tabs at `/admin/promotions`: Overview (existing analytics moved), Promotions list, and detail.
- [ ] Create/edit dialog with templates, live preview, code management, and the edit-after-redemption rules.
- [ ] Pause/resume, duplicate, archive, add or disable code, copy code.
- [ ] Redemptions ledger with filters and the CSV export route.
- [ ] Manager read-only enforcement; cashier redirect retained.
- [ ] Browser QA at 390px, 820px, and desktop; keyboard and screen-reader pass on the dialog.

### Phase 3: POS integration

- [ ] Promo option in `DiscountModal` (code entry, available-today chips, reasons).
- [ ] `pricing.ts` promo support; cart-change recalculation; held-order recheck.
- [ ] Offline cache of promotions; capped promotions blocked offline.
- [ ] `place_order` promo branch, including replay `needs_review` handling (§9.4).
- [ ] Receipt label, customer display line, X/Z discount-by-type breakdown.
- [ ] Void/refund marks the redemption reversed.
- [ ] Tests: online apply, below-minimum removal, offline uncapped apply plus replay, offline replay after expiry leads to `needs_review`, void reversal, idempotent replay not double-redeeming.

### Phase 4: Online store integration

- [ ] Checkout code field, suggestions, preview Server Action with rate limiting.
- [ ] `place_online_order` `p_promo_code` (§9.5); totals, confirmation, and tracker display.
- [ ] Cancellation reversal; online-to-POS locked discount and `complete_online_order` linkage (§9.6).
- [ ] Tests: per-customer cap, concurrent last-use race (two requests at cap 1 give exactly one redemption), invalid-at-submit leaves no order, generic unknown-code message, rate-limit cooldown, delivery fee not discounted, VAT on discounted subtotal.

### Phase 5: Reporting, alerts, and calendar

- [ ] `promo` in sales reports, discount report, branch performance export.
- [ ] Overview KPIs and needs-attention panel; dashboard expiring-soon card.
- [ ] Calendar read-only overlay of promotion windows.
- [ ] Optional public-menu promo banner toggle.

### Phase 6: Rollout

- [ ] Apply `0085` then `0086` to hosted Supabase; run `promotions:validate` against hosted (rollback-scoped).
- [ ] Authenticated owner QA: create a real draft, schedule it, redeem once at the POS and once online with a disposable order, void it, and confirm the ledger and reports.
- [ ] Offline drill including one uncapped promo sale.
- [ ] Record evidence in [tasks.md](tasks.md); update [SCHEMA.md](SCHEMA.md) (new section) and [SETUP.md](SETUP.md) (migrations).

## 15. Decisions to approve before implementation

| # | Decision | Recommendation |
|---|---|---|
| 1 | Senior Citizen / PWD discount versus a promotion on the same order | **No stacking. The customer gets the more beneficial of the two**, and the POS suggests the higher. Confirm against current RA 9994 / RA 10754 guidance before launch |
| 2 | Discount scope in v1 | **Whole-order subtotal only.** Product- and category-specific offers and Buy-X-Get-Y come later, using a `store_promotion_targets` table |
| 3 | Offline behavior | **Uncapped promotions work offline; capped promotions need a connection.** Offline replays that break a rule are kept and flagged `needs_review`, never rejected |
| 4 | Does a void, refund, or online cancellation free a use? | **Yes.** The redemption becomes `reversed` and stops counting toward caps |
| 5 | Editing an offer after it has been used | **Blocked for value, cap, minimum spend, and start date**; use Duplicate. Name, end date, limits, codes, and scope stay editable |
| 6 | Manager permissions | **Read-only** in v1. Revisit giving managers pause/resume after the pilot |
| 7 | Delivery fee and VAT | **The delivery fee is never discounted; VAT is computed on the discounted total**, consistent with the POS |
| 8 | Code uniqueness | **Unique per organization forever**, across branches and archived promotions |
| 9 | Messages for real but unusable codes | **Specific reasons** for existing codes; **generic** for unknown codes |
| 10 | Business timezone | **Asia/Manila** entry and display; stored as `timestamptz` |

## 16. Acceptance criteria

### Owner workflow
- [ ] An owner creates "Pasko Sale 2026" from the Christmas template in under 2 minutes, with the code `PASKO26`, 15% off with a ₱300 cap and ₱1,000 minimum, POS + Online, all branches, running Dec 15 00:00 to Dec 26 23:59.
- [ ] The promotion shows **Scheduled** before Dec 15, **Active** during the window, and **Expired** afterward, with no manual action.
- [ ] Pausing stops new redemptions on both channels immediately server-side.
- [ ] Every redemption appears in the ledger with order, channel, branch, discount, and status, and exports to CSV.
- [ ] Duplicate creates a draft with the same offer and next year's dates.

### Calculation
- [ ] 15% of ₱1,200 with a ₱300 cap gives ₱180; 15% of ₱2,500 gives ₱300 (capped); ₱900 below the ₱1,000 minimum is not eligible.
- [ ] A fixed ₱500 off a ₱400 order gives a ₱400 discount and a ₱0 total, never negative.
- [ ] Node and SQL evaluation agree on every shared fixture.

### Channels and scope
- [ ] A POS-only code is rejected online with a reason, and an online-only code is rejected at the POS.
- [ ] A code for branch A is rejected at branch B.
- [ ] Organization B cannot resolve, list, or read organization A's codes or redemptions.

### Limits and integrity
- [ ] With `usage_limit_total = 1`, two simultaneous online orders produce exactly one redemption; the other customer is told the code is used up and no order is created.
- [ ] Per-customer limit 1 blocks a second order from the same verified phone.
- [ ] Voiding a promo sale marks the redemption reversed and frees the use.
- [ ] Replaying the same offline sale twice creates one order and one redemption.
- [ ] An offline sale using a promotion that expired before sync is kept and flagged `needs_review`.
- [ ] A tampered client discount is corrected to the server value, or rejected on an online POS sale.

### UX
- [ ] The POS shows the promo name and discount on the cart, customer display, and receipt.
- [ ] Online checkout shows the discount in totals, the review panel, the confirmation, and the tracker.
- [ ] Pages and dialogs pass the 390px layout, keyboard, and tap-target checks.

## 17. Risks

| Risk | Mitigation |
|---|---|
| Owner creates an overly generous promo (for example 100% off, no cap) | Review step warns when the discount is over 50% or a percent offer has no cap; confirmation required |
| Clock drift on tablets | Evaluate at `created_at_device` clamped to ±24h; `needs_review` catches the rest |
| Enum `add value` migration ordering | Separate `0085` migration; the schema-drift page (`/platform/schema`) confirms both are applied |
| Senior/PWD compliance interpretation | Decision 1 requires explicit owner and legal confirmation before Phase 3 ships |
| Reports double-count promo discounts on reversed sales | Reuse `loadReversedOrderIds` / `selectNetSales`; covered by a reversal test |
| Confusion with customer-display or platform "promotions" | `store_promotion` naming; UI tooltips link display cards and discount promotions separately |
