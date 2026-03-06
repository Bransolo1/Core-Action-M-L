# Core Action ML — Inventory Forecast Tool

> AI-powered inventory forecasting and purchase order optimisation for action sports distribution.
> Built for **Core Action Sports** — *Born and raised in skateparks, we make products for riders by riders.* #RIDECORE

---

## Quick Start (3 minutes)

**You need:** [Node.js 18+](https://nodejs.org) — download the **LTS** version and install it. That's it.

### 1. Download

[**⬇ Download ZIP**](https://github.com/Bransolo1/Core-Action-M-L/archive/refs/heads/main.zip) → Unzip it anywhere on your computer.

### 2. Run

**Mac / Linux** — open Terminal in the folder and run:
```bash
./start.sh
```

**Windows** — double-click:
```
start.bat
```

### 3. Use

Your browser opens to **http://localhost:3000**. Log in with:

| | |
|---|---|
| **Email** | `admin@ridecore.pro` |
| **Password** | `CoreAction2026!` |

> The script handles everything automatically: installs dependencies, creates the database, seeds your admin account. No Docker, no database servers, no configuration.

---

## How to Get Your Data In

The tool needs two things: your **product catalogue** and your **sales history**. Both can be uploaded from CSV spreadsheets.

### Step 1 → Import Products

1. Go to **Import Data** in the sidebar
2. Select the **Products** tab
3. Click **Download Template** — opens a pre-filled CSV in Excel/Google Sheets
4. Replace the example rows with your products:

| Column | Required | Example | Notes |
|--------|----------|---------|-------|
| SKU | ✅ | `DECK-8-PRO` | Must be unique |
| Product Name | ✅ | `Pro Street Deck 8.0` | |
| Category | ✅ | `Skateboarding` | Used for seasonal grouping |
| RRP | ✅ | `89.95` | Retail price in dollars |
| Cost Price | ✅ | `35.00` | Ex-works cost in dollars |
| Landed Cost Factor | | `1.15` | Default 1.15 (15% freight/duty) |
| Units Per Carton | | `10` | Default 1 |
| Min Order Qty | | `1` | Default 1 |
| Lead Time Days | | `14` | Default 0 |
| Active | | `Yes` | Default Yes |
| New To Market | | `No` | Default No |

5. Save as CSV → Upload → Review the preview → **Confirm Import**

### Step 2 → Import Sales History

1. Go to **Import Data** → select the **Sales History** tab
2. Click **Download Template**
3. Fill in your historical sales periods:

| Column | Required | Example | Notes |
|--------|----------|---------|-------|
| SKU | ✅ | `DECK-8-PRO` | Must match an imported product |
| Period Start | ✅ | `2024-07-01` | YYYY-MM-DD format |
| Period End | ✅ | `2024-09-30` | |
| Units Received | | `100` | Stock received at start of period |
| Units Sold | ✅ | `100` | Total units sold in the period |
| In Stock Days | ⚠️ | `35` | **Critical** — see below |
| Opening Stock | | `100` | Stock at start |
| Closing Stock | | `0` | Stock at end |
| Had Stockout | | `Yes` | Did stock run out? |
| Notes | | `Sold out fast` | Free text |

4. Save as CSV → Upload → Review → **Confirm Import**

> **⚠️ Why "In Stock Days" matters:**
>
> If a product sold out halfway through a quarter, standard forecasting assumes it was available the entire time — massively underestimating demand. Core Action ML corrects for this.
>
> **Example:** 100 units sold in 35 out of 92 days = velocity of 2.86/day, not 1.09/day. The corrected annual demand is **1,043 units**, not 397.
>
> If you don't know exact in-stock days, estimate conservatively. Even a rough number is far better than assuming full availability.

### Alternative: Shopify / WooCommerce Import

If you sell through Shopify or WooCommerce, you can import order data directly:

1. Export your orders as CSV from your platform admin
2. Go to **Import Data** → select **Shopify** or **WooCommerce** tab
3. Upload the CSV — the tool auto-groups orders by SKU per month
4. Review and confirm

> Products must already be imported with matching SKUs before importing sales data.

### Step 3 → Run a Forecast

1. Go to **Forecasting** in the sidebar
2. Enter a name (e.g. "Q3 2026 Forecast"), set your date window
3. Click **Run Forecast**
4. Review the results: monthly projections, revenue, cost, gross margin
5. Expand any product row to see the month-by-month breakdown with seasonal factors

### Step 4 → Generate Purchase Orders

1. Go to **Purchase Orders** in the sidebar
2. Select a forecast and order cycle
3. The tool generates PO line items, sorted by profitability
4. If the total exceeds your budget, it automatically optimises — highest margin products first

---

## What It Does

| Feature | Description |
|---------|-------------|
| **Stockout-Adjusted Forecasting** | Velocity calculated from in-stock days only — stockout periods never dilute demand signals |
| **Seasonal Uplift** | Monthly multipliers per product category (configurable in Settings) |
| **ABC Analysis** | Pareto ranking of products by revenue — identify your A, B, and C SKUs |
| **Weeks of Cover** | Dashboard KPI showing how long current stock will last at current velocity |
| **Reorder Alerts** | Automatic alerts when stock falls below reorder point |
| **Open-to-Buy Tracking** | Per-cycle OTB = budget minus POs already placed |
| **New-to-Market Prediction** | Estimates velocity from analogous SKUs or category averages (±30% range) |
| **Budget Optimisation** | Greedy knapsack algorithm ranks PO lines by gross margin % |
| **AI Buying Insights** | Claude AI analyses each forecast and flags risks, opportunities, actions |
| **Volumetric Planning** | Box dimensions, carton volumes, freight weight calculations |
| **CSV Import/Export** | Drag-and-drop CSV import with downloadable templates |

---

## Workflow

```
Products  →  Sales History  →  Settings  →  Forecasting  →  Purchase Orders
   ↑              ↑                              ↓
   └── CSV ───────┘                        ABC Analysis
                                           Reorder Alerts
                                           Weeks of Cover
```

1. **Products** — Your SKU catalogue with costs, landed cost factor, box dimensions
2. **Sales History** — Historical periods (crucially: actual in-stock days for stockout correction)
3. **Settings** — Order cycles, seasonal uplift factors, budget caps
4. **Forecasting** — Run a forecast → see projected demand, revenue, margin by month
5. **Purchase Orders** — Generate POs from forecasts, auto-optimise within budget
6. **ABC Analysis** — See which products drive 80% of your revenue
7. **Dashboard** — KPIs at a glance: revenue, stockout rate, weeks of cover, reorder alerts

---

## Configuration

### Seasonal Factors

Go to **Settings → Seasonal Uplift Factors**. The default preset uses Australian action sports seasonality:

| Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec |
|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|
| 0.7× | 0.8× | 0.9× | 1.0× | 0.9× | 1.1× | 1.3× | 1.0× | 1.0× | 1.1× | 1.3× | 1.8× |

You can add category-specific overrides (e.g. Apparel may peak differently to Skateboarding).

### Order Cycles

Go to **Settings → Order Cycles** to configure quarterly or ad-hoc buying cycles with dates and budget caps.

### AI Insights (Optional)

To enable AI-powered buying insights, get a free API key from [console.anthropic.com](https://console.anthropic.com) and enter it when prompted by `start.sh`, or add it to `.env.local`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

---

## Tech Stack

- **Next.js 14** (App Router) + **TypeScript**
- **SQLite** via Prisma (zero-config, file-based database)
- **Tailwind CSS** with Core Action Sports brand tokens
- **Recharts** for data visualisation
- **Claude Sonnet** via Anthropic SDK (optional, for AI insights)
- **Vitest** + React Testing Library for unit tests

---

## Development

```bash
npm install          # Install dependencies
npm run dev          # Dev server (http://localhost:3000)
npm run test         # Unit tests (73 tests)
npm run type-check   # TypeScript check
npm run lint         # ESLint
```

See [CLAUDE.md](./CLAUDE.md) for full architecture and AI assistant conventions.

---

## Project Structure

```
app/              Next.js pages and API routes
components/       React components (layout, UI primitives, feature modules)
lib/              Core algorithms (forecasting, costs, volumetrics, import, AI)
store/            Global React Context + localStorage + DB sync
types/            TypeScript type definitions
data/templates/   Downloadable CSV templates for import
prisma/           Database schema and seed script
```

---

*Fully local, privacy-first — no data leaves your machine except optional AI inference calls to Anthropic.*
