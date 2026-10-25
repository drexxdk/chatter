import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "staff_provider_links" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"identity" varchar NOT NULL,
  	"provider" varchar NOT NULL,
  	"staff_id" integer NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "admins" ADD COLUMN "avatar" varchar DEFAULT 'other';
  ALTER TABLE "admins" ADD COLUMN "picture" varchar;
  ALTER TABLE "admins" ADD COLUMN "birth_date" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "staff_provider_links_id" integer;
  ALTER TABLE "staff_provider_links" ADD CONSTRAINT "staff_provider_links_staff_id_admins_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "staff_provider_links_identity_idx" ON "staff_provider_links" USING btree ("identity");
  CREATE INDEX "staff_provider_links_staff_idx" ON "staff_provider_links" USING btree ("staff_id");
  CREATE INDEX "staff_provider_links_updated_at_idx" ON "staff_provider_links" USING btree ("updated_at");
  CREATE INDEX "staff_provider_links_created_at_idx" ON "staff_provider_links" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_staff_provider_links_fk" FOREIGN KEY ("staff_provider_links_id") REFERENCES "public"."staff_provider_links"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_staff_provider_links_id_idx" ON "payload_locked_documents_rels" USING btree ("staff_provider_links_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "staff_provider_links" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "staff_provider_links" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_staff_provider_links_fk";
  
  DROP INDEX "payload_locked_documents_rels_staff_provider_links_id_idx";
  ALTER TABLE "admins" DROP COLUMN "avatar";
  ALTER TABLE "admins" DROP COLUMN "picture";
  ALTER TABLE "admins" DROP COLUMN "birth_date";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "staff_provider_links_id";`)
}
