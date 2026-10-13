import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" ADD COLUMN "display_name" varchar;
  ALTER TABLE "users" ADD COLUMN "display_name_key" varchar;
  ALTER TABLE "users" ADD COLUMN "picture" varchar;
  CREATE UNIQUE INDEX "users_display_name_key_idx" ON "users" USING btree ("display_name_key");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "users_display_name_key_idx";
  ALTER TABLE "users" DROP COLUMN "display_name";
  ALTER TABLE "users" DROP COLUMN "display_name_key";
  ALTER TABLE "users" DROP COLUMN "picture";`)
}
