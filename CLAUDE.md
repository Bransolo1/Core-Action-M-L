# CLAUDE.md — Core Action ML: Inventory Forecast Tool

## Project Overview

**Core Action ML** is an AI-powered inventory forecasting and purchase order optimisation tool built for Core Action Sports (ridecore.pro). It helps action-sports buyers make data-driven purchasing decisions by:

- Forecasting sell-through rates corrected for stockout periods
- Applying seasonal uplift factors per product category
- Generating AI-assisted purchase order suggestions within budget constraints
- Planning warehouse space via volumetric (box dimension) forecasting
- Predicting new-to-market product performance from analogous SKUs
- Prioritising orders by profitability when budget is constrained

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS + CSS custom properties |
| Charts | Recharts |
| AI Integration | Anthropic Claude API (`@anthropic-ai/sdk`) |
| State / Persistence | React Context + localStorage (MVP) |
| Testing | Vitest + React Testing Library |
| Linting | ESLint + Prettier |

---

## Repository Structure

```
Core-Action-M-L/
├── CLAUDE.md                  # This file
├── README.md
├── package.json
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── .env.local.example         # Required env vars template
│
├── app/                       # Next.js App Router
│   ├── layout.tsx             # Root layout (fonts, providers)
│   ├── page.tsx               # Landing / redirect to dashboard
│   ├── globals.css            # Brand tokens, base styles
│   ├── dashboard/page.tsx     # KPI overview
│   ├── products/page.tsx      # Product catalogue + dimensions + costs
│   ├── sales/page.tsx         # Historical sales with stockout tracking
│   ├── forecasting/page.tsx   # Forecasting engine UI
│   ├── purchase-orders/page.tsx # PO builder + budget optimiser
│   ├── settings/page.tsx      # Order cycles, seasonal factors, budget
│   └── api/
│       ├── forecast/route.ts  # POST — run forecast engine
│       ├── purchase-order/route.ts # POST — generate/optimise PO
│       └── ai-suggest/route.ts # POST — Claude AI suggestions
│
├── components/
│   ├── layout/
│   │   ├── Header.tsx
│   │   ├── Sidebar.tsx
│   │   └── PageWrapper.tsx
│   ├── ui/                    # Reusable primitives (Button, Card, Badge…)
│   ├── dashboard/
│   │   ├── KPICard.tsx
│   │   └── ForecastSummaryChart.tsx
│   ├── products/
│   │   ├── ProductTable.tsx
│   │   └── ProductForm.tsx
│   ├── sales/
│   │   ├── SalesTable.tsx
│   │   └── StockoutBadge.tsx
│   ├── forecasting/
│   │   ├── SeasonalMatrix.tsx
│   │   ├── ForecastResults.tsx
│   │   └── NewProductPredictor.tsx
│   └── purchase-orders/
│       ├── POLineItems.tsx
│       └── BudgetOptimiser.tsx
│
├── lib/
│   ├── forecasting.ts         # Stockout-adjusted STR, seasonal uplift
│   ├── volumetrics.ts         # Box dimension calculations
│   ├── costs.ts               # Landed cost, margin, revenue forecast
│   ├── purchase-order.ts      # PO generation + budget optimisation
│   ├── seasonal.ts            # Monthly uplift factor helpers
│   ├── new-product.ts         # New SKU velocity prediction
│   └── anthropic.ts           # Claude API client wrapper
│
├── store/
│   └── app-store.tsx          # React Context global state + localStorage sync
│
└── types/
    ├── product.ts
    ├── sales.ts
    ├── forecast.ts
    └── purchase-order.ts
```

---

## Brand & Design Conventions

### Colours (Core Action Sports)

```css
--color-brand-red:    #E30713;  /* Primary CTA, logo accent */
--color-brand-black:  #0A0A0A;  /* Navigation, headings */
--color-brand-white:  #FFFFFF;  /* Backgrounds, text on dark */
--color-brand-gray:   #F4F4F4;  /* Surface backgrounds */
--color-brand-dark-gray: #6B6B6B; /* Secondary text */
--color-success:      #22C55E;
--color-warning:      #F59E0B;
--color-danger:       #EF4444;
```

### Typography

