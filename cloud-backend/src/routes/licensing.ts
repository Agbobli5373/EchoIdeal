import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  getStripe,
  createCheckoutSession,
  getCheckoutSuccessLicenseKey,
  handleStripeWebhook,
  activateLicense,
  deactivateLicense,
  validateLicense,
} from "../services/licensing.js";
import { AppError } from "../services/errors.js";
import type { Env } from "../env.js";

const ActivationRequestSchema = z.object({
  license_key: z.string().min(1),
  instance_name: z.string().min(1),
  machine_id: z.string().min(1),
  app_version: z.string().min(1),
});

export const licensingRoutes: FastifyPluginAsync<{ env: Env }> = async (
  app,
  opts
) => {
  const getLicensingDeps = () => ({
    prisma: app.prisma,
    env: opts.env,
    stripe: getStripe(opts.env),
  });

  app.post(
    "/checkout",
    {
      preHandler: app.requireApiAccessKey,
    },
    async (_req, reply) => {
      try {
        const result = await createCheckoutSession(getLicensingDeps());
        return reply.send({
          success: true,
          checkout_url: result.checkoutUrl,
        });
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send({
            success: false,
            error: err.message,
          });
        }
        throw err;
      }
    }
  );

  app.get("/checkout/success", async (req, reply) => {
    const sessionId = (req.query as { session_id?: string })?.session_id;
    if (!sessionId) {
      return reply
        .code(400)
        .type("text/html")
        .send("<h1>Missing session_id</h1>");
    }

    const licenseKey = await getCheckoutSuccessLicenseKey(
      getLicensingDeps(),
      sessionId
    );

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

      const raw = (req as { rawBody?: Buffer }).rawBody;
      if (!raw) {
        return reply.code(400).send({ error: "Missing raw body" });
      }

      try {
        await handleStripeWebhook(getLicensingDeps(), raw, signature);
        return reply.send({ received: true });
      } catch (err) {
        if (err instanceof AppError) {
          app.log.warn(
            { err },
            "stripe webhook signature verification failed"
          );
          return reply.code(err.statusCode).send({ error: err.message });
        }
        throw err;
      }
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

      const result = await activateLicense(getLicensingDeps(), parsed.data);
      if (result.activated) {
        return reply.send(result);
      }
      return reply.code(200).send(result);
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

      const result = await deactivateLicense(getLicensingDeps(), {
        license_key: parsed.data.license_key,
        instance_name: parsed.data.instance_name,
        machine_id: parsed.data.machine_id,
      });
      return reply.send(result);
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

      const result = await validateLicense(getLicensingDeps(), {
        license_key: parsed.data.license_key,
        instance_name: parsed.data.instance_name,
        machine_id: parsed.data.machine_id,
      });
      return reply.send(result);
    }
  );
};
