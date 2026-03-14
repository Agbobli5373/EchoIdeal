import type { PrismaClient } from "@prisma/client";
import Stripe from "stripe";
import { randomLicenseKey } from "../lib/crypto.js";
import { licenseKeyHash, licenseKeyLast4 } from "../lib/license.js";
import type { Env } from "../env.js";
import { AppError } from "./errors.js";

export type LicensingDeps = {
  prisma: PrismaClient;
  env: Env;
  stripe: Stripe | null;
};

export type ActivationInput = {
  license_key: string;
  instance_name: string;
  machine_id: string;
  app_version: string;
};

export type ActivateResult =
  | {
      activated: true;
      instance: { id: string; name: string; created_at: string };
      is_dev_license: boolean;
    }
  | {
      activated: false;
      error: string;
      is_dev_license: boolean;
    };

export type DeactivateResult = {
  activated: true;
  is_dev_license: boolean;
};

export type ValidateResult =
  | {
      is_active: true;
      last_validated_at: string;
      is_dev_license: boolean;
    }
  | {
      is_active: false;
      last_validated_at: null;
      is_dev_license: boolean;
    };

export function getStripe(env: Pick<Env, "STRIPE_SECRET_KEY">): Stripe | null {
  if (!env.STRIPE_SECRET_KEY) return null;
  return new Stripe(env.STRIPE_SECRET_KEY);
}

