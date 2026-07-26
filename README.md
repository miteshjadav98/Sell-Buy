# Sell-Buy

A multi-vendor commerce platform — customers buy, sellers run storefronts, admins govern the
marketplace. Built as a **modular monolith** on Clean Architecture: NestJS + PostgreSQL +
Prisma + Redis on the backend, Next.js 15 on the front.

> **Build status.** This repository is being built in the ten steps below.
> **Steps 1–3 are done and verified** (architecture, database, backend foundation with a
> complete auth vertical slice). Steps 4–10 are not written yet — see
> [Progress](#progress) for exactly what exists today.

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
cp .env.example .env          # then set the two JWT secrets
docker compose up -d          # postgres, redis, meilisearch, minio, mailhog

cd apps/backend
npm install
npx prisma migrate dev        # create the schema
npm run dev                   # http://localhost:4000
```

| URL | What |
| --- | --- |
| http://localhost:4000/api/docs | Swagger UI |
| http://localhost:4000/health/ready | Readiness probe |
| http://localhost:4000/health/dependencies | Circuit breaker states |
| http://localhost:8025 | Mailhog — catches all outbound email |

---

## Architecture in one screen

```
apps/backend/src/
├── config/           typed env, validated at boot — bad config never reaches runtime
├── core/             domain primitives (Entity, Money, Result) — zero framework imports
├── common/           guards, filters, interceptors, decorators, error hierarchy
├── infrastructure/   prisma, redis, rate limiting, circuit breaker, payment adapters
└── modules/          feature modules, each layered domain → application → infra → presentation
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
| **4. Frontend** | ⬜ Next.js 15 app |
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

Not yet verified at runtime: nothing has been executed against a live PostgreSQL or Redis in
this environment, so migrations and the repository implementations are compile-checked but not
integration-tested.

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
