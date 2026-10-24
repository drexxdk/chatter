import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE SCHEMA "retired_website";
  ALTER TABLE "public"."releases" SET SCHEMA "retired_website";
  ALTER TABLE "public"."releases_locales" SET SCHEMA "retired_website";
  ALTER TABLE "public"."roadmap_items" SET SCHEMA "retired_website";
  ALTER TABLE "public"."roadmap_items_locales" SET SCHEMA "retired_website";
  ALTER TYPE "public"."enum_roadmap_items_status" SET SCHEMA "retired_website";
  ALTER TYPE "public"."enum_roadmap_items_priority" SET SCHEMA "retired_website";
  ALTER TYPE "public"."enum_roadmap_items_category" SET SCHEMA "retired_website";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "releases_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "roadmap_items_id";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TYPE "retired_website"."enum_roadmap_items_status" SET SCHEMA "public";
  ALTER TYPE "retired_website"."enum_roadmap_items_priority" SET SCHEMA "public";
  ALTER TYPE "retired_website"."enum_roadmap_items_category" SET SCHEMA "public";
  ALTER TABLE "retired_website"."releases" SET SCHEMA "public";
  ALTER TABLE "retired_website"."releases_locales" SET SCHEMA "public";
  ALTER TABLE "retired_website"."roadmap_items" SET SCHEMA "public";
  ALTER TABLE "retired_website"."roadmap_items_locales" SET SCHEMA "public";
  DROP SCHEMA "retired_website";
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "releases_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "roadmap_items_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_releases_fk" FOREIGN KEY ("releases_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_roadmap_items_fk" FOREIGN KEY ("roadmap_items_id") REFERENCES "public"."roadmap_items"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_releases_id_idx" ON "payload_locked_documents_rels" USING btree ("releases_id");
  CREATE INDEX "payload_locked_documents_rels_roadmap_items_id_idx" ON "payload_locked_documents_rels" USING btree ("roadmap_items_id");`)
}
