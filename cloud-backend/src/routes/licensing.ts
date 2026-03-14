import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import Stripe from "stripe";
import { randomLicenseKey } from "../lib/crypto.js";
import { licenseKeyHash, licenseKeyLast4 } from "../lib/license.js";
import type { Env } from "../env.js";

const ActivationRequestSchema = z.object({
  license_key: z.string().min(1),
  instance_name: z.string().min(1),
  machine_id: z.string().min(1),
  app_version: z.string().min(1),
});

function getStripe(env: Pick<Env, "STRIPE_SECRET_KEY">): Stripe | null {
  if (!env.STRIPE_SECRET_KEY) return null;
  return new Stripe(env.STRIPE_SECRET_KEY);
}

export const licensingRoutes: FastifyPluginAsync<{ env: Env }> = async (
  app,
  opts
) => {
  app.post(
    "/checkout",
    {
      preHandler: app.requireApiAccessKey,
    },
    async (_req, reply) => {
      const stripe = getStripe(opts.env);
      if (!stripe || !opts.env.STRIPE_PRICE_ID) {
        return reply.code(500).send({
          success: false,
          error: "Stripe is not configured",
        });
      }

      const baseUrl = opts.env.APP_BASE_URL || "https://example.invalid";
      const successUrl =
        opts.env.CHECKOUT_SUCCESS_URL ||
        `${baseUrl.replace(/\/$/, "")}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl =
        opts.env.CHECKOUT_CANCEL_URL ||
        `${baseUrl.replace(/\/$/, "")}/checkout/cancel`;

      const generatedLicenseKey = randomLicenseKey();

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: opts.env.STRIPE_PRICE_ID, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        allow_promotion_codes: true,
        metadata: {
          license_key: generatedLicenseKey,
          plan: "Pro",
        },
      });

      return reply.send({
        success: true,
        checkout_url: session.url,
      });
    }
  );

  app.get("/checkout/success", async (req, reply) => {
    const stripe = getStripe(opts.env);
    const sessionId = (req.query as any)?.session_id as string | undefined;
    if (!stripe || !sessionId) {
      return reply
        .code(400)
        .type("text/html")
        .send("<h1>Missing session_id</h1>");
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const licenseKey = (session.metadata as any)?.license_key as string | undefined;

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>EchoIdeal License</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; padding: 32px; max-width: 720px; margin: 0 auto; }
      code { display: block; padding: 12px 14px; background: #111827; color: #f9fafb; border-radius: 10px; font-size: 16px; }
      .muted { color: #6b7280; font-size: 14px; }
    </style>
  </head>
  <body>
    <h1>Thank you for your purchase</h1>
    <p class="muted">Paste this key into EchoIdeal: Dashboard → Settings → EchoIdeal API.</p>
    <code>${licenseKey ?? "License key not found. Please contact support."}</code>
  </body>
</html>`;

    return reply.type("text/html").send(html);
  });

  app.get("/checkout/cancel", async (_req, reply) => {
    return reply
      .type("text/html")
      .send("<h1>Checkout canceled</h1><p>You can close this tab.</p>");
  });

  app.post(
    "/webhooks/stripe",
    {
      config: {
        rawBody: true,
      },
    },
    async (req, reply) => {
      const stripe = getStripe(opts.env);
      if (!stripe || !opts.env.STRIPE_WEBHOOK_SECRET) {
        return reply.code(500).send({ error: "Stripe webhook not configured" });
      }

      const signature = req.headers["stripe-signature"];
      if (!signature || typeof signature !== "string") {
        return reply.code(400).send({ error: "Missing stripe-signature" });
      }

      const raw = (req as any).rawBody as Buffer | undefined;
      if (!raw) {
        return reply.code(400).send({ error: "Missing raw body" });
      }

      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(
          raw,
          signature,
          opts.env.STRIPE_WEBHOOK_SECRET
        );
      } catch (err) {
        app.log.warn({ err }, "stripe webhook signature verification failed");
        return reply.code(400).send({ error: "Invalid signature" });
      }

      const upsertSubscriptionLicense = async (subscriptionId: string) => {
        const subscription = (await stripe.subscriptions.retrieve(
          subscriptionId
        )) as any;

        const status =
          subscription.status === "active" || subscription.status === "trialing"
            ? "active"
            : subscription.status === "past_due" || subscription.status === "unpaid"
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

        await app.prisma.license.updateMany({
          where: { stripeSubscriptionId: subscriptionId },
          data: {
            status: status as any,
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

          const licenseKey = (session.metadata as any)?.license_key as
            | string
            | undefined;
          const planName =
            ((session.metadata as any)?.plan as string | undefined) ?? "Pro";

          if (!subscriptionId || typeof subscriptionId !== "string") {
            break;
          }
          if (!licenseKey) {
            break;
          }

          const plan = await app.prisma.plan.findUnique({
            where: { name: planName },
          });
          const fallbackPlan = plan ?? (await app.prisma.plan.findFirst());
          if (!fallbackPlan) {
            throw new Error("No plans configured in database");
          }

          const email = session.customer_details?.email ?? null;

          const customer =
            customerId && typeof customerId === "string"
              ? await app.prisma.customer.upsert({
                  where: { stripeCustomerId: customerId },
                  update: { email },
                  create: { stripeCustomerId: customerId, email },
                })
              : null;

          const existing = await app.prisma.license.findUnique({
            where: { stripeSubscriptionId: subscriptionId },
          });
          if (existing) {
            await upsertSubscriptionLicense(subscriptionId);
            break;
          }

          const normalizedHash = licenseKeyHash(licenseKey);
          const last4 = licenseKeyLast4(licenseKey);

          // Also refresh subscription to record current period bounds.
          const subscription = (await stripe.subscriptions.retrieve(
            subscriptionId
          )) as any;

          await app.prisma.license.create({
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
          await app.prisma.license.updateMany({
            where: { stripeSubscriptionId: sub.id },
            data: { status: "canceled" as any },
          });
          break;
        }
        case "invoice.paid": {
          const invoice = event.data.object as any;
          const subscriptionId = invoice.subscription as unknown;
          if (subscriptionId && typeof subscriptionId === "string") {
            await upsertSubscriptionLicense(subscriptionId);
          }
          break;
        }
        default:
          break;
      }

      return reply.send({ received: true });
    }
  );

  app.post(
    "/activate",
    { preHandler: app.requireApiAccessKey },
    async (req, reply) => {
      const parsed = ActivationRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          activated: false,
          error: "Invalid request",
          is_dev_license: false,
        });
      }

      const { license_key, instance_name, machine_id, app_version } =
        parsed.data;
      const license = await app.prisma.license.findUnique({
        where: { licenseKeyHash: licenseKeyHash(license_key) },
        include: { plan: true },
      });

      if (!license || license.status !== "active") {
        return reply.code(200).send({
          activated: false,
          error: "Invalid or inactive license",
          is_dev_license: license?.type === "dev",
        });
      }

      const isDev = license.type === "dev";

      const now = new Date();
      await app.prisma.machine.upsert({
        where: { machineId: machine_id },
        update: { lastSeenAt: now },
        create: { machineId: machine_id, firstSeenAt: now, lastSeenAt: now },
      });

      // If this machine already has an active instance for this license, return it.
      const existing = await app.prisma.instance.findFirst({
        where: {
          licenseId: license.id,
          machineId: machine_id,
          deactivatedAt: null,
        },
      });
      if (existing) {
        return reply.send({
          activated: true,
          instance: {
            id: existing.id,
            name: existing.name ?? existing.id,
            created_at: existing.createdAt.toISOString(),
          },
          is_dev_license: isDev,
        });
      }

      // Enforce active machine limit per license.
      const activeMachines = await app.prisma.instance.findMany({
        where: { licenseId: license.id, deactivatedAt: null },
        select: { machineId: true },
        distinct: ["machineId"],
      });
      if (activeMachines.length >= license.plan.maxActiveMachines) {
        return reply.code(200).send({
          activated: false,
          error: "Device limit reached for this license",
          is_dev_license: isDev,
        });
      }

      const instance = await app.prisma.instance.create({
        data: {
          id: instance_name,
          name: instance_name,
          licenseId: license.id,
          machineId: machine_id,
          appVersion: app_version,
        },
      });

      return reply.send({
        activated: true,
        instance: {
          id: instance.id,
          name: instance.name ?? instance.id,
          created_at: instance.createdAt.toISOString(),
        },
        is_dev_license: isDev,
      });
    }
  );

  app.post(
    "/deactivate",
    { preHandler: app.requireApiAccessKey },
    async (req, reply) => {
      const parsed = ActivationRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          activated: false,
          error: "Invalid request",
          is_dev_license: false,
        });
      }

      const { license_key, instance_name, machine_id } = parsed.data;
      const license = await app.prisma.license.findUnique({
        where: { licenseKeyHash: licenseKeyHash(license_key) },
      });

      const isDev = license?.type === "dev";
      if (!license) {
        return reply.send({
          activated: true,
          is_dev_license: isDev,
        });
      }

      await app.prisma.machine.upsert({
        where: { machineId: machine_id },
        update: { lastSeenAt: new Date() },
        create: { machineId: machine_id, firstSeenAt: new Date(), lastSeenAt: new Date() },
      });

      await app.prisma.instance.updateMany({
        where: { id: instance_name, licenseId: license.id },
        data: { deactivatedAt: new Date() },
      });

      return reply.send({
        activated: true,
        is_dev_license: isDev,
      });
    }
  );

  app.post(
    "/validate",
    { preHandler: app.requireApiAccessKey },
    async (req, reply) => {
      const parsed = ActivationRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          is_active: false,
          last_validated_at: null,
          is_dev_license: false,
        });
      }

      const { license_key, instance_name, machine_id } = parsed.data;
      if (!license_key || !instance_name) {
        return reply.send({
          is_active: false,
          last_validated_at: null,
          is_dev_license: false,
        });
      }

      const license = await app.prisma.license.findUnique({
        where: { licenseKeyHash: licenseKeyHash(license_key) },
      });

      const isDev = license?.type === "dev";
      if (!license || license.status !== "active") {
        return reply.send({
          is_active: false,
          last_validated_at: null,
          is_dev_license: isDev,
        });
      }

      const instance = await app.prisma.instance.findFirst({
        where: {
          id: instance_name,
          licenseId: license.id,
          machineId: machine_id,
          deactivatedAt: null,
        },
      });

      if (!instance) {
        return reply.send({
          is_active: false,
          last_validated_at: null,
          is_dev_license: isDev,
        });
      }

      await app.prisma.machine.upsert({
        where: { machineId: machine_id },
        update: { lastSeenAt: new Date() },
        create: { machineId: machine_id, firstSeenAt: new Date(), lastSeenAt: new Date() },
      });

      return reply.send({
        is_active: true,
        last_validated_at: new Date().toISOString(),
        is_dev_license: isDev,
      });
    }
  );
};
