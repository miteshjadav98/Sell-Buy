# Sequence Diagrams

The flows where the details actually matter.

---

## 1. Registration with OTP verification

```mermaid
sequenceDiagram
    actor U as User
    participant API as Auth Controller
    participant UC as RegisterUseCase
    participant DB as PostgreSQL
    participant R as Redis
    participant Q as Queue
    participant W as Worker

    U->>API: POST /auth/register
    API->>API: validate DTO, rate limit (5/min per IP)
    API->>UC: execute(dto)
    UC->>DB: find user by email
    alt email already registered
        DB-->>UC: user exists
        UC-->>U: 409 (generic message — no enumeration)
    else new user
        UC->>UC: hash password (Argon2id)
        UC->>DB: INSERT user (status: PENDING_VERIFICATION)
        UC->>UC: generate 6-digit OTP
        UC->>R: SETEX otp:{userId} 300 {hash(otp)}
        UC->>Q: enqueue SendOtpEmail
        UC-->>U: 201 {userId, "OTP sent"}
        Q->>W: process job
        W->>W: circuit breaker + retry w/ jitter
        W-->>U: email delivered
    end

    U->>API: POST /auth/verify-otp {userId, otp}
    API->>R: GET otp:{userId}
    alt missing or expired
        R-->>U: 400 "OTP expired"
    else attempts exceeded
        R-->>U: 429 "Too many attempts"
    else valid
        API->>DB: UPDATE user SET status = ACTIVE
        API->>R: DEL otp:{userId}
        API-->>U: 200 {accessToken, refreshToken}
    end
```

---

## 2. Login and refresh token rotation

Refresh tokens rotate on every use and are tracked as a **family**. If a token that has already
been used shows up again, it was stolen — the whole family is revoked.

```mermaid
sequenceDiagram
    actor U as User
    participant API as Auth API
    participant DB as PostgreSQL
    participant R as Redis

    U->>API: POST /auth/login
    API->>API: sensitive rate limit (5/min per email+IP)
    API->>DB: SELECT user
    API->>API: verify Argon2id hash
    Note over API: constant-time comparison,<br/>identical timing whether or not user exists
    API->>DB: INSERT session (deviceId, userAgent, ip, familyId)
    API->>R: cache permissions for user
    API-->>U: 200 + access (15m, memory)<br/>+ refresh (7d, HttpOnly cookie)

    Note over U,R: ── 15 minutes later ──

    U->>API: POST /auth/refresh (cookie)
    API->>DB: SELECT session by token hash
    alt token already rotated (reuse detected)
        API->>DB: revoke ENTIRE family
        API-->>U: 401 — re-login required
        Note over API: theft signal: the old token<br/>was replayed by someone
    else valid
        API->>DB: mark old rotated, INSERT new (same family)
        API-->>U: 200 + new access + new refresh
    end

    U->>API: POST /auth/logout-all
    API->>DB: revoke every session for user
    API->>R: purge cached permissions
    API-->>U: 204 — all devices signed out
```

---

## 3. Checkout and payment

The critical path. Note what happens **inside** the transaction versus after it.

