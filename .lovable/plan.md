# Al Rayyan Real Estate Investment — Platform Upgrade Plan

## What this builds

Upgrades the existing project into **Al Rayyan Real Estate Investment** (الريان للاستثمار العقاري), adding a financial ledger, deposit/withdrawal workflows, referral system, enhanced admin dashboard, public landing page, legal pages, and strict test/production separation — without rebuilding anything from scratch.

All real-money operations remain **disabled by default**. A production activation checklist in the admin panel lists every prerequisite that must be verified before going live.

---

## Phase 1 — Branding & Public Landing Page

**Rename throughout:** App name → "Al Rayyan" / "الريان للاستثمار العقاري"
- Update `APP_NAME` in `src/lib/config.ts`, all `head()` titles, logo text, i18n strings

**Redesign `src/routes/index.tsx`:**
- Hero section with name + tagline in Arabic/English
- Featured real estate projects loaded from the database (public read)
- Investment process explainer (4 steps: Register → Browse → Invest → Track)
- Hypothetical income calculator — enter amount, pick project, see estimated return
- Prominent disclaimer: returns are **not guaranteed**; estimates are based on stated assumptions only
- FAQ accordion (platform, fees, risks, withdrawal conditions)
- Links to Terms, Privacy Policy, Risk Disclosure static pages
- Registration / Login CTAs
- No fabricated regulatory badges, license numbers, or guaranteed return figures

**New static pages:** `/terms`, `/privacy`, `/risk`
- Each clearly labelled as a placeholder requiring legal review before production
- Honest language: no guaranteed returns, no fabricated regulatory approvals

---

## Phase 2 — Database Schema

New tables added via migration (existing tables unchanged):

| Table | Purpose |
|---|---|
| `ledger_accounts` | One row per user: `available`, `reserved`, `invested` balances (NUMERIC(20,8)); `is_test` flag |
| `ledger_entries` | Append-only transaction log — no UPDATE/DELETE policy; trigger blocks modifications |
| `deposit_requests` | Deposit records; `tx_hash + network` UNIQUE to prevent double-credit |
| `withdrawal_requests` | Withdrawal requests with atomic fund reservation and approval workflow |
| `referrals` | Who referred whom (no self-referrals enforced in DB function) |
| `referral_commissions` | Commission per qualifying investment; one per referred user max |
| `audit_log` | Admin/system action log — actor, timestamp, action, outcome, ref |
| `platform_config` | Key/value: `deposits_enabled`, `withdrawals_enabled`, `operating_mode` (test/production), `commission_rate_pct`, `usdt_trc20_address`, `production_checklist` |

**Safety constraints:**
- `ledger_entries` blocked from client writes by RLS (no insert policy for users, only via SECURITY DEFINER functions)
- `deposit_requests.tx_hash + network` UNIQUE constraint
- `platform_config` admin-write only
- Test and production ledger entries are separated by `is_test` flag — they can never be mixed

---

## Phase 3 — Financial Engine (Server Functions + SQL Functions)

**New SQL functions (SECURITY DEFINER, server-side only):**
- `credit_ledger(_user_id, _amount, _type, _ref, _is_test)` — appends entry + updates account atomically
- `reserve_funds(_user_id, _amount, _ref)` — moves available → reserved atomically
- `release_reserved(_user_id, _amount, _ref)` — releases reserved funds on rejection/failure
- `approve_deposit(_deposit_id)` — admin-only, idempotent, credits ledger; blocked if `deposits_enabled = false` in production mode
- `reject_deposit(_deposit_id, _note)` — marks rejected, writes audit log
- `approve_withdrawal(_withdrawal_id)` — admin-only, reserves then marks approved
- `reject_withdrawal(_withdrawal_id, _note)` — releases reserved, marks rejected
- `award_referral_commission(_investment_id)` — called on investment activation; checks eligibility, prevents duplicates

**New server functions:**
- `src/lib/ledger.functions.ts` — `getMyBalance()`, `getMyLedger()`
- `src/lib/deposit.functions.ts` — `createDepositRequest()`, `adminReviewDeposit()`
- `src/lib/withdrawal.functions.ts` — `createWithdrawalRequest()`, `adminReviewWithdrawal()`
- `src/lib/referral.functions.ts` — `getMyReferralInfo()`, `adminMarkCommissionPaid()`

---

## Phase 4 — Investor-Facing Pages

**Enhanced Dashboard `/dashboard`:**
- Available / Reserved / Invested balances (from ledger — clearly labelled)
- Estimated monthly/annual income (labelled "estimated, not guaranteed")
- Distributions received (shows $0 until real distributions are recorded)
- Active investments list
- Referral quick-stats widget
- **Operating mode banner**: if `operating_mode = test`, shows a prominent banner — "TEST MODE — balances are simulated and not real funds"

**Deposit Page `/deposit`:**
- If `deposits_enabled = false`: shows "Deposits not yet open — configuration in progress" — no wallet address shown
- If `deposits_enabled = true` and `operating_mode = test`: shows TEST MODE banner, fake test address
- Company wallet address served from server-side config only (never hardcoded in frontend)
- Network warning: "Only TRC20 (Tron). Other networks will result in permanent loss."
- TXID input → creates `deposit_request` (status: pending_review)
- Clear message: "Funds credited only after manual verification by the team"
- No blockchain auto-verification in this phase (requires TronGrid API key)

