/**
 * Database seed — creates the default admin user.
 * Run with: npm run db:seed
 *
 * Default credentials (CHANGE AFTER FIRST LOGIN):
 *   Email:    admin@ridecore.pro
 *   Password: CoreAction2026!
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const defaultEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@ridecore.pro";
  const defaultPassword = process.env.SEED_ADMIN_PASSWORD ?? "CoreAction2026!";

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

  // Ensure AppSettings singleton exists
  await prisma.appSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      businessName: "Core Action Sports",
      currency: "AUD",
      defaultLandedCostFactor: 1.15,
      targetGrossMarginPct: 50,
      defaultForecastWindowDays: 90,
      orderCycles: "[]",
      seasonalConfigs: "[]",
    },
  });

  console.log(`✓ Admin user created/verified: ${admin.email}`);
  console.log("⚠  Change the default password after first login!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
