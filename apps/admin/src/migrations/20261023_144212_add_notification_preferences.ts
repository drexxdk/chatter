import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "admins" ADD COLUMN "notification_preferences" jsonb;
  ALTER TABLE "users" ADD COLUMN "notification_preferences" jsonb;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "admins" DROP COLUMN "notification_preferences";
  ALTER TABLE "users" DROP COLUMN "notification_preferences";`)
}