```mermaid
sequenceDiagram
    actor U as User
    participant API as Checkout API
    participant UC as PlaceOrderUseCase
    participant DB as PostgreSQL
    participant PF as PaymentGatewayFactory
    participant CB as Circuit Breaker
    participant PG as Razorpay / Stripe
    participant Q as Queue

    U->>API: POST /checkout (addressId, method, couponCode)
    API->>UC: execute(command)

    rect rgb(238, 245, 255)
    Note over UC,DB: single transaction
    UC->>DB: BEGIN
    UC->>DB: SELECT cart items FOR UPDATE
    UC->>DB: lock inventory rows, verify stock
    alt insufficient stock
        UC->>DB: ROLLBACK
        UC-->>U: 409 "X is out of stock"
    end
    UC->>UC: price from DB, never from client
    UC->>UC: apply coupon (Specification rules)
    UC->>UC: compute tax + shipping (Strategy)
    UC->>DB: INSERT order (PENDING_PAYMENT) + order_items
    UC->>DB: reserve stock (reserved += qty)
    UC->>DB: COMMIT
    end

    alt Cash on Delivery
        UC->>DB: order → CONFIRMED
        UC->>Q: OrderPlacedEvent
        UC-->>U: 201 {orderId}
    else Online payment
        UC->>PF: forMethod(RAZORPAY)
        PF-->>UC: RazorpayAdapter
        UC->>CB: execute(createPaymentIntent)
        alt circuit OPEN
            CB-->>UC: fail fast
            UC-->>U: 503 "try another method" + COD offered
        else
            CB->>PG: create order (idempotency key)
            PG-->>UC: {gatewayOrderId}
            UC-->>U: 201 {orderId, gatewayOrderId}
        end

        U->>PG: completes payment on gateway
        PG->>API: POST /payments/webhook
        API->>API: verify HMAC signature
        API->>DB: idempotency check on event id
        alt captured
            API->>DB: payment CAPTURED, order CONFIRMED
            API->>DB: reserved → sold (stock committed)
            API->>Q: OrderPlacedEvent
        else failed
            API->>DB: order PAYMENT_FAILED
            API->>DB: release reserved stock
        end
        API-->>PG: 200
    end

    Q->>Q: send confirmation email + SMS
    Q->>Q: generate invoice PDF
    Q->>Q: reindex product popularity
```

**Why stock is reserved, not decremented:** between order creation and payment capture the
customer may abandon the gateway page. Reserved stock is released by a scheduled sweep after
15 minutes, so abandoned checkouts do not permanently consume inventory — and concurrent buyers
still cannot oversell, because the reservation holds the row.

---

## 4. Product search with graceful degradation

```mermaid
sequenceDiagram
    actor U as User
    participant API as Catalog API
    participant C as Redis Cache
    participant CB as Circuit Breaker
    participant MS as Meilisearch
    participant DB as PostgreSQL

    U->>API: GET /catalog/search?q=laptop&filters
    API->>C: GET search:{hash(query)}
    alt cache hit
        C-->>U: cached page
    else miss
        API->>CB: execute(search)
        alt circuit CLOSED
            CB->>MS: typo-tolerant search + facets
            MS-->>API: ids + facet counts
            API->>DB: hydrate products by id
        else circuit OPEN
            Note over API,DB: degraded, not broken
            CB-->>API: fail fast
            API->>DB: ILIKE + trigram fallback
        end
        API->>C: SETEX 300s
        API-->>U: results + facets
    end
```

---

## 5. Return and refund

```mermaid
sequenceDiagram
    actor U as Customer
    participant API as Orders API
    participant DB as PostgreSQL
    participant CB as Circuit Breaker
    participant PG as Payment Gateway
    actor A as Admin

    U->>API: POST /orders/{id}/return
    API->>DB: load order
    API->>API: OrderPolicy.canReturn() — delivered, within window, not already returned
    alt not eligible
        API-->>U: 422 with the specific reason
    else eligible
        API->>DB: INSERT return_request (REQUESTED)
        API-->>U: 201
    end

    A->>API: PATCH /admin/returns/{id} {APPROVED}
    API->>DB: status → APPROVED, schedule pickup
    Note over A,DB: item picked up and inspected
    A->>API: PATCH /admin/returns/{id} {RECEIVED}

    API->>DB: INSERT refund (PENDING)
    API->>CB: execute(refund, idempotencyKey)
    CB->>PG: refund
    alt success
        PG-->>API: refundId
        API->>DB: refund COMPLETED, return REFUNDED
        API->>DB: restock inventory
    else failure
        API->>DB: refund FAILED — queued for retry
        Note over API: never silently lose a refund;<br/>alert + manual queue
    end
```
