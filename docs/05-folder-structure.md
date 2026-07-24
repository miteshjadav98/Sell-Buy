# Folder Structure

The rule for where code goes, so nobody has to guess.

```
sell-buy/
├── apps/
│   ├── api/                          # NestJS backend
│   └── web/                          # Next.js 15 frontend
├── packages/
│   ├── shared-types/                 # DTO contracts shared by API and web
│   └── config/                       # shared eslint / tsconfig presets
├── docs/                             # architecture, ER, sequence, deployment
├── infra/
│   ├── k8s/                          # Kubernetes manifests
│   └── docker/                       # Dockerfiles
├── .github/workflows/                # CI/CD
└── docker-compose.yml
```

## Backend — `apps/api`

```
apps/api/
├── prisma/
│   ├── schema.prisma                 # single source of truth for the DB
│   ├── migrations/
│   └── seed.ts
├── src/
│   ├── main.ts                       # bootstrap: helmet, cors, swagger, pipes
│   ├── app.module.ts                 # root wiring
│   │
│   ├── config/                       # typed, validated configuration
│   │   ├── configuration.ts
│   │   └── env.validation.ts         # fails fast at boot on bad env
│   │
│   ├── core/                         # framework-agnostic building blocks
│   │   ├── domain/
│   │   │   ├── base.entity.ts
│   │   │   ├── value-object.base.ts
│   │   │   ├── domain-event.base.ts
│   │   │   └── result.ts             # typed success/failure, no exceptions for flow
│   │   └── application/
│   │       ├── use-case.interface.ts
│   │       ├── pagination.ts
│   │       └── transaction-manager.port.ts
│   │
│   ├── common/                       # cross-cutting HTTP concerns
│   │   ├── decorators/               # @Public @Roles @Permissions @RateLimit @CurrentUser
│   │   ├── guards/                   # jwt-auth, roles, permissions
│   │   ├── interceptors/             # logging, transform, cache, timeout
│   │   ├── filters/                  # all-exceptions, prisma-exception
│   │   ├── pipes/
│   │   ├── dto/                      # pagination, api-response envelopes
│   │   └── errors/                   # domain error hierarchy
│   │
│   ├── infrastructure/               # everything that touches the outside world
│   │   ├── prisma/                   # PrismaService (singleton), tx manager, base repo
│   │   ├── redis/                    # connection, cache service, lua scripts
│   │   ├── resilience/               # circuit breaker, retry with jitter
│   │   ├── rate-limit/               # sliding-window limiter + guard
│   │   ├── payments/                 # razorpay/stripe/cod adapters + factory
│   │   ├── notifications/            # email/sms/whatsapp/push adapters + factory
│   │   ├── storage/                  # S3 adapter
│   │   ├── search/                   # meilisearch adapter + postgres fallback
│   │   └── queue/                    # BullMQ setup and processors
│   │
│   └── modules/                      # feature modules, one folder each
│       ├── auth/
│       ├── users/
│       ├── products/
│       ├── catalog/
│       ├── inventory/
│       ├── cart/
│       ├── checkout/
│       ├── orders/
│       ├── payments/
│       ├── reviews/
│       ├── coupons/
│       ├── offers/
│       ├── sellers/
│       ├── admin/
│       ├── recommendations/
│       ├── notifications/
│       └── analytics/
└── test/                             # e2e specs
```

### Inside a feature module

Always these four layers, always in this shape:

```
modules/<feature>/
├── domain/
│   ├── entities/                     # business rules, zero framework imports
│   ├── value-objects/
│   ├── events/
│   └── ports/                        # interfaces the feature needs from outside
├── application/
│   ├── use-cases/                    # one class per operation
│   ├── dto/                          # request/response contracts + validation
│   └── mappers/                      # persistence ⇄ domain
├── infrastructure/
│   └── repositories/                 # Prisma implementations of the ports
└── presentation/
    ├── <feature>.controller.ts       # HTTP only, no business logic
    └── <feature>.module.ts           # binds ports to implementations
```

**Where does my code go?**

- Is it a business rule that would still be true without HTTP or a database? → `domain/`
- Does it orchestrate a single user-facing operation? → `application/use-cases/`
- Does it talk to Postgres, Redis, S3, or a vendor API? → `infrastructure/`
- Does it translate HTTP to a use case? → `presentation/`

If a file imports both `@nestjs/common` and lives in `domain/`, that is a bug.

## Frontend — `apps/web`

```
apps/web/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (shop)/                   # storefront: home, category, product, cart
│   │   ├── (auth)/                   # login, register, forgot password
│   │   ├── (account)/                # profile, orders, wishlist, wallet
│   │   ├── seller/                   # seller dashboard
│   │   └── admin/                    # admin panel
│   ├── components/
│   │   ├── ui/                       # ShadCN primitives
│   │   ├── product/                  # cards, gallery, variant picker
│   │   ├── cart/
│   │   └── layout/                   # header, footer, nav
│   ├── features/                     # feature-scoped hooks + API clients
│   ├── lib/                          # api client, query client, utils
│   ├── store/                        # Zustand slices (cart, ui)
│   ├── hooks/
│   └── styles/
└── public/
```

Server state lives in **React Query**; client state (cart drawer, theme, filters) lives in
**Zustand**. They do not overlap — the most common state-management mistake is duplicating
server data into a client store and then fighting to keep them in sync.
