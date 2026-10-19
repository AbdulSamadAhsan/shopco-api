# SHOP.CO E-commerce API

Node.js 24 e-commerce API for catalog, cart, orders, reviews, coupons, and Stripe payments.

[Live deployment](https://shopco-api-psi.vercel.app)

## Overview

- Catalog, category, and brand routes
- Authenticated and guest carts
- Orders, coupons, reviews, and newsletter services
- Stripe payment integration
- Node.js test suite

## Stack

Express, MongoDB / Mongoose, Stripe.

## Run locally

Requires Node.js `24.x`.

```bash
git clone https://github.com/AbdulSamadAhsan/shopco-api.git
cd shopco-api
npm install
```

Copy `.env.example` to `.env` and configure the values for your local environment before starting. Use your own database credentials and freshly generated secrets.

```bash
npm run dev
```

Use the local URL printed by the development server.

## Available checks

| Command | Script |
| --- | --- |
| `npm run test` | `node --test` |

These commands are defined by the project; documentation updates do not imply they have been run.

## Author

[Syed Abdul Samad Ahsan](https://github.com/AbdulSamadAhsan)
