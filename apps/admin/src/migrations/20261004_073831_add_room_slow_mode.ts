import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "public_rooms" ADD COLUMN "slow_mode_seconds" numeric DEFAULT 10;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "public_rooms" DROP COLUMN "slow_mode_seconds";`)
}
