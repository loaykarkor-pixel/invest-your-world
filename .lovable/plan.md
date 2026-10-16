# Al Rayyan Real Estate Investment — Platform Upgrade Plan

## What this does

Upgrades the existing INVESTERRA project into **Al Rayyan Real Estate Investment** (الريان للاستثمار العقاري), adding a financial ledger, deposit/withdrawal workflows, referral system, enhanced admin dashboard, and a public landing page — without rebuilding anything from scratch.

---

## Phase 1 — Branding & Public Landing Page

**Rename throughout:**
- App name → "Al Rayyan" / "الريان للاستثمار العقاري"
- Update `APP_NAME` in `src/lib/config.ts`, all `head()` titles, logo text, and i18n strings

**Redesign `src/routes/index.tsx`:**
- Hero section with name + tagline in Arabic/English
- Featured real estate projects loaded from the database (public read)
- Investment process explainer (4 steps)
- Hypothetical income calculator (enter amount, pick project, see estimated return)
- Prominent disclaimer that returns are not guaranteed
- FAQ accordion (5–7 questions about the platform, fees, risks)
- Links to Terms, Privacy Policy, Risk Disclosure (static pages)
- Registration / Login CTAs

**New static pages:**
- `/terms` — Terms & Conditions placeholder
- `/privacy` — Privacy Policy placeholder
- `/risk` — Risk Disclosure placeholder

---

## Phase 2 — Database Schema

New tables added via migration (existing tables preserved):

| Table | Purpose |
|---|---|
| `ledger_accounts` | One row per user: available, reserved, invested balances (NUMERIC) |
| `ledger_entries` | Immutable transaction log (type, amount, ref, user, timestamp) |
| `deposit_requests` | Deposit initiation records with status |
| `withdrawal_requests` | Withdrawal requests with approval workflow |
| `referrals` | Who referred whom |
| `referral_commissions` | Commission records per qualifying investment |
| `audit_log` | Admin/system actions log |
| `platform_config` | Key/value store for admin-configurable settings (commission rate, deposit enabled, etc.) |

Key safety constraints:
- `ledger_entries` has no UPDATE or DELETE policy — append-only
- `deposit_requests.tx_hash` unique per network (prevents double-credit)
- All balance mutations go through server functions, not direct client writes
- `platform_config` has a `deposits_enabled` and `withdrawals_enabled` flag (default false)

RLS on all new tables with same pattern as existing (own-row read, admin read-all).

---

## Phase 3 — Financial Engine (Server Functions)

New server functions in `src/lib/`:

- `ledger.functions.ts` — `getMyBalance()`, `getMyLedger()`
- `deposit.functions.ts` — `createDepositRequest()`, `adminReviewDeposit()`
- `withdrawal.functions.ts` — `createWithdrawalRequest()`, `adminReviewWithdrawal()`
- `referral.functions.ts` — `getMyReferralInfo()`, `getReferralStats()`

Balance mutations use `BEGIN/COMMIT` equivalent via Supabase RPC (SQL functions) to keep them atomic.

New SQL functions:
- `credit_ledger(_user_id, _amount, _type, _ref)` — SECURITY DEFINER, appends entry + updates account
- `reserve_funds(_user_id, _amount, _ref)` — moves available → reserved atomically
- `release_reserved(_user_id, _amount, _ref)` — releases reserved funds
- `approve_deposit(_deposit_id)` — admin-only, credits ledger
- `reject_deposit(_deposit_id, _note)` — admin-only, sets rejected
- `approve_withdrawal(_withdrawal_id)` — admin-only, reserves then marks approved
- `reject_withdrawal(_withdrawal_id, _note)` — releases reserved, marks rejected
- `award_referral_commission(_investment_id)` — called when investment becomes active

---

## Phase 4 — Investor-Facing Pages

**Enhanced Dashboard (`/dashboard`):**
- Available balance, invested balance, reserved balance (from ledger)
- Realized distributions (currently zero, displayed honestly)
- Estimated monthly/annual income (clearly labelled "estimated, not guaranteed")
- Active investments list
- Referral quick-stats widget

**New: Deposit Page (`/deposit`):**
- Shows `deposits_enabled` gate (if disabled: "Deposits not yet open — coming soon")
- Deposit amount input
- Displays USDT TRC20 company address (from server-side config, not hardcoded)
- Network warning banner
- TXID input
- Creates `deposit_request` record (status: pending)
- Note: funds credited only after admin approval

