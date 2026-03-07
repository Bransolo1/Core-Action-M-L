# Core Action ML — Inventory Forecast Tool

> AI-powered inventory forecasting and purchase order optimisation for action sports distribution.
> Built for **Core Action Sports** — *Born and raised in skateparks, we make products for riders by riders.* **#RIDECORE**

---

## Download & Run — 3 Steps

### Step 1 — Download

Click the green **Code** button → **Download ZIP**, then unzip it anywhere on your computer.

Or grab it directly:

```
https://github.com/Bransolo1/Core-Action-M-L/archive/refs/heads/main.zip
```

---

### Step 2 — Run

**Mac / Linux** — open Terminal, drag the unzipped folder in, then run:

```bash
./start.sh
```

**Windows** — double-click `start.bat`

> The script **automatically downloads and installs Node.js** if you don't have it.
> Nothing else to install — no Docker, no database server, nothing.

---

### Step 3 — Open the app

The app opens automatically at **http://localhost:3000**

**Default login:**
| | |
|---|---|
| Email | `admin@ridecore.pro` |
| Password | `CoreAction2026!` |

> Change your password in Settings after first login.

---

## What It Does

| Feature | Description |
|---------|-------------|
| **Stockout-Adjusted Forecasting** | Velocity from in-stock days only — stockout gaps never dilute demand signals |
| **Seasonal Uplift** | Monthly multipliers per product category — fully configurable |
| **New-to-Market Prediction** | Estimates velocity from analogous SKUs or category averages with confidence ranges |
| **Volumetric Planning** | Box dimension tracking for carton volume, warehouse space, and freight |
| **Cost + Margin Layer** | Cost price, landed cost (with duty/freight factor), RRP, gross margin per SKU |
| **Purchase Order Builder** | AI-suggested POs with automatic budget optimisation sorted by profitability |
| **Shopify Integration** | Auto-import products and order history — or receive live updates via webhook |
| **Veeqo Integration** | Auto-import products, cost prices, and sales from your warehouse system |
| **AI Buying Insights** | Claude AI analyses each forecast and PO — flags risks, opportunities, and actions |

---

## Connecting Shopify & Veeqo

Go to **Integrations** in the sidebar after logging in.

- Enter your API credentials (shown with step-by-step instructions)
- Click **Test Connection** to verify, then **Save**
- Click **Sync Now** to import your full product catalogue and order history
- Set up the Shopify webhook for live order data (URL and instructions shown in the app)

---

## Workflow

```
1. Integrations  → Connect Shopify/Veeqo to auto-fill products and sales
2. Products      → Review imported SKUs, add costs, box dimensions
3. Sales History → Check imported sales periods, mark stockouts
4. Settings      → Configure order cycles, seasonal factors, budget
5. Forecasting   → Run a forecast for your next order window
6. Purchase Orders → Generate PO, apply budget optimisation, export
```

---

## Key Concept: Stockout Correction

Standard sell-through rates ignore when you ran out of stock, causing **underestimated reorders**. This tool corrects for it:

| Scenario | Standard method | This tool |
|----------|-----------------|-----------|
| 100 units sold in 30 in-stock days (90-day window) | Orders 100 units | Velocity = 3.33/day → orders 300 units |

Always record **actual in-stock days** when entering a sales period with stockouts.

---

## Tech Stack

- **Next.js 14** (App Router) + **TypeScript**
- **SQLite** via Prisma — embedded database, no server needed
- **Tailwind CSS** with Core Action Sports brand tokens
- **Recharts** for data visualisation
- **Claude Sonnet** via Anthropic SDK for AI insights
- **NextAuth.js** for authentication (ADMIN / BUYER / VIEWER roles)

---

## Advanced Setup

### PostgreSQL (for teams / production)

1. Change `provider = "sqlite"` to `provider = "postgresql"` in `prisma/schema.prisma`
2. Update `DATABASE_URL` in `.env.local` to your PostgreSQL connection string
3. Run `npx prisma db push` to set up the schema

### Docker

```bash
# Copy and edit the env file
cp .env.local.example .env.local

# Build and run (SQLite, embedded — no database server needed)
docker compose up --build
```

### Environment Variables

Copy `.env.local.example` to `.env.local` and fill in:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | `file:./local.db` (SQLite) or PostgreSQL URL |
| `NEXTAUTH_SECRET` | Yes | Random string — generate with `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Yes | Your app URL, e.g. `http://localhost:3000` |
| `ANTHROPIC_API_KEY` | No | For AI insights — free at console.anthropic.com |
| `SHOPIFY_STORE_DOMAIN` | No | Can also be set in the app UI |
| `SHOPIFY_ACCESS_TOKEN` | No | Can also be set in the app UI |
| `VEEQO_API_KEY` | No | Can also be set in the app UI |

---

## Development

```bash
npm run dev          # Dev server
npm run build        # Production build
npm run test         # Unit tests (Vitest)
npm run lint         # ESLint
npm run type-check   # TypeScript check
npm run db:studio    # Prisma Studio (visual DB browser)
```

---

## Project Structure

```
app/            Next.js pages + API routes
components/     React components (layout, UI, features)
lib/            Core algorithms (forecasting, costs, volumetrics, Shopify, Veeqo)
prisma/         Database schema + seed data
store/          Global React Context state
types/          TypeScript definitions
```

See [CLAUDE.md](./CLAUDE.md) for full architecture details.

---

## Roadmap

- [x] Stockout-adjusted velocity forecasting
- [x] Seasonal uplift factors per category
- [x] New-to-market product prediction
- [x] Purchase order builder with budget optimisation
- [x] Shopify integration (product + order sync + live webhook)
- [x] Veeqo integration (product + order sync)
- [x] AI buying insights (Claude)
- [x] PDF + CSV export
- [x] Multi-user authentication (ADMIN / BUYER / VIEWER)
- [x] Analytics (ABC analysis, GMROI, weeks of cover)
- [ ] Multi-supplier PO splitting
- [ ] Email notifications (PO confirmed, forecast ready)
- [ ] Size curve distribution for apparel/footwear

---

*Built with love for riders, by riders. #RIDECORE*
