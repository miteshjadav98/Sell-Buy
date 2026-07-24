# Sell-Buy

A small marketplace where independent sellers register a shop and customers buy from them,
built as **event-driven microservices**: Node.js + TypeScript, MongoDB, Kafka, React.

Services never call each other to *change* state. They publish facts to Kafka and whoever
cares subscribes — so a service can be down, restarted, or replaced without the others
needing to know.

---

## Architecture

```
                      ┌──────────────┐
   browser ─────────► │   gateway    │  :4000   one origin, routes by path prefix
   (React SPA)        └──────┬───────┘
                             │  HTTP
        ┌────────────┬───────┴──────┬──────────────────┐
        ▼            ▼              ▼                  ▼
   ┌─────────┐  ┌─────────┐   ┌─────────┐      ┌──────────────┐
   │  auth   │  │ catalog │   │  order  │      │ notification │
   │  :4001  │  │  :4002  │   │  :4003  │      │    :4004     │
   └────┬────┘  └────┬────┘   └────┬────┘      └──────┬───────┘
        │            │             │                  │
        │   sellbuy_auth / _catalog / _orders / _notifications  (MongoDB, one DB per service)
        │            │             │                  │
        └────────────┴──────┬──────┴──────────────────┘
                            ▼
                  ┌───────────────────┐
                  │   Kafka  :9092    │   the only way state changes propagate
                  └───────────────────┘
```

| Service          | Owns                                   | Publishes                                            | Consumes                              |
| ---------------- | -------------------------------------- | ---------------------------------------------------- | ------------------------------------- |
| **auth**         | users, passwords, JWTs                 | `user.registered`                                     | —                                     |
| **catalog**      | shops, products, stock                 | `shop.created`, `product.created`, `inventory.*`      | `order.created`                       |
| **order**        | orders, checkout saga                  | `order.created`, `order.confirmed`, `order.cancelled` | `inventory.reserved`, `inventory.rejected` |
| **notification** | per-user alerts                        | —                                                     | everything                            |
| **gateway**      | nothing — pure routing                 | —                                                     | —                                     |

### The checkout saga

Placing an order is not a single transaction — no service can lock another's database.
It is a choreographed saga instead:

```
customer clicks "Place order"
        │
        ▼
order-service  writes order as `pending`  ──publish──► order.created
                                                            │
                                                            ▼
                                          catalog-service decrements stock
                                          conditionally ($gte guard)
                                                            │
                        ┌───────────────────────────────────┴────────────┐
                        ▼ enough stock                                   ▼ not enough
              publish inventory.reserved                     roll back items already
                        │                                    taken, publish inventory.rejected
                        ▼                                                │
          order → `confirmed`, publish order.confirmed     order → `cancelled` + reason
                        │                                                │
                        └──────────────► notification-service ◄──────────┘
                                    writes alerts for buyer and sellers
```

The UI shows the order as `pending` and polls until it settles — the async boundary is
visible rather than hidden.

**Consistency details that matter:**

- **Idempotency.** Kafka delivers at least once. Catalog keeps a `Reservation` row with a
  unique index on `orderId`, so a redelivered `order.created` cannot decrement stock twice.
  Order-service transitions only match `status: 'pending'`, making its handlers idempotent too.
- **No oversell.** Stock is taken with a conditional update (`stock: { $gte: quantity }`), so
  two concurrent orders for the last item cannot both succeed.
- **Compensation.** If item 3 of 4 fails, the items already taken in that attempt are put back
  before the rejection is published.
- **Price snapshots.** Item price is copied onto the order at checkout, so a later price change
  never rewrites an order that was already placed.

### Deliberate design choices

- **One database per service.** No service reads another's collections. The only shared truth
  is what travels on the bus.
- **The gateway is not a trust boundary.** It routes; it does not verify tokens. Every service
  verifies the JWT itself, so exposing a service directly is still safe.
- **Checkout reads the catalog over HTTP.** Price and seller must be correct at the instant the
  order is written, and an eventually-consistent local copy could be stale. State *changes* are
  still events only — this is a read, not a command.