**Withdrawal Page `/withdraw`:**
- If `withdrawals_enabled = false`: shows "Withdrawals not yet open"
- Shows available balance; input capped at available
- Destination address input + TRC20 format hint
- Creates `withdrawal_request`, reserves funds atomically
- Status: pending_review → approved → processing → completed (or rejected/failed)
- Clear message: "Withdrawals require review before processing"

**Referral Page `/referral`:**
- Unique referral link (`?ref=<short_code>`)
- Stats: referred users, eligible investments, pending/paid commissions
- Commission history table
- Disclosure of terms and eligibility rules

**Property Detail Page `/property/$id`:**
- Full description, location, images, funding progress
- Investment terms, minimum, duration, expected yield (with assumptions stated)
- Risk disclosures section
- Legal structure note (placeholder until legal docs are supplied)
- Invest button → `/invest?type=property&id=X`
- Only published properties shown (admin sets `is_active`)

---

## Phase 5 — Enhanced Admin Dashboard

Tab layout on `/admin`:

| Tab | Content |
|---|---|
| Overview | Pending counts, total deposits, withdrawal queue |
| Deposits | Review deposit requests — approve/reject with note |
| Withdrawals | Review withdrawal requests — approve/reject |
| Investments | Existing payment review (kept) |
| Users | List users, view balances, account status |
| Projects | Create/edit/publish/pause properties; set `is_active` |
| Referrals | Commission records, mark paid |
| Settings | Operating mode display, production checklist, toggle deposits/withdrawals, commission rate, wallet address |
| Audit Log | Read-only log of all admin actions |

**Production Checklist (Settings tab):**
Each item must be manually checked by an admin before `operating_mode` can be set to `production`:
1. Company receiving wallet address configured and verified
2. Blockchain data provider (TronGrid) API key configured and tested
3. Correct USDT TRC20 token contract confirmed
4. Transaction confirmation/finality rules set
5. Idempotency and double-credit prevention tested
6. Withdrawal signing and security review completed
7. RLS and authorization end-to-end test passed
8. Legal, licensing, and compliance review completed

Until all 8 are checked: "Switch to Production" button is disabled and greyed out with explanation.

**Operating mode badge** displayed in admin header: `TEST MODE` (orange) or `PRODUCTION` (green). Test deposits/withdrawals never touch real funds.

---

## Phase 6 — Referral System

- Short code = first 8 chars of user UUID, stored in `profiles.referral_code` (unique index)
- Landing page reads `?ref=CODE` → stored in `sessionStorage`
- On registration: resolves code → inserts `referrals` row (DB function prevents self-referral)
- On investment activation: `award_referral_commission()` checks: first investment of referred user, not self-referral, no existing commission → creates `referral_commissions` record (10% of investment amount, configurable via `platform_config`)
- Admin marks paid → credits referrer's ledger
- No commissions for registration alone or unverified deposits

---

## Phase 7 — Legal & Disclosure Pages

All pages clearly labelled "DRAFT — requires legal review before production":

- `/terms` — Terms & Conditions (placeholder with required sections listed)
- `/privacy` — Privacy Policy (placeholder)
- `/risk` — Risk Disclosure (explicit: returns not guaranteed, capital at risk, no FDIC/FSCS)

Investment calculator on landing page includes:
- "These figures are hypothetical estimates based on stated assumptions. Past performance does not predict future results. Capital is at risk."

No guaranteed return percentages anywhere in the UI.

---

## Phase 8 — i18n

All new strings added to `src/lib/i18n.tsx` in both Arabic and English:
- Balance categories, deposit/withdrawal statuses, referral terms
- Legal disclaimers, test mode banners, production checklist labels
- All error and validation messages

---

## Technical Notes

- Test and production balances are **structurally separated** (`is_test` column) — no query can accidentally mix them
- `ledger_entries` is append-only at DB level (trigger raises exception on UPDATE/DELETE)
- `deposit_requests.tx_hash + network` UNIQUE constraint prevents double-credit
- `platform_config` is admin-write only (RLS + server function)
- Public users cannot read or write `platform_config`
- Existing `investments` and `payments` tables kept unchanged; new ledger is additive
- Blockchain verification scaffolded but not activated — `deposits_enabled` stays false until TronGrid API key is provided and tested
- No wallet addresses hardcoded — served from `platform_config` via server function only

## What remains disabled pending verification

| Feature | Blocker |
|---|---|
| Real deposits | Company wallet address + TronGrid API key + security test |
| Real withdrawals | Signing mechanism + security review |
| Blockchain auto-verification | TronGrid API key |
| Production mode | All 8 checklist items |
| Legal pages | Legal counsel review |
| Real referral payouts | Withdrawal system live |

## Files Changed

**New routes:** `/deposit`, `/withdraw`, `/referral`, `/property/$id`, `/terms`, `/privacy`, `/risk`
**Modified routes:** `/` (landing), `/dashboard`, `/admin`, `/invest`
**New libs:** `ledger.functions.ts`, `deposit.functions.ts`, `withdrawal.functions.ts`, `referral.functions.ts`
**Modified:** `i18n.tsx`, `config.ts`, `data.ts`, `AppShell.tsx`
**New migration:** 8 new tables + 8 SQL functions + RLS policies
