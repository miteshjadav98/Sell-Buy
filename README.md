# Sell-Buy

A multi-vendor commerce platform — customers buy, sellers run storefronts, admins govern the
marketplace. Built as a **modular monolith** on Clean Architecture: NestJS + PostgreSQL +
Prisma + Redis on the backend, Next.js 15 on the front.

> **Build status.** This repository is being built in the ten steps below.
> **Steps 1–4 and 6–8 are done** — architecture, database, backend foundation, the Next.js
> storefront, catalogue, cart and checkout. Authentication is partial; orders and the admin
> panel are not written yet. See [Progress](#progress) for exactly what exists today.

---

## Documentation

| Document | Contents |
| --- | --- |
| [Architecture](docs/01-architecture.md) | HLD, LLD, SOLID mapping, design patterns, rate limiting, circuit breaker |
| [Database](docs/02-database.md) | ER diagram, schema decisions, indexing strategy |
| [Sequence diagrams](docs/03-sequence-diagrams.md) | Registration, login/refresh rotation, checkout, search, returns |
| [Deployment](docs/04-deployment.md) | Docker, Kubernetes, CI/CD, scaling, DR |
| [Folder structure](docs/05-folder-structure.md) | Full tree and the rule for where code goes |

---

## Quick start

```bash
docker compose up -d          # postgres, redis, meilisearch, minio, mailhog

# API
cd apps/backend
cp ../../.env.example .env    # NOTE: apps/backend/.env, not the repo root —
                              # Prisma and Nest both resolve it from here.
                              # Then set the two JWT secrets (32+ chars):
                              #   openssl rand -base64 48
npm install
npx prisma migrate dev        # create the schema
npm run db:seed               # roles, permissions, demo catalogue
npm run dev                   # http://localhost:4000

# Storefront, in a second terminal
cd apps/frontend
npm install
cp .env.example .env.local    # points at http://localhost:4000/api/v1
npm run dev                   # http://localhost:3000
```

| URL | What |
| --- | --- |
| http://localhost:3000 | Storefront |
| http://localhost:4000/api/docs | Swagger UI |
| http://localhost:4000/health/ready | Readiness probe |
| http://localhost:4000/health/dependencies | Circuit breaker states |
| http://localhost:8025 | Mailhog — catches all outbound email |

Seeded sign-ins (all pre-verified, since the OTP flow is Step 5):

| Account | Password |
| --- | --- |
| `customer@sell-buy.local` | `Customer@12345` |
| `seller@sell-buy.local` | `Seller@12345` |
| `admin@sell-buy.local` | `Admin@12345` |

### Routing

`API_PREFIX` is the prefix **only** — `enableVersioning` appends the version
segment separately, so `API_PREFIX=api` yields `/api/v1/…`. Putting `api/v1` in
the variable produces `/api/v1/v1/…`. Health probes are version-neutral and
excluded from the prefix, so they stay at `/health/*` across API versions.

---

## Architecture in one screen

```
apps/backend/src/
├── config/           typed env, validated at boot — bad config never reaches runtime
├── core/             domain primitives (Entity, Money, Result) — zero framework imports
├── common/           guards, filters, interceptors, decorators, error hierarchy
├── infrastructure/   prisma, redis, rate limiting, circuit breaker, payment adapters
└── modules/          feature modules, each layered domain → application → infra → presentation

apps/frontend/src/
├── app/              App Router pages
├── components/       ui primitives, layout, product, address
├── features/         one folder per domain: API client + React Query hooks
├── store/            Zustand — only what is *open*, never server data
├── lib/              fetch wrapper, money formatting, utils
└── types/            the API contract, mirrored
```

**The dependency rule:** source dependencies point inward. `domain/` knows nothing about
NestJS, Prisma or HTTP; `application/` declares the interfaces it needs; `infrastructure/`
implements them. Swapping Postgres, Razorpay or REST touches exactly one layer.

### SOLID, concretely

| Principle | In this codebase |
| --- | --- |
| **S** | One use case per class. `RegisterUseCase` creates the account and nothing else — email, seller setup and analytics subscribe to the event. |
| **O** | A new payment provider is one new adapter class plus one line in the factory. No existing file changes. |
| **L** | Razorpay, Stripe and COD satisfy `IPaymentGateway` identically. No caller branches on which one it got. |
| **I** | `IUserReadRepository` and `IUserWriteRepository` are separate, so a read-only use case cannot write and a test fake stays small. |
| **D** | Use cases inject `USER_READ_REPOSITORY` (a symbol they own). `auth.module.ts` decides Prisma answers it. |

### Patterns and where they earn their place

Repository (persistence) · Strategy (payment, shipping, discounts) · Factory (gateway
selection) · Adapter (Razorpay, Stripe, S3, Meilisearch) · Builder (catalog query composition) ·
Singleton (Prisma, Redis pools) · Decorator (`@Roles`, `@RateLimit`, `@Public`) · Observer
(domain events) · Unit of Work (`PrismaTransactionManager`) · Specification (coupon eligibility)
· Circuit Breaker (every outbound call).

Full rationale for each: [docs/01-architecture.md](docs/01-architecture.md#4-design-patterns-in-use).

---

## The two resilience pieces

### Rate limiting — `infrastructure/rate-limit/`

Redis-backed **sliding window**, executed as an atomic Lua script.

- **Distributed**, because a per-process counter with 10 pods means the real limit is 10× the
  configured one and changes whenever the HPA scales.
- **Sliding**, because a fixed window lets 2× the budget through across the boundary — exactly
  where an attacker aims.
- **Atomic**, because a separate GET-then-INCR has a race that concurrent requests slip through.
- **Fails open.** If Redis is down, requests are allowed and the failure is logged loudly.
  A limiter that takes the site offline during a cache outage has caused the very thing it
  exists to prevent.

Three tiers: 300/min per IP globally, 1000/min per authenticated user, and per-route policies
declared next to the endpoint (`login` 5/min keyed by **IP + email**, so neither rotating
proxies nor targeting one account resets the budget).

### Circuit breaker — `infrastructure/resilience/`

Prevents one vendor outage from becoming a full checkout outage: a gateway that starts taking
30s to time out will exhaust the connection pool and take down cash-on-delivery orders that
never needed it.

`CLOSED → OPEN → HALF_OPEN → CLOSED`, with per-dependency thresholds, per-call timeouts,
rolling failure windows, limited half-open probing, and fallbacks (search degrades to Postgres;
payments re-route to the other gateway). Retries use exponential backoff **with jitter** so a
recovering service is not hit by a synchronised herd.

Verified by 11 unit tests — `npm test` in `apps/backend`.

---

## The storefront

Design direction is **the receipt**. Indian commerce runs on the itemised tax invoice, and
that artifact is also the honest expression of what this backend does — so money gets exactly
one treatment everywhere it appears (tabular mono, right-aligned, hairline above a total), and
hairlines appear only where a receipt uses them. A rule on this site means "these were summed",
never "a section ended". The hero is a working receipt showing a ₹999 tee whose GST is already
inside the number: the claim is demonstrated, not asserted.

Ink and invoice-paper neutrals, **indigo** as the accent, and **vermilion reserved strictly for
money saved** — nothing else may use it, which is what keeps a discount legible at a glance.
Fraunces for display, Inter Tight for UI, IBM Plex Mono for every figure.

Three decisions worth knowing before editing it:

- **React Query owns server state; Zustand owns only what is open.** The cart lives in the query
  cache, never in the client store. Duplicating server data into a store and then fighting to
  keep the two in sync is the most common state bug in an app like this.
- **The access token lives in a module variable, never `localStorage`.** Any script on the page
  can read storage, so one XSS becomes a session that outlives the tab. The httpOnly refresh
  cookie survives reloads and is exchanged on boot. Refresh is deduplicated behind a single
  in-flight promise — tokens rotate on use, so parallel refreshes would present superseded
  tokens and log the user out for loading a page.
- **Filters live in the URL.** A filtered view you cannot share, bookmark or reach with the back
  button is not a filtered view.

## Checkout, and why it is shaped that way

The order path is the one place in this system where being wrong costs money, so
the boundaries are worth stating explicitly:

```
┌─ ONE transaction ─────────────────────────────────────────┐
│  SELECT … FOR UPDATE on every inventory row in the basket │
│  verify stock against the locked figures                  │
│  price from the database — never from the client          │
│  apply the coupon (Specification), tax + shipping (Strategy)│
│  INSERT order (PENDING_PAYMENT) + order_items             │
│  reserve stock (reserved += qty), redeem coupon, convert cart│
└────────────────────── COMMIT ─────────────────────────────┘
   then, OUTSIDE it: call the payment gateway
```

**The lock is not optional.** Reading availability without it is the classic
oversell: two checkouts both see "1 left", both pass validation, both reserve,
and one customer gets an apology. Rows are locked in a deterministic order so two
overlapping baskets cannot deadlock.

**The gateway call is outside the transaction.** A transaction holds row locks,
and sitting inside one for the eight seconds a gateway takes to answer blocks
every other buyer of the same SKU — one slow vendor becomes a site-wide stall.
The cost is a window where an order exists with no payment intent, which is what
the compensating cancel and the expiry sweeper are for.

**Stock is reserved, not decremented.** The customer may abandon the gateway
page. Reservation blocks oversell immediately; a sweep releases it after 15
minutes. Stock is *committed* when the sale becomes irreversible — payment
capture for prepaid, dispatch for COD.

**Three independent idempotency guards**, because each covers a different
failure:

| Guard | Stops |
| --- | --- |
| `Idempotency-Key` → unique index on `orders.idempotencyKey` | A double-tap on "Pay" becoming two orders and two charges |
| Unique `(gateway, eventId)` on `webhook_events` | A gateway redelivering the same capture a dozen times |
| Settlement only advances an order out of `PENDING_PAYMENT` | The browser callback and the webhook both confirming the same order |

**Money is integer minor units everywhere.** `0.1 + 0.2 !== 0.3`, and a
marketplace discovers that slowly, in its ledger. Discounts are split across
lines by largest-remainder so the parts sum to exactly the whole — rounding each
share independently loses a paisa per order into a reconciliation report forever.

**GST is inside the displayed price**, extracted rather than appended: a ₹999
listing is ₹999 at the till, and tax is computed on the *discounted* value
because no tax is owed on money the customer never paid. Swapping to
tax-exclusive pricing for another market is one line in `checkout.module.ts` —
both strategies already exist.

---

## Progress

| Step | Status |
| --- | --- |
| **1. Architecture** | ✅ HLD, LLD, ER, sequence, deployment, folder structure |
| **2. Database** | ✅ Full Prisma schema, 40+ models, validated + client generated |
| **3. Backend** | ✅ Config, core, common, Prisma/Redis, rate limiting, circuit breaker, payment adapters + factory, Swagger, health probes |
| **4. Frontend** | ✅ Next.js 15 storefront — browse, product detail with variant picker, cart, auth, checkout, address book |
| **5. Authentication** | 🟡 Register / login / refresh rotation / logout-all done. OTP, Google OAuth, password reset pending |
| **6. Product module** | ✅ Catalog vertical slice — products, variants, options, categories, brands; seller create/submit, admin approve/reject, storefront listing + detail |
| **7. Cart** | ✅ Hybrid user/guest carts, live price + stock, save-for-later, guest→user merge on login |
| **8. Checkout** | ✅ Single-transaction order placement with `FOR UPDATE` stock locks, GST-inclusive tax + weight-banded shipping (Strategy), coupon eligibility (Specification), stock reservation, idempotent placement, gateway intents, signed webhooks, 15-minute expiry sweep |
| **9. Orders** | ⬜ |
| **10. Admin panel** | ⬜ |

### What is verified

- `npx prisma validate` — schema valid, client generates
- `npx tsc --noEmit` — API typechecks clean
- `npx nest build` — compiles and emits
- `npx jest` — 44/44 pass (11 circuit breaker, 18 checkout pricing, 15 coupon rules)
- Nest container compiles — every provider in the DI graph resolves
- Frontend: `tsc --noEmit` clean, `next lint` clean, `next build` emits 11 routes, and the
  production server returns 200 for `/`, `/products`, `/login`, `/cart`, `/checkout`

Not yet verified at runtime: nothing has been executed against a live PostgreSQL or Redis in
this environment, so migrations and the repository implementations are compile-checked but not
integration-tested. The storefront has likewise been rendered only against an API that was not
running — it degrades to honest empty states, which is by design, but no end-to-end purchase
has been made.

**Known gaps.** The gateway checkout sheet (Razorpay/Stripe SDK) is not wired into the
storefront, so online payments reach `PENDING_PAYMENT` and are then released by the expiry
sweep; cash on delivery completes end to end. Order history has no endpoint until Step 9, so
the confirmation screen reads the placed order from `sessionStorage`.

---

## Commands

```bash
cd apps/backend

npm run dev                 # watch mode
npm run build               # compile
npm run typecheck           # types only
npm test                    # unit tests
npm run db:migrate          # create + apply a migration
npm run db:seed             # roles, permissions, demo catalog
npm run db:studio           # browse data
```