- **Handler failures don't stall the partition.** A failing handler is logged and skipped; a
  production system would route it to a dead-letter topic.

---

## Running it

### Everything in Docker

```bash
docker compose up --build
```

Then open **http://localhost:5173**. The gateway is on `http://localhost:4000`.

### Local development (hot reload)

```bash
cp .env.example .env
npm install
npm run infra:up      # Mongo + Kafka in Docker, nothing else
npm run dev           # gateway, 4 services and the Vite dev server together
```

| URL                     | What                    |
| ----------------------- | ----------------------- |
| http://localhost:5173   | React app               |
| http://localhost:4000   | API gateway             |
| localhost:27017         | MongoDB                 |
| localhost:9092          | Kafka                   |

No broker handy? Set `KAFKA_ENABLED=false` and the services still serve HTTP — events become
no-ops, so orders stay `pending` and no alerts are written.

### Useful commands

```bash
npm run build       # compile shared package, all services, and the frontend
npm run typecheck   # type-check everything without emitting
npm run infra:down  # stop Mongo and Kafka
```

---

## Trying the flow

1. **Sign up as a seller** → you land on the dashboard → register a shop → add a product with stock.
2. **Sign up as a customer** (different email) → the product is on the home page → add to cart → place order.
3. The order shows **pending**, then flips to **confirmed** within a second or two — that is the
   saga completing across three services.
4. **Alerts** shows what the notification service wrote from the event stream. The seller sees
   "New sale" on their own account.
5. To see the failure path, set a product's stock to 0 from the dashboard after adding it to your
   cart, then check out — the order settles as **cancelled** with a reason.

---

## API

All routes go through the gateway. Authenticated routes take `Authorization: Bearer <jwt>`.

| Method   | Route                        | Who         | Purpose                            |
| -------- | ---------------------------- | ----------- | ---------------------------------- |
| `POST`   | `/api/auth/register`         | anyone      | Sign up as `customer` or `seller`  |
| `POST`   | `/api/auth/login`            | anyone      | Get a JWT                          |
| `GET`    | `/api/auth/me`               | any user    | Current user                       |
| `GET`    | `/api/shops`                 | anyone      | List shops                         |
| `GET`    | `/api/shops/mine`            | seller      | Own shop                           |
| `GET`    | `/api/shops/:id`             | anyone      | Shop with its products             |
| `POST`   | `/api/shops`                 | seller      | Register a shop (one per seller)   |
| `GET`    | `/api/products?search=`      | anyone      | Browse / search                    |
| `GET`    | `/api/products/mine`         | seller      | Own listings                       |
| `POST`   | `/api/products`              | seller      | Add a product                      |
| `PATCH`  | `/api/products/:id`          | seller      | Edit / restock own product         |
| `DELETE` | `/api/products/:id`          | seller      | Remove own product                 |
| `POST`   | `/api/orders`                | customer    | Place an order                     |
| `GET`    | `/api/orders/mine`           | customer    | Own orders                         |
| `GET`    | `/api/orders/seller`         | seller      | Orders containing own products     |
| `GET`    | `/api/notifications`         | any user    | Own alerts                         |

---

## Layout

```
packages/common/       config, logger, Mongo, EventBus, JWT auth, error handling
services/gateway/      path-prefix router
services/auth/         users + JWT issuing
services/catalog/      shops, products, stock reservation consumer
services/order/        orders + checkout saga consumer
services/notification/ event-driven alerts (no write API)
frontend/              React + Vite SPA
```

Event names and payloads live in one place — `packages/common/src/events.ts`. Both sides of
every topic are typed against it, so a producer and consumer cannot drift apart silently.

---

## Notes and next steps

- `JWT_SECRET` in `.env.example` is a placeholder. Set a real one before deploying anything.
- Not built yet, in rough priority order: payments, a dead-letter topic for failed handlers,
  refresh tokens, a transactional outbox so a DB write and its event commit atomically,
  and automated tests.
