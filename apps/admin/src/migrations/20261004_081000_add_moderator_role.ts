import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_admins_role" ADD VALUE 'moderator' BEFORE 'service';
  ALTER TABLE "admins" ADD COLUMN "display_name" varchar;
  CREATE UNIQUE INDEX "admins_display_name_idx" ON "admins" USING btree ("display_name");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "admins" ALTER COLUMN "role" SET DATA TYPE text;
  ALTER TABLE "admins" ALTER COLUMN "role" SET DEFAULT 'super-admin'::text;
  DROP TYPE "public"."enum_admins_role";
  CREATE TYPE "public"."enum_admins_role" AS ENUM('super-admin', 'service');
  ALTER TABLE "admins" ALTER COLUMN "role" SET DEFAULT 'super-admin'::"public"."enum_admins_role";
  ALTER TABLE "admins" ALTER COLUMN "role" SET DATA TYPE "public"."enum_admins_role" USING "role"::"public"."enum_admins_role";
  DROP INDEX "admins_display_name_idx";
  ALTER TABLE "admins" DROP COLUMN "display_name";`)
}
