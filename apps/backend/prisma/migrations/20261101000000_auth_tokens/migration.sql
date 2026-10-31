-- Password reset + email verification links, session revocation on password
-- change, and globally unique (case-insensitive) emails.

-- CreateEnum
CREATE TYPE "AuthTokenPurpose" AS ENUM ('PASSWORD_RESET', 'EMAIL_VERIFY');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN "passwordChangedAt" TIMESTAMP(3);

-- Accounts that existed before verification was introduced count as verified.
UPDATE "users" SET "emailVerifiedAt" = CURRENT_TIMESTAMP WHERE "email" IS NOT NULL;

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "AuthTokenPurpose" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_tokens_tokenHash_key" ON "auth_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "auth_tokens_userId_purpose_idx" ON "auth_tokens"("userId", "purpose");

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One account per email across every restaurant (login and reset look up by
-- email alone). Not expressible in schema.prisma; keep it when regenerating.
CREATE UNIQUE INDEX "users_email_lower_key" ON "users" (lower(btrim("email"))) WHERE "email" IS NOT NULL;
