# Core Action ML — Inventory Forecast Tool

> AI-powered inventory forecasting and purchase order optimisation for action sports distribution.
> Built for **Core Action Sports** — *Born and raised in skateparks, we make products for riders by riders.* #RIDECORE

---

## What It Does

Core Action ML helps action sports buyers make data-driven purchasing decisions:

| Feature | Description |
|---------|-------------|
| **Stockout-Adjusted Forecasting** | Velocity calculated from in-stock days only — stockout periods never dilute demand signals |
| **Seasonal Uplift** | Monthly multipliers per product category (configurable) |
| **New-to-Market Prediction** | Estimates velocity from analogous SKUs or category averages with ±30% confidence range |
| **Volumetric Planning** | Box dimension tracking for carton volume, warehouse space, and freight calculations |
| **Cost + Revenue Layer** | Cost price, landed cost (with duty/freight factor), RRP, gross margin per SKU |
| **Purchase Order Generation** | AI-suggested POs with automatic budget optimisation sorted by profitability |
| **Order Cycle Management** | Quarterly cycles or ad-hoc orders with configurable dates and budget caps |
| **AI Buying Insights** | Claude AI analyses each forecast/PO and flags risks, opportunities, and actions |

---

## Getting Started

### Prerequisites

- Node.js 18+
- An [Anthropic API key](https://console.anthropic.com) (for AI insights)

### Install

```bash
git clone https://github.com/Bransolo1/Core-Action-M-L
cd Core-Action-M-L
npm install
cp .env.local.example .env.local
# Edit .env.local and add your ANTHROPIC_API_KEY
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Workflow

```
1. Products      → Add SKUs with costs, landed cost factor, box dimensions
2. Sales History → Record historical periods (with actual in-stock days)
3. Settings      → Set up order cycles, seasonal factors, budget
4. Forecasting   → Run a forecast for your order window
5. Purchase Orders → Generate a PO, apply budget optimisation, export CSV
```

### Key Concept: Stockout Correction

Standard sell-through ignores stockout periods, underestimating demand. Example:

| Scenario | Standard | Adjusted |
|----------|---------|---------|
| 100 units in, 100 sold in 30/90 days | STR = 100% | Velocity = 3.33/day, Demand = 300 units |

Always enter **actual in-stock days** when recording a period with stockouts.

---

## Tech Stack

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS** with Core Action Sports brand tokens
- **Recharts** for data visualisation
- **Claude Sonnet** (`claude-sonnet-4-6`) via Anthropic SDK for AI insights
- **localStorage** for client-side data persistence (MVP)
- **Vitest** + React Testing Library for unit tests

---

## Development

```bash
npm run dev          # Dev server
npm run build        # Production build
npm run test         # Unit tests
npm run lint         # ESLint
npm run type-check   # TypeScript check
```

See [CLAUDE.md](./CLAUDE.md) for full architecture and AI assistant conventions.

---

## Project Structure

```
app/            Next.js pages and API routes
components/     React components (layout, UI primitives, feature components)
lib/            Core algorithms (forecasting, costs, volumetrics, AI)
store/          Global React Context + localStorage state
types/          TypeScript type definitions
```

---

## Roadmap

- [ ] Multi-supplier PO splitting
- [ ] Shopify / WooCommerce sales data import
- [ ] PDF purchase order export
- [ ] Size curve distribution (for apparel/footwear)
- [ ] Supplier lead time tracking
- [ ] Team collaboration (shared state via backend DB)

---

*Built on the model established by [SenseHub AutoML](https://github.com/Bransolo1/model-muse) — fully local, privacy-first, no external data transmission beyond AI inference.*
