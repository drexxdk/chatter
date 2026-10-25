import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "admins" ADD COLUMN "sidebar_open" boolean DEFAULT true;
  ALTER TABLE "users" ADD COLUMN "sidebar_open" boolean DEFAULT true;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "admins" DROP COLUMN "sidebar_open";
  ALTER TABLE "users" DROP COLUMN "sidebar_open";`)
}
