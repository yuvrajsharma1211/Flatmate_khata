-- CreateEnum
CREATE TYPE "SplitType" AS ENUM ('equal', 'unequal', 'percentage', 'share');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('active', 'voided');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('manual', 'import');

-- CreateEnum
CREATE TYPE "AnomalyStatus" AS ENUM ('auto_resolved', 'pending_approval', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(150) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "base_currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "created_by" INTEGER,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_members" (
    "id" SERIAL NOT NULL,
    "group_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "role" VARCHAR(20) NOT NULL DEFAULT 'member',
    "joined_at" DATE NOT NULL,
    "left_at" DATE,

    CONSTRAINT "group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" SERIAL NOT NULL,
    "group_id" INTEGER NOT NULL,
    "key" VARCHAR(50) NOT NULL,
    "value" VARCHAR(100) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" SERIAL NOT NULL,
    "group_id" INTEGER,
    "filename" VARCHAR(255),
    "imported_by" INTEGER,
    "imported_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending_review',

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" SERIAL NOT NULL,
    "group_id" INTEGER NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "expense_date" DATE NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "original_amount" DECIMAL(12,2) NOT NULL,
    "exchange_rate" DECIMAL(10,4) NOT NULL DEFAULT 1,
    "amount_base" DECIMAL(12,2) NOT NULL,
    "paid_by" INTEGER NOT NULL,
    "split_type" "SplitType" NOT NULL,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'active',
    "source" "SourceType" NOT NULL DEFAULT 'manual',
    "import_batch_id" INTEGER,
    "source_row_number" INTEGER,
    "notes" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_splits" (
    "id" SERIAL NOT NULL,
    "expense_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "raw_value" DECIMAL(10,4),
    "owed_amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "expense_splits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlements" (
    "id" SERIAL NOT NULL,
    "group_id" INTEGER NOT NULL,
    "paid_by" INTEGER NOT NULL,
    "paid_to" INTEGER NOT NULL,
    "amount_base" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "original_amount" DECIMAL(12,2),
    "exchange_rate" DECIMAL(10,4) DEFAULT 1,
    "settled_at" DATE NOT NULL,
    "notes" TEXT,
    "source" "SourceType" NOT NULL DEFAULT 'manual',
    "import_batch_id" INTEGER,
    "source_row_number" INTEGER,
    "created_by" INTEGER,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_anomalies" (
    "id" SERIAL NOT NULL,
    "import_batch_id" INTEGER NOT NULL,
    "row_number" INTEGER NOT NULL,
    "raw_row" JSONB NOT NULL,
    "anomaly_types" TEXT[],
    "description" TEXT NOT NULL,
    "proposed_action" TEXT NOT NULL,
    "final_action" TEXT,
    "status" "AnomalyStatus" NOT NULL DEFAULT 'pending_approval',
    "linked_expense_id" INTEGER,
    "linked_settlement_id" INTEGER,
    "reviewed_by" INTEGER,
    "reviewed_at" TIMESTAMP,

    CONSTRAINT "import_anomalies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "group_members_group_id_user_id_joined_at_key" ON "group_members"("group_id", "user_id", "joined_at");

-- CreateIndex
CREATE UNIQUE INDEX "settings_group_id_key_key" ON "settings"("group_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "expense_splits_expense_id_user_id_key" ON "expense_splits"("expense_id", "user_id");

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_imported_by_fkey" FOREIGN KEY ("imported_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paid_by_fkey" FOREIGN KEY ("paid_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_splits" ADD CONSTRAINT "expense_splits_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_splits" ADD CONSTRAINT "expense_splits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_paid_by_fkey" FOREIGN KEY ("paid_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_paid_to_fkey" FOREIGN KEY ("paid_to") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_anomalies" ADD CONSTRAINT "import_anomalies_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_anomalies" ADD CONSTRAINT "import_anomalies_linked_expense_id_fkey" FOREIGN KEY ("linked_expense_id") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_anomalies" ADD CONSTRAINT "import_anomalies_linked_settlement_id_fkey" FOREIGN KEY ("linked_settlement_id") REFERENCES "settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_anomalies" ADD CONSTRAINT "import_anomalies_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