export async function createCheckoutSession(
  deps: LicensingDeps
): Promise<{ checkoutUrl: string }> {
  if (!deps.stripe || !deps.env.STRIPE_PRICE_ID) {
    throw new AppError("Stripe is not configured", 500);
  }
  const baseUrl = deps.env.APP_BASE_URL || "https://example.invalid";
  const successUrl =
    deps.env.CHECKOUT_SUCCESS_URL ||
    `${baseUrl.replace(/\/$/, "")}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl =
    deps.env.CHECKOUT_CANCEL_URL ||
    `${baseUrl.replace(/\/$/, "")}/checkout/cancel`;

  const generatedLicenseKey = randomLicenseKey();

  const session = await deps.stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: deps.env.STRIPE_PRICE_ID!, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
    metadata: {
      license_key: generatedLicenseKey,
      plan: "Pro",
    },
  });

  return { checkoutUrl: session.url ?? "" };
}

export async function getCheckoutSuccessLicenseKey(
  deps: LicensingDeps,
  sessionId: string
): Promise<string | null> {
  if (!deps.stripe) return null;
  const session = await deps.stripe.checkout.sessions.retrieve(sessionId);
  const licenseKey = (session.metadata as Record<string, unknown>)
    ?.license_key as string | undefined;
  return licenseKey ?? null;
}

export async function handleStripeWebhook(
  deps: LicensingDeps,
  rawBody: Buffer,
  signature: string
): Promise<void> {
  if (!deps.stripe || !deps.env.STRIPE_WEBHOOK_SECRET) {
    throw new AppError("Stripe webhook not configured", 500);
  }

  let event: Stripe.Event;
  try {
    event = deps.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      deps.env.STRIPE_WEBHOOK_SECRET
    );
  } catch {
    throw new AppError("Invalid signature", 400);
  }

  const upsertSubscriptionLicense = async (subscriptionId: string) => {
    const subscription = (await deps.stripe!.subscriptions.retrieve(
      subscriptionId
    )) as Stripe.Subscription & {
      current_period_start?: number;
      current_period_end?: number;
    };

    const status =
      subscription.status === "active" || subscription.status === "trialing"
        ? "active"
        : subscription.status === "past_due" ||
            subscription.status === "unpaid"
          ? "past_due"
          : "canceled";

    const currentPeriodStart =
      typeof subscription.current_period_start === "number"
        ? new Date(subscription.current_period_start * 1000)
        : null;
    const currentPeriodEnd =
      typeof subscription.current_period_end === "number"
        ? new Date(subscription.current_period_end * 1000)
        : null;

    await deps.prisma.license.updateMany({
      where: { stripeSubscriptionId: subscriptionId },
      data: {
        status: status as "active" | "past_due" | "canceled",
        currentPeriodStart,
        currentPeriodEnd,
      },
    });
  };

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const subscriptionId = session.subscription;
      const customerId = session.customer;

      const licenseKey = (session.metadata as Record<string, unknown>)
        ?.license_key as string | undefined;
      const planName =
        ((session.metadata as Record<string, unknown>)?.plan as string) ??
        "Pro";

      if (!subscriptionId || typeof subscriptionId !== "string") break;
      if (!licenseKey) break;

      const plan = await deps.prisma.plan.findUnique({
        where: { name: planName },
      });
      const fallbackPlan = plan ?? (await deps.prisma.plan.findFirst());
      if (!fallbackPlan) {
        throw new Error("No plans configured in database");
      }

      const email =
        (session.customer_details as { email?: string } | null)?.email ?? null;

      const customer =
        customerId && typeof customerId === "string"
          ? await deps.prisma.customer.upsert({
              where: { stripeCustomerId: customerId },
              update: { email },
              create: { stripeCustomerId: customerId, email },
            })
          : null;

      const existing = await deps.prisma.license.findUnique({
        where: { stripeSubscriptionId: subscriptionId },
      });
      if (existing) {
        await upsertSubscriptionLicense(subscriptionId);
        break;
      }

      const normalizedHash = licenseKeyHash(licenseKey);
      const last4 = licenseKeyLast4(licenseKey);

      const subscription = (await deps.stripe.subscriptions.retrieve(
        subscriptionId
      )) as Stripe.Subscription & {
        current_period_start?: number;
        current_period_end?: number;
      };

      await deps.prisma.license.create({
        data: {
          licenseKeyHash: normalizedHash,
          licenseKeyLast4: last4,
          type: "paid",
          status: "active",
          customerId: customer?.id ?? null,
          planId: fallbackPlan.id,
          stripeSubscriptionId: subscriptionId,
          currentPeriodStart:
            typeof subscription.current_period_start === "number"
              ? new Date(subscription.current_period_start * 1000)
              : null,
          currentPeriodEnd:
            typeof subscription.current_period_end === "number"
              ? new Date(subscription.current_period_end * 1000)
              : null,
        },
      });

      break;
    }
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      await upsertSubscriptionLicense(sub.id);
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await deps.prisma.license.updateMany({
        where: { stripeSubscriptionId: sub.id },
        data: { status: "canceled" },
      });
      break;
    }
    case "invoice.paid": {
      const invoice = event.data.object as { subscription?: unknown };
      const subscriptionId = invoice.subscription;
      if (subscriptionId && typeof subscriptionId === "string") {
        await upsertSubscriptionLicense(subscriptionId);
      }
      break;
    }
    default:
      break;
  }
}

export async function activateLicense(
  deps: LicensingDeps,
  input: ActivationInput
): Promise<ActivateResult> {
  const { license_key, instance_name, machine_id, app_version } = input;

  const license = await deps.prisma.license.findUnique({
    where: { licenseKeyHash: licenseKeyHash(license_key) },
    include: { plan: true },
  });

  if (!license || license.status !== "active") {
    return {
      activated: false,
      error: "Invalid or inactive license",
      is_dev_license: license?.type === "dev",
    };
  }

  const isDev = license.type === "dev";
  const now = new Date();

  await deps.prisma.machine.upsert({
    where: { machineId: machine_id },
    update: { lastSeenAt: now },
    create: {
      machineId: machine_id,
      firstSeenAt: now,
      lastSeenAt: now,
    },
  });

  const existing = await deps.prisma.instance.findFirst({
    where: {
      licenseId: license.id,
      machineId: machine_id,
      deactivatedAt: null,
    },
  });
  if (existing) {
    return {
      activated: true,
      instance: {
        id: existing.id,
        name: existing.name ?? existing.id,
        created_at: existing.createdAt.toISOString(),
      },
      is_dev_license: isDev,
    };
  }

  const activeMachines = await deps.prisma.instance.findMany({
    where: { licenseId: license.id, deactivatedAt: null },
    select: { machineId: true },
    distinct: ["machineId"],
  });
  if (activeMachines.length >= license.plan.maxActiveMachines) {
    return {
      activated: false,
      error: "Device limit reached for this license",
      is_dev_license: isDev,
    };
  }

  const instance = await deps.prisma.instance.create({
    data: {
      id: instance_name,
      name: instance_name,
      licenseId: license.id,
      machineId: machine_id,
      appVersion: app_version,
    },
  });

  return {
    activated: true,
    instance: {
      id: instance.id,
      name: instance.name ?? instance.id,
      created_at: instance.createdAt.toISOString(),
    },
    is_dev_license: isDev,
  };
}

export async function deactivateLicense(
  deps: LicensingDeps,
  input: Pick<ActivationInput, "license_key" | "instance_name" | "machine_id">
): Promise<DeactivateResult> {
  const { license_key, instance_name, machine_id } = input;

  const license = await deps.prisma.license.findUnique({
    where: { licenseKeyHash: licenseKeyHash(license_key) },
  });

  const isDev = license?.type === "dev";
  if (!license) {
    return { activated: true, is_dev_license: isDev };
  }

  await deps.prisma.machine.upsert({
    where: { machineId: machine_id },
    update: { lastSeenAt: new Date() },
    create: {
      machineId: machine_id,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    },
  });

  await deps.prisma.instance.updateMany({
    where: { id: instance_name, licenseId: license.id },
    data: { deactivatedAt: new Date() },
  });

  return { activated: true, is_dev_license: isDev };
}

export async function validateLicense(
  deps: LicensingDeps,
  input: Pick<ActivationInput, "license_key" | "instance_name" | "machine_id">
): Promise<ValidateResult> {
  const { license_key, instance_name, machine_id } = input;

  if (!license_key || !instance_name) {
    return {
      is_active: false,
      last_validated_at: null,
      is_dev_license: false,
    };
  }

  const license = await deps.prisma.license.findUnique({
    where: { licenseKeyHash: licenseKeyHash(license_key) },
  });

  const isDev = license?.type === "dev";
  if (!license || license.status !== "active") {
    return {
      is_active: false,
      last_validated_at: null,
      is_dev_license: isDev,
    };
  }

  const instance = await deps.prisma.instance.findFirst({
    where: {
      id: instance_name,
      licenseId: license.id,
      machineId: machine_id,
      deactivatedAt: null,
    },
  });

  if (!instance) {
    return {
      is_active: false,
      last_validated_at: null,
      is_dev_license: isDev,
    };
  }

  await deps.prisma.machine.upsert({
    where: { machineId: machine_id },
    update: { lastSeenAt: new Date() },
    create: {
      machineId: machine_id,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    },
  });

  return {
    is_active: true,
    last_validated_at: new Date().toISOString(),
    is_dev_license: isDev,
  };
}
