# SHOP.CO API

Node.js 24, Express 5 and MongoDB/Mongoose backend for F:\shopco-react.
Uses CommonJS (require and module.exports) and the folder structure of F:\shopapi.

## Structure

- server.js: starts the server.
- server.js: configures middleware, mounts routes, and starts the server.
- config/: database, JWT settings and response helpers.
- routes/: URL definitions using express.Router().
- controllers/: request handling and JSON responses.
- services/: business logic, database access and checkout transactions.
- models/: Mongoose models, one per file.
- middleware/: authenticated-user access control only.
- views/: reserved; the user interface is in the React project.

## Run

Run npm install, then npm run dev (development) or npm start.
Set MONGO_URI, MONGO_DB_NAME, JWT_SECRET, PORT and CORS_ORIGINS in .env.
JWT_SECRET must contain at least 32 characters. The default port is 3000.
The local frontend setting is VITE_API_URL=http://localhost:3000/api.
Restart Vite after changing its environment.

The API exposes the customer routes listed below; system health and documentation routes are not included.

## Customer endpoints

| Method | Path under /api | Purpose |
|---|---|---|
| POST | /auth/register, /auth/login | Register or sign in; returns token and user |
| GET | /auth/me | Current authenticated user |
| POST | /users/register, /users/login | shopapi-compatible response format |
| GET | /products, /products/:id | Catalog and product details |
| GET | /categories, /categories/:id | Category records |
| GET | /brands, /brands/:id | Brand records |
| GET | /filters | Catalog filter values |
| GET, PUT, DELETE | /cart | Authenticated customer's cart |
| GET, PUT | /guest-cart | Guest cart; X-Cart-Token required |
| POST | /checkout/quote | Server-calculated prices and totals |
| POST | /orders | Place an authenticated order; Idempotency-Key required |
| GET | /orders, /orders/:id | Current customer's orders |
| GET, POST | /products/:id/reviews | Read reviews or submit an authenticated review |
| POST | /newsletter | Store email subscription with consent: true |

Authentication uses Authorization: Bearer <token>. Tokens expire after seven days.
Users can only read their own orders. Registration does not accept a role.
Catalog management and order-status management endpoints are not available.

Product filters: search, category, brand, style, color, size, minPrice, maxPrice,
featured, page, limit and sort (newest, price-asc, price-desc, rating, popular, name).
Responses use { success: true, data }; failures use { success: false, message, errors? }.

## Carts and checkout

Each cart item contains productId, quantity, size and color. Prices and inventory
come from MongoDB. Guest carts use a random 64-character hexadecimal X-Cart-Token;
only its hash is stored. Updates require the current revision and accept promoCode.

Orders accept items, shipping, optional promoCode and paymentMethod: cash_on_delivery.
Shipping contains firstName, lastName, email, phone, address, city, state, zip and country.
Send an Idempotency-Key of 8–100 characters; reuse the same key and body on retries.
Stock reservation and order creation are transactional, requiring MongoDB Atlas
or a replica set. Orders start pending and unpaid.

Amounts are USD; delivery is $15 per nonempty order. WELCOME20 discounts merchandise
by 20%. Card processing, refunds, tax, shipment integration and email delivery are
not implemented. The React checkout submission remains unconnected.

Sample catalog data is not seeded automatically. Existing database records are not migrated by code changes.

### Create an order

POST `/api/orders` with `Authorization: Bearer <token>`,
`Content-Type: application/json` and a unique `Idempotency-Key` header.
The key must contain 8–100 non-whitespace ASCII characters.

```json
{
  "items": [
    { "productId": "aaaaaaaaaaaaaaaaaaaaaaaa", "quantity": 2, "size": "M", "color": "Black" }
  ],
  "shipping": {
    "firstName": "Ada", "lastName": "Lovelace", "email": "ada@example.com",
    "phone": "123456789", "address": "1 Main Street", "city": "London",
    "state": "London", "zip": "12345", "country": "UK"
  },
  "promoCode": "WELCOME20",
  "paymentMethod": "cash_on_delivery"
}
```

Replace the example product ID and variants with an active catalog product.
Orders require 1–100 items, each with an integer quantity of 1–10000.
All shipping fields above are required strings of at most 200 characters.
Payment defaults to cash on delivery; other methods are rejected.
Client-supplied prices, totals, user IDs and statuses are ignored.

A new order returns HTTP 201 with `{ success: true, data: order }`.
A retry with the same key and normalized order details returns HTTP 200 without
another stock decrement. A changed request using that key returns HTTP 409.
Invalid input returns 400, missing/invalid authentication returns 401, and stock
conflicts return 409. Failures return `{ success: false, message }`.
Successful creation clears the authenticated user's cart in the same transaction.
Ensure the Order collection's unique `(user, idempotencyKey)` index exists before
serving checkout traffic (it is declared in the Mongoose model).

### Tests

Run `npm test` with Node.js 24. The suite exercises the real router, JWT middleware,
validation and checkout calculations with mocked database operations. It does not
require database credentials or change stored data. Verify real transaction rollback
and concurrent inventory updates separately against a MongoDB replica set.
