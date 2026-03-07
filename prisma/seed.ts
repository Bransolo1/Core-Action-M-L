/**
 * Database seed — CORE Action Sports defaults.
 * Run with: npm run db:seed
 *
 * Default credentials (CHANGE AFTER FIRST LOGIN):
 *   Email:    admin@ridecore.pro
 *   Password: CoreAction2026!
 *
 * Seeds:
 *  - Admin user
 *  - AppSettings (GBP, CORE seasonal configs, buying calendar order cycles)
 *  - 4 x OrderCycle entries for the standard CORE buying calendar
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ─── Seasonal Uplift Factors ─────────────────────────────────────────────────
// Keys are month numbers (1–12). Values are demand multipliers (1.0 = average).
// Calibrated to CORE Action Sports' UK/EU sales patterns.

const SEASONAL_CONFIGS = [
  {
    category: "Scooters",
    factors: {
      "1": 0.50, // Jan  — post-Christmas slump
      "2": 0.60, // Feb
      "3": 1.00, // Mar  — schools return, spring activity
      "4": 1.30, // Apr  — Easter spike
      "5": 1.20, // May
      "6": 1.40, // Jun  — summer building
      "7": 1.50, // Jul  — peak summer
      "8": 1.30, // Aug  — back to school prep
      "9": 0.90, // Sep
      "10": 1.00, // Oct — half-term
      "11": 1.60, // Nov — Black Friday / Christmas build
      "12": 2.50, // Dec — peak Christmas gifting
    },
  },
  {
    category: "Scooter Parts",
    factors: {
      "1": 0.60,
      "2": 0.70,
      "3": 1.00,
      "4": 1.10,
      "5": 1.20,
      "6": 1.40,
      "7": 1.50,
      "8": 1.30,
      "9": 0.90,
      "10": 1.00,
      "11": 1.20,
      "12": 1.80, // parts less gift-driven than completes
    },
  },
  {
    category: "Protection",
    factors: {
      "1": 0.50,
      "2": 0.60,
      "3": 1.00,
      "4": 1.20, // Easter — new riders need protection
      "5": 1.20,
      "6": 1.30,
      "7": 1.40,
      "8": 1.20,
      "9": 0.90,
      "10": 0.90,
      "11": 1.40,
      "12": 2.20, // helmets/pads gifted with scooters
    },
  },
  {
    category: "Skate",
    factors: {
      "1": 0.50,
      "2": 0.60,
      "3": 0.90,
      "4": 1.10,
      "5": 1.30,
      "6": 1.60, // peak summer — skate parks are outdoor
      "7": 1.70,
      "8": 1.50,
      "9": 0.90,
      "10": 0.80,
      "11": 1.00,
      "12": 1.40,
    },
  },
  {
    category: "Skateboard",
    factors: {
      "1": 0.50,
      "2": 0.60,
      "3": 0.90,
      "4": 1.10,
      "5": 1.30,
      "6": 1.60,
      "7": 1.70,
      "8": 1.50,
      "9": 0.90,
      "10": 0.80,
      "11": 1.00,
      "12": 1.40,
    },
  },
  {
    category: "Kids",
    factors: {
      "1": 0.40,
      "2": 0.50,
      "3": 0.90,
      "4": 1.50, // Easter — huge for kids gifting
      "5": 0.80,
      "6": 1.00,
      "7": 1.20,
      "8": 0.90,
      "9": 0.60,
      "10": 0.80,
      "11": 2.00,
      "12": 3.00, // #1 Christmas gifting category
    },
  },
  {
    category: "Accessories",
    factors: {
      "1": 0.50,
      "2": 0.60,
      "3": 0.90,
      "4": 1.00,
      "5": 1.20,
      "6": 1.40,
      "7": 1.50,
      "8": 1.30,
      "9": 0.90,
      "10": 0.90,
      "11": 1.50,
      "12": 1.80,
    },
  },
  {
    category: "Bike",
    factors: {
      "1": 0.60,
      "2": 0.70,
      "3": 1.00,
      "4": 1.10,
      "5": 1.20,
      "6": 1.30,
      "7": 1.40,
      "8": 1.20,
      "9": 0.90,
      "10": 0.90,
      "11": 1.10,
      "12": 1.30,
    },
  },
];

// ─── Buying Calendar ──────────────────────────────────────────────────────────
// Standard 4-cycle buying calendar for UK action sports retail.
// Budgets are in pence (GBP cents). Adjust to actual budget in Settings after onboarding.

const ORDER_CYCLES = [
  {
    id: "cycle-christmas-2026",
    name: "Christmas 2026",
    type: "Q3",
    orderDate: "2026-08-01",
    expectedDeliveryDate: "2026-10-01",
    seasonStart: "2026-11-01",
    seasonEnd: "2026-12-31",
    budgetCents: 3_500_000, // £35,000 — largest cycle (~35% annual budget)
    maxVolumeCBM: 80,
    isActive: true,
  },
  {
    id: "cycle-spring-2027",
    name: "Spring / Easter 2027",
    type: "Q4",
    orderDate: "2026-11-01",
    expectedDeliveryDate: "2027-01-15",
    seasonStart: "2027-03-01",
    seasonEnd: "2027-04-30",
    budgetCents: 2_000_000, // £20,000 — ~20% annual budget
    maxVolumeCBM: 45,
    isActive: true,
  },
  {
    id: "cycle-summer-2027",
    name: "Summer 2027",
    type: "Q1",
    orderDate: "2027-02-01",
    expectedDeliveryDate: "2027-04-01",
    seasonStart: "2027-05-01",
    seasonEnd: "2027-08-31",
    budgetCents: 3_000_000, // £30,000 — ~30% annual budget
    maxVolumeCBM: 70,
    isActive: true,
  },
  {
    id: "cycle-autumn-2027",
    name: "Autumn Top-Up 2027",
    type: "Q2",
    orderDate: "2027-05-15",
    expectedDeliveryDate: "2027-07-15",
    seasonStart: "2027-09-01",
    seasonEnd: "2027-10-31",
    budgetCents: 1_500_000, // £15,000 — ~15% annual budget
    maxVolumeCBM: 35,
    isActive: true,
  },
];

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function main() {
  const defaultEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@ridecore.pro";
  const defaultPassword = process.env.SEED_ADMIN_PASSWORD ?? "CoreAction2026!";

  // Admin user
  const passwordHash = await bcrypt.hash(defaultPassword, 12);
  const admin = await prisma.user.upsert({
    where: { email: defaultEmail },
    update: {},
    create: {
      email: defaultEmail,
      name: "Admin",
      passwordHash,
      role: "ADMIN",
    },
  });
  console.log(`✓ Admin user: ${admin.email}`);

  // AppSettings
  await prisma.appSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      businessName: "Core Action Sports",
      currency: "GBP",
      defaultLandedCostFactor: 1.15,
      targetGrossMarginPct: 50,
      defaultForecastWindowDays: 90,
      orderCycles: JSON.stringify(ORDER_CYCLES),
      seasonalConfigs: JSON.stringify(SEASONAL_CONFIGS),
    },
  });
  console.log("✓ AppSettings: GBP, 8 seasonal configs, 4 order cycles");

  // OrderCycle table entries
  for (const cycle of ORDER_CYCLES) {
    await prisma.orderCycle.upsert({
      where: { id: cycle.id },
      update: {},
      create: cycle,
    });
  }
  console.log(`✓ ${ORDER_CYCLES.length} order cycles seeded`);

  console.log("\n⚠  Change the default password after first login!");
  console.log("   Email:    " + defaultEmail);
  console.log("   Password: CoreAction2026!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
