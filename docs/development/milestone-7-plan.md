# Milestone 7 — Scanning + Receipt Intelligence: Implementation Plan

No code written yet. This is the plan for approval.

## 1. Current architecture findings

**Scan tab** (`src/features/scan/screens/scan-screen.tsx`): two `PrimaryButton`s ("Scan receipt", "Scan barcode") with icons, no `onPress` handlers — purely a placeholder. No camera package is installed at all (`expo-camera`, `expo-image-picker`, `expo-image-manipulator` are all absent from `package.json`). This is a clean slate, not a retrofit.

**Kitchen** (`src/features/kitchen/`): `InventoryItem` has `category`, `location` (pantry/fridge/freezer), `status` (in_stock/low/out), optional `quantity`/`unit`, optional `expiration` (`{date, confidence: 'exact'|'estimated'}`), `ownership` (shared/personal) + `ownerId`. Writes are plain RLS CRUD (checkpoint D's pattern — no RPCs, any household member can insert/update/delete directly), unlike Money/Tasks. `types.ts` literally has a comment anticipating this: *"Designed so a future receipt/barcode scan pipeline can create and update these same records through the same store actions... no redesign needed, just a new caller."* Kitchen's existing `ItemSheet` (`FullScreenForm`-based) is the right shape to reuse/mirror for the barcode confirmation sheet, just condensed.

**Money** (`src/features/money/`): `money-math.ts` is pure, dependency-free, already tested (`splitEqualCents` does remainder-safe equal division — first N participants by order get the extra cent, e.g. $10.00÷3 → $3.34/$3.33/$3.33). `Expense` stores `shares: ParticipantShare[]` resolved at save time (immutable history). Writes go through `SECURITY DEFINER` RPCs (`create_expense`, etc.) — parent+shares insert atomically, with a **deferred constraint trigger already enforcing `sum(shares) === amount_cents` at transaction commit**. `ExpenseCategory` already includes `'groceries'` — no schema change needed there. The balance engine already correctly nets a payer's own share against what they paid (confirmed by reading `balances.ts` — no special-casing needed for receipts).

**Household members**: `household_members.id` (not raw `profiles.id`) is the identity every domain table references, via composite FK `(member_id, household_id) → household_members(id, household_id)`. This is non-negotiable precedent — any new table touching members follows it.

**Migrations/RLS**: two established patterns coexist deliberately: Kitchen's "plain shared RLS CRUD" for low-stakes single-row edits, and Tasks/Money's "SELECT-only RLS + `SECURITY DEFINER` RPC for every write, RPC self-checks membership, `search_path=''`, revoke-from-public + grant-to-authenticated" for anything with cross-row atomicity requirements. Every array-like relationship (chore rotation, bill participants) is a **relational child table, never a `uuid[]` column** — established 3× already, I'll follow it again.

**TanStack Query**: per-feature `query-keys.ts` factories, `staleTime: 60s`, prefix-based invalidation (`['kitchen']` matches everything under it). Realtime (`use-household-realtime-sync.ts`) subscribes to a fixed table list per household and invalidates by domain prefix on any change — **new Kitchen/Money rows created by a receipt confirmation are automatically covered by this with zero new realtime code**, since they land in the same `inventory_items`/`expenses`/`expense_shares` tables already watched.

**`FullScreenForm`**: a plain RN `Modal` (not an Expo Router route) with a fixed Cancel/Title/Save header and scrollable body. Good fit for the barcode confirmation sheet (single form, single save action). A poor fit for Receipt Review (dynamic N-item list, per-row interactions, sticky running-total footer) — I'll propose a sibling component with matching header chrome instead of forcing it into `FullScreenForm`'s API.

**Environment/secrets**: `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` only — correctly, nothing secret ships to the client today. No `supabase/functions/` directory exists yet — Edge Functions are new infrastructure for this app.

## 2. Recommended barcode provider + fallback

**Primary: Open Food Facts.** Free, no API key, no request cap beyond a courtesy rate limit (~15 req/min/IP — trivial at beta scale), grocery-specific fields (`product_name`, `brands`, `categories`, `image_front_url`), and its ODbL/CC-BY-SA licensing explicitly permits app use with attribution (I'll add a one-line credit somewhere unobtrusive, e.g. account/about). Coverage is strongest in Europe and decent-not-great for US store brands.

**Fallback: UPCitemdb.com free tier** (100 requests/day, no signup) for the US retail/CPG items Open Food Facts misses. No cost, no integration complexity, and the volume ceiling is a non-issue once caching is in place (see below).

**Rejected**: Go-UPC and Barcode Lookup have no usable free tier at beta scale ($75–$99/mo minimums); Nutritionix killed its free tier; Spoonacular's UPC endpoint shares a small quota with all its other endpoints.

**Abstraction**: a single `lookupProduct(barcode)` function tries, in order: (1) our own Supabase `products` cache table, (2) Open Food Facts, (3) UPCitemdb, (4) `null` (unknown). Each provider is a small isolated module (`providers/open-food-facts.ts`, `providers/upcitemdb.ts`) behind one shared interface, so swapping/adding a provider later never touches calling code.

**Caching — yes, and it's two different things, not one**:
- `products` (global, no `household_id`): barcode → `{name, brand, category, image_url, source}`. Shared across every household — barcode identity is universal, not private. Any successful external lookup gets written here so no other household (or repeat scan) ever re-hits the external API for that barcode.
- `household_product_memory` (household-scoped, RLS-isolated): *this* household's previously-used name/category/location/ownership defaults **and** remembered member-assignments for a product — this is what section 1's "prefer the household's previous choices" and section 10's "remembered assignments" both actually need, and it's a different concern from the global cache (two households can both buy "GV 2% Milk" and cache the same global product row, while assigning it to completely different people).

**Unknown barcode**: immediately show the lightweight manual-name entry (same compact sheet, just empty instead of prefilled), save with the scanned barcode attached to the new inventory item and to a `products` row with `source: 'manual'` — so the household's own manual entry is what's remembered next time, no external lookup ever needed for that barcode again for anyone.

## 3. Recommended receipt OCR/AI architecture

```
phone (compress+resize image client-side)
  → supabase.functions.invoke('process-receipt', { image, householdId })
  → Edge Function: verify caller is a member of householdId
  → Edge Function: call Claude (vision, forced JSON schema via tool use)
  → Edge Function: validate structured result (types, integer cents, sane ranges)
  → Edge Function: insert `receipt_imports` row (status: ready_for_review), service-role client
  → Edge Function: return validated JSON + receipt_imports.id to the app
  → Receipt Review screen (client-held state until Confirm)
```

Single synchronous request/response — no polling, no background-job infrastructure. A Claude vision call for one receipt-sized image is typically a few seconds, which fits comfortably in Edge Functions' request budget and matches the "Processing receipt…" UI section 26 asks for without needing async status machinery.

## 4. AI/model recommendation

**Claude (Sonnet), vision input + forced structured JSON output, called from the Edge Function.** Reasoning:

- Collapses OCR *and* the "ORG BNLS CHK BRST → Chicken Breast" name-cleanup step into one prompt/one call — every dedicated OCR vendor I evaluated (Veryfi, Taggun, Mindee, Google Document AI's Expense Parser) only extracts raw line items and would still need a second LLM pass for cleanup, which mostly erases their advantage.
- Cost fits easily: roughly $0.005–$0.02/receipt at Sonnet pricing, trivial at beta volume (dozens–low hundreds/month).
- Veryfi's $500/mo minimum and Taggun's opaque sales-gated pricing are non-starters at this scale; Google Document AI is cheap per-call but has no grocery-item-name intelligence at all.
- Structured outputs (or tool-use with a forced tool choice) reliably produce schema-valid JSON — this is what makes "don't trust free-form AI text" (section 5) actually enforceable.
- GPT-4o is a legitimate, comparably-priced alternative if you'd rather standardize on OpenAI for some other reason — I have no strong reason to prefer one over the other technically, and picked Claude mainly for architectural simplicity of one vendor/one API shape. Happy to swap if you have a preference.

## 5. Receipt image storage/retention

**Recommend Option B — never store the image at all.** The client compresses/resizes the photo (target ~0.8 JPEG quality, longest edge ~2000px, likely 200–600KB), sends it inline in the Edge Function request body, the function holds it in memory for the single Claude call, and it's gone the moment the function returns. No Supabase Storage bucket, no upload step, no signed URLs, no cleanup cron job, no orphaned-object risk — an entire category of infrastructure and privacy surface simply doesn't exist.

This directly matches your stated preference (no retention unless there's a clear product reason, and there isn't one for v1 — nobody has asked to re-view the original receipt photo). One risk to flag honestly: I couldn't find a hard documented request-body-size ceiling for Supabase Edge Functions in my research. Client-side compression should keep payloads small enough that this is a non-issue, but it's worth confirming empirically in checkpoint E with a real receipt photo before building further on top. If it ever becomes a real constraint, Option A (temporary private-bucket upload, Edge Function fetches + immediately deletes) is the documented fallback — I'm just not building that infrastructure speculatively.

## 6. Database additions (smallest useful set — 4 tables)

1. **`products`** (global, no `household_id`) — barcode cache. `barcode` (PK text), `name`, `brand`, `category`, `image_url`, `source` (`open_food_facts`/`upcitemdb`/`manual`), timestamps. RLS: any authenticated user can SELECT/INSERT/UPDATE (upsert) — low-stakes shared reference data, no per-household isolation needed by definition.

2. **`household_product_memory`** (household-scoped) — `id`, `household_id`, `product_key` (barcode, or normalized lowercased cleaned name when no barcode), `barcode` (nullable), `preferred_name`, `category`, `storage_location`, `default_ownership`, `default_owner_household_member_id` (composite FK), unique `(household_id, product_key)`.

3. **`household_product_memory_assignees`** (child table, not an array — matching the established chore-rotation/bill-participant precedent) — `memory_id`, `household_member_id` composite-FK'd to `household_members`. This is "who we last split this product's cost between."

4. **`receipt_imports`** (household-scoped) — `id`, `household_id`, `uploaded_by_household_member_id`, `status` (`ready_for_review`/`confirmed`/`failed`), `merchant_name`, `purchase_date`, `subtotal_cents`, `tax_cents`, `total_cents`, `raw_model_response` (jsonb, trimmed — debug/diagnosis only), `linked_expense_id` (nullable), `confirmed_at`, `created_at`.

**Deliberately not building**: a `receipt_items` table. Parsed line items only need to exist as client-held state during the review session (they came back synchronously from the Edge Function call); once confirmed, the *outputs* that matter (expense_shares, inventory_items, product_memory) are what gets persisted, in their own proper domain tables. Keeping raw AI output out of the primary data model was an explicit ask (section 29) and this is how I'd honor it — `raw_model_response` on `receipt_imports` covers "enough to diagnose a bad parse" without a parallel item-tracking schema to maintain.

## 7. RLS/security model

- `products`: open shared read/write as above (see #6).
- `household_product_memory` (+ assignees): standard household-member RLS for SELECT; barcode-flow writes are plain RLS upserts (mirrors Kitchen's existing pattern — low stakes, single-row); receipt-flow writes happen *inside* `confirm_receipt` (see #15) since they're part of one atomic transaction, not a standalone client write.
- `receipt_imports`: SELECT for household members; **no client-facing INSERT policy at all** — the Edge Function creates the row itself via a service-role client, after it has already independently verified the caller's household membership. This mirrors Tasks/Money's "no write RLS, server-controlled only" pattern.
- Every new table referencing a member uses the composite FK `(member_id, household_id) → household_members(id, household_id)` convention, no exceptions.

## 8. Edge Function architecture

One function: `process-receipt`.

- **Deploy**: `supabase functions deploy process-receipt`.
- **Secrets**: `supabase secrets set ANTHROPIC_API_KEY=...` (dashboard or CLI) — read at runtime via `Deno.env.get('ANTHROPIC_API_KEY')`. Never in `.env`, never `EXPO_PUBLIC_*`, never in the repo.
- **Auth**: `verify_jwt` stays on (default) — Supabase's gateway rejects unauthenticated calls before the function even runs. Inside the function, build an RLS-respecting client from the caller's forwarded `Authorization` header, call `auth.getUser()`, then query `household_members` to confirm the caller actually belongs to the `householdId` in the request body — reject with 403 otherwise. Only *then* does it spend money calling Claude.
- **Write path**: after a successful, validated parse, the function switches to a **service-role** client (bypassing RLS, since it already did its own membership check) to insert the `receipt_imports` row, then returns the parsed JSON + that row's id to the app.
- **Cost/abuse guard**: a simple `count(*)` of this household's `receipt_imports` created in the last 24h, rejected with a friendly message past a generous threshold (e.g. 30/day). Not real rate-limiting infrastructure — a single cheap query, appropriate for beta scale, that stops a runaway bug or accidental spam-tapping from generating an AI bill.
- **Client-side guard**: disable the "Scan Receipt" trigger while a request is in flight (trivial, prevents double-submission of the same photo).

## 9. Receipt structured-output schema

Matches your section 5 spec essentially as-is; the Edge Function validates every field server-side before returning it (type-checked, integer-cents-checked, non-negative-checked) — a malformed or out-of-range value from the model is rejected/flagged, never passed through as trusted data. I'd hand-roll this validator as a small pure TypeScript function (no new dependency) so it can also be imported directly into a Node test file with fixture JSON (see #20) without paying for a live Claude call in tests.

```ts
type Receipt = {
  merchantName?: string;
  purchaseDate?: string; // ISO yyyy-mm-dd
  subtotalCents?: number;
  taxCents?: number;
  totalCents: number; // required, integer, > 0
  discountCents?: number;
  items: ReceiptItem[];
  warnings?: string[];
};

type ReceiptItem = {
  rawText: string;
  cleanedName: string;
  quantity?: number;
  unitPriceCents?: number;
  totalPriceCents: number; // required, integer, >= 0
  category?: string;
  isLikelyFood?: boolean; // drives the Add-to-Kitchen default, see #11
  barcode?: string;
  confidence?: number; // 0-1
};
```

## 10. Reconciliation algorithm

Deterministic, integer-cent-only, using the **largest remainder method** (the same well-defined proportional-allocation approach `splitEqualCents` already uses for equal splits, generalized to weighted shares):

1. `itemsSubtotal = Σ(included item totalPriceCents)`.
2. Per item, equal-split its `totalPriceCents` across its assigned members via the **existing** `splitEqualCents` — no new equal-split logic, this function is reused as-is.
3. Accumulate each member's pre-tax, pre-discount subtotal across all items.
4. Reconcile `itemsSubtotal` against the receipt's printed subtotal (if present); if off by more than a trivial tolerance, surface the discrepancy in the review UI and block Confirm until the user fixes an item price or the subtotal — never silently absorb the difference.
5. **Discounts**: item-level discounts are simplest — just net them into that item's `totalPriceCents` before step 1/2 (no separate math). A receipt-level discount (not tied to one line) is allocated proportionally across each member's pre-tax subtotal share via largest-remainder allocation.
6. **Tax**: allocated proportionally to each member's pre-tax, post-discount share, also via largest-remainder allocation — matching your stated preferred rule exactly. Remainder cents go to whichever members have the largest fractional remainder first, ties broken by a stable member-id ordering (same determinism principle already used everywhere else in this codebase).
7. `finalMemberShare = pretaxItemShare − allocatedDiscount + allocatedTax`. The sum of every member's final share is asserted to equal `totalCents` exactly before Confirm is enabled, both client-side (immediate feedback) and server-side — where it gets that guarantee **for free** from the existing `expenses_amount_shares_check` deferred trigger, since `confirm_receipt` ultimately hands these resolved shares to the same insert path `create_expense` already uses.
8. Payer's own share needs no special handling — confirmed by reading `balances.ts`, the existing engine already nets a payer's share against what they paid; receipts don't change that.

## 11. Item-level member-allocation + default-assignment model

Allocation model is exactly as specified (section 8) — equal split among only the selected members per item, no weights, no custom-per-item dollar amounts. Reuses `splitEqualCents` unchanged.

**Default rule for a new product with no history: default to Everyone.** Not category-based inference. Reasoning: ease-of-use was explicitly prioritized over perfect inference, and "default to shared, let people narrow down the personal exceptions" is a safer failure mode than guessing wrong on personal-vs-shared (a wrong "shared" default is corrected by unchecking a couple of names; a wrong "personal" default silently omits people who should be paying, which is the worse kind of mistake to default into). Category-smart defaults (e.g. auto-excluding everyone for obviously personal items) are a reasonable v2 idea, not needed for v1.

**When history exists** (section 10): if `household_product_memory` has a remembered assignee set for this product (matched by barcode first, else normalized cleaned name), suggest that set instead of Everyone. Always overridable, never locked. This is genuinely simple — no ML, just a keyed lookup table updated on every confirmed receipt.

## 12. Barcode inventory-add flow

Open Scan → Scan Barcode → `CameraView` live-decodes → lookup (cache → Open Food Facts → UPCitemdb → unknown) → compact confirmation sheet (new component, small sibling of `ItemSheet`, not the full form) prefilled with: cleaned name, category, storage location, ownership — pulling from `household_product_memory` first if this household has scanned it before, else from the global `products` cache, else empty for manual entry. One tap to add. Unknown barcode skips straight to the same compact sheet with just a name field. Either path writes the barcode onto the new `inventory_items` row (schema note: this needs a nullable `barcode` column added to `inventory_items` — the only touch to an existing table this milestone needs) and upserts `household_product_memory` with whatever the user confirmed, so the next scan of that barcode in this household needs zero taps beyond confirm.

## 13. Receipt review UX

A dedicated full-screen component (new, not `FullScreenForm` — its single-title/single-save API doesn't fit a dynamic list well, but I'll mirror its header chrome for visual consistency: Cancel top-left, title center).

Per-row layout: cleaned name (tap to rename inline) with raw OCR text shown small/muted only when confidence is low or on demand (not by default — avoids clutter); price (tap to correct); a compact assignment row of small initials chips (reusing the existing `getMemberInitials` helper) plus a leading "Everyone" chip that selects/deselects the whole household in one tap — all inline, no per-item modal; an "Add to Kitchen" toggle; a remove action for bad parsed lines.

Sticky footer: running total, a reconcile-status line ("Reconciles" or "$0.34 off — tap to fix"), and a big "Confirm Receipt — $84.12" button, disabled until reconciled and every included item has at least one assignee.

## 14. Receipt-confirmation transaction/idempotency design

One `SECURITY DEFINER` RPC, `confirm_receipt`, taking the receipt import id, payer, final per-item state (name/price/category/barcode/add-to-kitchen/assignee-ids), and the resolved discount/tax figures. Inside one transaction: lock + validate the `receipt_imports` row (household matches caller, `status = 'ready_for_review'`), insert the expense + shares (same pattern as `create_expense`, same deferred sum-check trigger enforcing correctness), find-or-restore-or-create each Add-to-Kitchen item in `inventory_items`, upsert `household_product_memory` (+ assignees) per item, then flip `receipt_imports.status = 'confirmed'` with the linked expense id. If any step fails, the whole transaction rolls back — no half-imported receipt is possible by construction, not by client discipline.

**Idempotency**: identical mechanism to `mark_bill_paid`'s already-proven double-tap guard — the row lock + status check means calling `confirm_receipt` twice (accidental double-tap, or a retried network call) is a safe no-op on the second call, returning the already-created expense id rather than erroring or duplicating anything.

**Duplicate-receipt detection** (a *different* receipt, same purchase, scanned twice on separate occasions): a soft warning, not a block — if `confirm_receipt`'s pre-check finds another `confirmed` receipt in this household with matching merchant/date/total, surface "This looks like one you already added on [date] — continue anyway?" and let the user decide. Never hard-block on a heuristic, per your explicit instruction.

## 15. Kitchen-import behavior

For each Add-to-Kitchen item: look up existing inventory by barcode (preferred) or normalized name within the household. If found with `status = 'out'`, restore it to `in_stock` (never a duplicate row — matches the existing Out≠Delete model exactly). If found `in_stock`/`low`, update status/quantity sensibly rather than duplicating. If not found, create a new row using the parsed/cleaned name, inferred category, and a simple category→location default table (produce/dairy/meat/frozen map obviously; ambiguous categories default to pantry) — with ownership always defaulting to `shared` for receipt-imported items (receipts only carry *consumer* assignment for money purposes, not inventory ownership; a user can flip that later via the existing `ItemSheet` if they want it marked personal). All of this executes inside `confirm_receipt`, calling into the same tables Kitchen already owns — no duplicated business logic, per your explicit instruction.

## 16. Money integration

Exactly one `expenses` row per confirmed receipt — never one per line item. `description` = merchant name (or "Receipt — <date>" if unavailable), `category = 'groceries'` (already exists, no schema change), `amountCents = totalCents`, `date` = parsed purchase date (or today), `shares` = the fully reconciled per-member allocation from #10. The existing balance engine, activity feed, and Money screen need **zero changes** — they already just read `expenses`/`expense_shares`.

## 17. Cost control

- One Claude call per receipt, full stop — no retry-with-a-different-prompt loop, no re-parsing on review-screen re-entry (the parsed result is held in client state / the `receipt_imports` row, not re-fetched from Claude).
- Client-side image compression (quality ~0.8, longest edge ~2000px via `expo-image-manipulator`) before upload — smaller payload, faster call, cheaper input tokens.
- All deterministic math (splitting, tax/discount allocation, balance calculation) is plain TypeScript — Claude is used exclusively for the visual/text understanding and name-cleanup step, never for anything a formula can do.
- Editing assignments/prices on the review screen never re-invokes the Edge Function — it's all local state until Confirm.
- The per-household daily count guard (#8) is a cost backstop, not a feature.

## 18. Error/retry behavior

**Barcode**: permission denied → explain + deep-link to Settings (same pattern as any RN permission flow). Invalid/unreadable barcode → just keep scanning, no error needed. Unknown barcode → straight to manual-entry sheet, framed as normal, not a failure. Lookup network failure → cache-miss sheet with manual entry, no raw fetch error ever shown. All third-party errors are caught and mapped to plain language, never surfaced raw — consistent with the `mapAuthError`/`getErrorMessage` pattern already established this milestone.

**Receipt**: permission denied → same pattern as barcode. Blurry/unreadable image → Claude's own `warnings`/low-`confidence` output drives a "this didn't parse well, retake or edit manually" prompt rather than a hard failure — the review screen still opens with whatever was extracted, editable. AI/OCR failure or timeout → a plain "Couldn't process that receipt — try again or enter it manually" with a retry button (re-invokes the function with the same already-compressed image still in memory, no re-photograph needed) and a manual-entry escape hatch (opens the review screen empty, same UI, just nothing prefilled). Total mismatch → the reconcile-status line in the footer, Confirm stays disabled until fixed, never a silent write. Network/server timeout → same mapped-message treatment as everywhere else in the app.

## 19. Testing strategy

New pure module `src/features/scan/receipt-math.ts` (mirrors `money-math.ts`'s zero-dependency, Node-test-runner-friendly style), covering exactly your list: one item/one person, one item/two people, Everyone split, several items with different member sets, odd-cent division, proportional tax allocation, tax remainder distribution, receipt-level discount allocation, final household shares summing exactly to the receipt total, and confirming (by reusing the existing balances test fixtures) that a payer's own share still nets to zero self-debt.

The structured-output **validator** (see #9) is also a plain, dependency-free function — testable with fixture JSON (well-formed and deliberately-malformed receipt payloads) in the Node test runner, with zero live AI calls. This is the "keep AI/OCR tests separate from financial-math tests" split you asked for: one test file exercises `receipt-math.ts` (pure numbers), a second exercises the validator against fixtures (pure parsing/rejection logic), and neither touches the network.

DB-level behavior (find-or-restore-inventory, product-memory upsert, `confirm_receipt` idempotency, duplicate detection) gets the same embedded-postgres harness treatment already used for Kitchen/Tasks/Money — extending an established, proven pattern rather than inventing a new one.

## 20. Implementation checkpoints

I'd adjust your proposed A–J slightly — mainly pulling the barcode "memory" step forward so barcode ships as a fully complete, demoable feature before any receipt work starts, and splitting your F/G so the math module has its own tested checkpoint before it's wired into UI:

- **A — Camera/scanning foundation.** Install `expo-camera`, `expo-image-picker`, `expo-image-manipulator`; permission config in `app.json`; wire Scan tab's two buttons to real (if minimal) screens. Purely additive, app stays runnable, no backend touched.
- **B — Barcode lookup + global cache.** `products` migration + RLS; provider abstraction (Open Food Facts → UPCitemdb → unknown); barcode column on `inventory_items`; compact confirm-and-add sheet. Barcode flow is now demoable end to end (minus household memory).
- **C — Household product memory.** `household_product_memory` (+ assignees) migration; wire into the barcode flow so a second scan of a known product needs zero re-entry. Barcode workflow fully complete here — a good place to pause and use it for real before starting receipts.
- **D — Receipt capture UI.** Photograph/retake flow only, image held and compressed client-side, nothing sent anywhere yet.
- **E — `process-receipt` Edge Function.** Deploy, secrets, membership check, Claude call, validator, `receipt_imports` migration + RLS. Verify against real photographed receipts before building any UI on top — highest-novelty, highest-value-to-isolate checkpoint.
- **F — `receipt-math.ts` + tests.** Pure reconciliation/tax/discount module, test-first, no UI dependency.
- **G — Receipt Review screen.** Full UX wired to real Edge Function output and the real math module; local state only, nothing persisted yet.
- **H — `confirm_receipt` RPC + Money/Kitchen integration.** The atomic commit; wire the Confirm button to it.
- **I — Duplicate-warning polish, two-device realtime confirmation (should need zero new realtime code — verify that assumption), cost/security review, end-to-end pass.**

Each checkpoint keeps the app runnable and gets committed on its own, same discipline as Milestone 6.

## 21. Packages/services/accounts needed

- **New npm packages**: `expo-camera`, `expo-image-picker`, `expo-image-manipulator`. No new client package for barcode lookup (plain `fetch`).
- **New account**: an Anthropic API account/key (console.anthropic.com) with billing enabled — the one genuinely new external dependency this milestone introduces.
- **No new account needed** for Open Food Facts (fully open). UPCitemdb's free tier claims no signup requirement — worth a quick confirmation at build time in case that's changed.
- Supabase CLI is already installed/linked from Milestone 6 — reused for `functions deploy`/`secrets set`.

## 22. Manual setup required from you

1. Create an Anthropic API key and enable billing.
2. I'll deploy the function and you'll need to run one `supabase secrets set ANTHROPIC_API_KEY=...` (or I can talk you through the dashboard equivalent) — I won't have your key, so this step is yours.
3. Grant camera permission on your test device(s) when the OS prompts — no dashboard step.
4. That's it — no Storage bucket, no webhook, no third-party dashboard config beyond the Anthropic key.

## 23. Privacy/security risks

- Receipt images reveal purchase history; mitigated by never persisting them (#5) — the image exists only in an Edge Function's memory for one call.
- The image content is sent to Anthropic per their API data-use terms — worth a one-line disclosure somewhere in-app (e.g. Account screen), and I'd have the Claude prompt explicitly instruct the model to ignore/never extract any visible payment-card digits or loyalty-account numbers as a light extra safeguard, even though it isn't asked to extract them.
- `products` is intentionally global/unauthenticated-by-household — that's correct, not a leak (barcode→product identity isn't private data), but worth stating explicitly so it's never "fixed" into household-scoped by mistake later.
- `household_product_memory` reveals a household's own consumption patterns to its own members only — standard RLS isolation, same guarantee as everything else in this app.
- The Edge Function independently re-verifies household membership server-side before spending any AI budget — a client can't spoof another household's context.

## 24. What I'd simplify for the beta

- No receipt-history browsing screen — `receipt_imports` existing in the DB is enough; a UI for it is a clean fast-follow, not needed now.
- No multi-page receipt support — one photo, full stop, exactly as you allowed.
- No product-image rendering in the barcode confirm sheet in v1, even though the schema stores `image_url` when available — low value for the taps it costs, easy to add later.
- No category-based smart default-assignment inference — Everyone-default + remembered-history is enough (#11).
- No dedicated rate-limiting infrastructure — one cheap per-household daily count check is proportionate at this scale.
- No Storage bucket, no image retention, no cleanup cron — Option B removes this whole category of work outright.
- No `receipt_items` database table — client-held state during review is sufficient; only the confirmed *outputs* get persisted, in their proper existing domains.

---

Waiting for your approval before writing any code.
