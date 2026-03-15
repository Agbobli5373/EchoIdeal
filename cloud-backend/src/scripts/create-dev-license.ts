import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { randomLicenseKey } from "../lib/crypto.js";
import { licenseKeyHash, licenseKeyLast4 } from "../lib/license.js";

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const inputKey = process.argv[2];
  const licenseKey = inputKey && inputKey.trim().length ? inputKey.trim() : randomLicenseKey();

  const plan = await prisma.plan.findFirst({ orderBy: { createdAt: "asc" } });
  if (!plan) {
    throw new Error("No plan found. Run migrations + seed first.");
  }

  await prisma.license.create({
    data: {
      licenseKeyHash: licenseKeyHash(licenseKey),
      licenseKeyLast4: licenseKeyLast4(licenseKey),
      type: "dev",
      status: "active",
      planId: plan.id,
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
