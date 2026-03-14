-- CreateEnum
CREATE TYPE "license_type" AS ENUM ('paid', 'dev');

-- CreateEnum
CREATE TYPE "license_status" AS ENUM ('active', 'revoked', 'past_due', 'canceled');

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "stripe_customer_id" TEXT,
    "email" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "monthly_token_quota" INTEGER NOT NULL,
    "monthly_transcription_seconds_quota" INTEGER NOT NULL,
    "max_active_machines" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licenses" (
    "id" TEXT NOT NULL,
    "license_key_hash" TEXT NOT NULL,
    "license_key_last4" TEXT NOT NULL,
    "type" "license_type" NOT NULL,
    "status" "license_status" NOT NULL,
    "customer_id" TEXT,
    "plan_id" TEXT NOT NULL,
    "stripe_subscription_id" TEXT,
    "current_period_start" TIMESTAMPTZ,
    "current_period_end" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "revoked_at" TIMESTAMPTZ,
    CONSTRAINT "licenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "machines" (
    "id" TEXT NOT NULL,
    "machine_id" TEXT NOT NULL,
    "first_seen_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "machines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instances" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "license_id" TEXT NOT NULL,
    "machine_id" TEXT NOT NULL,
    "app_version" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "deactivated_at" TIMESTAMPTZ,
    CONSTRAINT "instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_events" (
    "id" TEXT NOT NULL,
    "license_id" TEXT NOT NULL,
    "machine_id" TEXT NOT NULL,
    "instance_id" TEXT,
    "ai_model" TEXT,
    "prompt_tokens" INTEGER,
    "completion_tokens" INTEGER,
    "total_tokens" INTEGER,
    "transcription_seconds" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_totals" (
    "license_id" TEXT NOT NULL,
    "period_start" TIMESTAMPTZ NOT NULL,
    "period_end" TIMESTAMPTZ NOT NULL,
    "used_tokens" INTEGER NOT NULL DEFAULT 0,
    "used_transcription_seconds" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "usage_totals_pkey" PRIMARY KEY ("license_id","period_start")
);

-- CreateTable
CREATE TABLE "error_events" (
    "id" TEXT NOT NULL,
    "license_id" TEXT,
    "machine_id" TEXT,
    "instance_id" TEXT,
    "endpoint" TEXT NOT NULL,
    "model" TEXT,
    "provider" TEXT,
    "app_version" TEXT,
    "error_message" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "error_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_catalog" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "modality" TEXT NOT NULL,
    "is_available" BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "model_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_catalog" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "prompt_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_stripe_customer_id_key" ON "customers"("stripe_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "plans_name_key" ON "plans"("name");

-- CreateIndex
CREATE UNIQUE INDEX "licenses_license_key_hash_key" ON "licenses"("license_key_hash");

-- CreateIndex
CREATE UNIQUE INDEX "licenses_stripe_subscription_id_key" ON "licenses"("stripe_subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "machines_machine_id_key" ON "machines"("machine_id");

-- CreateIndex
CREATE INDEX "instances_license_id_idx" ON "instances"("license_id");

-- CreateIndex
CREATE INDEX "instances_machine_id_idx" ON "instances"("machine_id");

-- CreateIndex
CREATE INDEX "usage_events_license_id_created_at_idx" ON "usage_events"("license_id", "created_at");

-- CreateIndex
CREATE INDEX "usage_events_machine_id_created_at_idx" ON "usage_events"("machine_id", "created_at");

-- CreateIndex
CREATE INDEX "error_events_created_at_idx" ON "error_events"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "model_catalog_model_key" ON "model_catalog"("model");

-- CreateIndex
CREATE INDEX "prompt_catalog_is_active_idx" ON "prompt_catalog"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_catalog_title_key" ON "prompt_catalog"("title");

-- AddForeignKey
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instances" ADD CONSTRAINT "instances_license_id_fkey" FOREIGN KEY ("license_id") REFERENCES "licenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instances" ADD CONSTRAINT "instances_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machines"("machine_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_license_id_fkey" FOREIGN KEY ("license_id") REFERENCES "licenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_totals" ADD CONSTRAINT "usage_totals_license_id_fkey" FOREIGN KEY ("license_id") REFERENCES "licenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "error_events" ADD CONSTRAINT "error_events_license_id_fkey" FOREIGN KEY ("license_id") REFERENCES "licenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_catalog" ADD CONSTRAINT "prompt_catalog_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "model_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