- **Font**: Barlow (Google Fonts) — weights 400, 500, 600, 700, 800
- Headings: `font-barlow font-700 tracking-tight`
- Body: `font-barlow font-400`
- Numbers/data: `font-mono` (tabular figures)

### UI Style

- **Border radius**: `rounded-none` on primary CTAs (aggressive/angular, brand-aligned)
- **Cards**: `rounded-sm` with subtle shadow
- **Tables**: tight, data-dense with alternating row shading
- High-contrast: dark sidebar, white content area
- Red accent for key metrics and primary actions only

---

## Key Domain Concepts

### Stockout-Adjusted Sell-Through Rate (STR)

Standard STR ignores stockout periods, leading to **underestimated demand**. This tool uses:

```
Daily Velocity = Units Sold / In-Stock Days
Adjusted Annual Demand = Daily Velocity × 365
Adjusted STR = Units Sold / (Daily Velocity × Total Period Days)
```

**Example**: 100 units received, sold out in 30 days within a 90-day period.
- Standard STR = 100/100 = 100% (correct but ignores lost demand)
- Daily velocity = 100/30 = 3.33 units/day
- Lost demand = 3.33 × 60 = 200 units
- True 90-day demand = 300 units → reorder quantity target = 300

### Seasonal Uplift

Monthly multipliers applied to base velocity. Configurable per category in Settings. Example:

| Month | Multiplier |
|-------|-----------|
| Dec   | 2.0×      |
| Jan   | 0.6×      |
| Jul   | 1.4×      |

### Order Cycles

Default: 4 cycles per year (quarterly). Each cycle has:
- Order date
- Expected delivery / in-stock date
- Season window (start → end)
- Budget cap

Ad-hoc orders can be created outside the cycle schedule.

### New-to-Market Products

For products with no history, prediction is based on:
1. Category average velocity (adjusted for seasonality)
2. Price-tier comparison (similar RRP products)
3. AI-assisted confidence range via Claude API

### Budget Optimisation

When a total PO value exceeds budget, lines are sorted by **gross margin %** descending and trimmed from the bottom. Users can override priority manually.

---

## Development Workflow

### Setup

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.local.example .env.local
# Add your ANTHROPIC_API_KEY

# Run dev server
npm run dev
```

### Key Scripts

```bash
npm run dev          # Next.js dev server (port 3000)
npm run build        # Production build
npm run lint         # ESLint
npm run format       # Prettier
npm run test         # Vitest unit tests
npm run type-check   # tsc --noEmit
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Claude API key for AI suggestions |

---

## API Routes

### `POST /api/forecast`

**Body**:
```json
{
  "productId": "string",
  "periodDays": 90,
  "seasonalFactors": { "1": 0.8, "2": 0.9, ... }
}
```
**Returns**: Adjusted STR, daily velocity, projected demand by month.

### `POST /api/purchase-order`

**Body**:
```json
{
  "products": [...],
  "orderCycle": { "startDate": "...", "endDate": "..." },
  "budget": 50000,
  "maxVolumeCBM": 20
}
```
**Returns**: Suggested PO lines, total cost, total revenue forecast, profitability-ranked fallback within budget.

### `POST /api/ai-suggest`

Calls Claude to provide narrative insights on the forecast, flag anomalies, and suggest adjustments. Returns markdown text.

---

## Testing

- Unit tests for all `lib/` functions (forecasting, volumetrics, costs)
- Component tests for key UI flows
- Run: `npm run test`

---

## Conventions for AI Assistants

1. **Never mutate state directly** — use the store actions from `store/app-store.tsx`
2. **All monetary values in cents (integers)** internally; display layer formats to currency
3. **All dates as ISO 8601 strings** (`"YYYY-MM-DD"`)
4. **Dimensions in millimetres** internally; display layer converts to cm/in
5. **Stockout days must always be excluded** from velocity calculations — see `lib/forecasting.ts`
6. **Seasonal factors are stored per category**, not per product; inherit from category unless product-level override exists
7. **Budget optimisation** runs server-side in `/api/purchase-order` — do not reimplement on the client
8. **Claude API calls** must go through `lib/anthropic.ts` wrapper — never instantiate the client directly in components
9. Use `font-mono` class for all numeric data cells in tables
10. New pages go in `app/` following Next.js App Router conventions with a `page.tsx` file
