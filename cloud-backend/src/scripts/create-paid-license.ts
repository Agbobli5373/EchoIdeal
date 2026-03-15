import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { randomLicenseKey } from "../lib/crypto.js";
import { licenseKeyHash, licenseKeyLast4 } from "../lib/license.js";
import { endOfUtcMonth, startOfUtcMonth } from "../lib/period.js";

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const inputKey = process.argv[2];
  const licenseKey =
    inputKey && inputKey.trim().length ? inputKey.trim() : randomLicenseKey();

  const plan = await prisma.plan.findFirst({ orderBy: { createdAt: "asc" } });
  if (!plan) {
    throw new Error("No plan found. Run migrations + seed first.");
  }

  const now = new Date();

  await prisma.license.create({
    data: {
      licenseKeyHash: licenseKeyHash(licenseKey),
      licenseKeyLast4: licenseKeyLast4(licenseKey),
      type: "paid",
      status: "active",
      planId: plan.id,
      currentPeriodStart: startOfUtcMonth(now),
      currentPeriodEnd: endOfUtcMonth(now),
    },
  });

  console.log(licenseKey);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