**New: Withdrawal Page (`/withdraw`):**
- Shows `withdrawals_enabled` gate
- Shows available balance
- Amount input (max = available)
- Destination TRC20 address input + address validation
- Creates `withdrawal_request` (status: pending, reserves funds atomically)
- Clear message that withdrawal requires review

**New: Referral Page (`/referral`):**
- Unique referral link (`?ref=<user_id_prefix>`)
- Stats: total referred, eligible investments, pending/paid commissions
- Commission history table
- Disclosure of commission terms

**Property Detail Page (`/property/$id`):**
- Full description, images, terms, funding progress
- Risk disclosures section
- Investment button → `/invest?type=property&id=X`

---

## Phase 5 — Enhanced Admin Dashboard

Extended `/admin` page (tab layout):

| Tab | Content |
|---|---|
| Payments | Existing payment review (keep current) |
| Deposits | Review deposit requests, approve/reject |
| Withdrawals | Review withdrawal requests, approve/reject |
| Users | List users, view balances |
| Projects | List/edit properties (title, yield, status, images) |
| Referrals | Commission records, mark paid |
| Settings | Toggle deposits/withdrawals, set commission rate, update wallet address |
| Audit Log | Read-only log of admin actions |

Property management (admin only):
- Create/edit properties from the admin panel
- Set `is_active` flag — only active properties shown to investors

---

## Phase 6 — Referral System

- Referral code = first 8 chars of user UUID (stored, unique)
- Landing page reads `?ref=CODE` query param → stores in sessionStorage
- On registration: resolves referral code → inserts `referrals` row
- On investment activation (admin approves payment): checks for referral, creates `referral_commissions` record (10% of investment, status: pending)
- Admin marks commission paid → updates record, credits referred-user's ledger

Abuse prevention:
- No self-referral (checked in DB function)
- One commission per referred user's first qualifying investment only
- Commission rate from `platform_config`, not hardcoded

---

## Phase 7 — i18n & Strings

Add all new strings to `src/lib/i18n.tsx` in both Arabic and English:
- Deposit, withdrawal, referral, balance, commission, ledger terms
- All status labels (pending, approved, processing, completed, rejected, failed)
- All disclaimer and legal notice strings
- Platform-disabled messages

---

## Technical Notes

- All balance reads and mutations go through `requireSupabaseAuth` server functions — no direct client table writes for financial data
- `ledger_entries` is append-only at the database level (no UPDATE/DELETE policy, trigger blocks it)
- `deposit_requests.tx_hash + network` has a UNIQUE constraint to prevent double-credit
- `platform_config` is seeded with `deposits_enabled = false`, `withdrawals_enabled = false`, `commission_rate_pct = 10`
- Existing `investments` and `payments` tables kept unchanged; new ledger runs alongside and will be reconciled when deposits go live
- Blockchain verification (TronGrid API) is scaffolded but gated behind `deposits_enabled` — the API key slot is prepared but deposits stay manual-review until the key is provided
- **Operating mode** (`platform_config.operating_mode`): `test` or `production`. Displayed clearly in the admin header and on deposit/withdrawal pages. Test balances stored in a separate `is_test` boolean column on `ledger_accounts` and `ledger_entries` — they can never be mixed with production records
- **Production activation checklist** displayed in admin Settings tab: each prerequisite (wallet address, blockchain provider, token contract, confirmation rules, security audit, legal approval) must be manually checked off before `operating_mode` can be set to `production`. Unchecked = blocked at the database level
- Public users cannot change operating mode (RLS + server-side guard)
- No fabricated properties, regulatory badges, or sample balances labelled as real

## Files Changed

**New routes:** `/deposit`, `/withdraw`, `/referral`, `/property/$id`, `/terms`, `/privacy`, `/risk`  
**Modified routes:** `/`, `/dashboard`, `/admin`, `/invest`  
**New libs:** `src/lib/ledger.functions.ts`, `src/lib/deposit.functions.ts`, `src/lib/withdrawal.functions.ts`, `src/lib/referral.functions.ts`  
**Modified:** `src/lib/i18n.tsx`, `src/lib/config.ts`, `src/lib/data.ts`, `src/components/AppShell.tsx`  
**New migration:** ledger, deposits, withdrawals, referrals, commissions, audit_log, platform_config tables + SQL functions
