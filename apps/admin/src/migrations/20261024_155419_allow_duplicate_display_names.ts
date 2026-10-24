import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DELETE FROM "users_name_claims" AS claims USING "users"
  WHERE claims."_parent_id" = "users"."id" AND claims."key" <> "users"."nickname_key";
  UPDATE "users_name_claims" SET "_order" = 1;
   DROP INDEX "users_display_name_key_idx";
  CREATE INDEX "users_display_name_key_idx" ON "users" USING btree ("display_name_key");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  INSERT INTO "users_name_claims" ("_order", "_parent_id", "id", "key")
  SELECT 2, "id", md5("id"::text || ':' || "display_name_key"), "display_name_key"
  FROM "users" WHERE "display_name_key" IS NOT NULL AND "display_name_key" <> "nickname_key";
   DROP INDEX "users_display_name_key_idx";
  CREATE UNIQUE INDEX "users_display_name_key_idx" ON "users" USING btree ("display_name_key");`)
}
