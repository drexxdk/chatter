import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "member_provider_links" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"identity" varchar NOT NULL,
  	"provider" varchar NOT NULL,
  	"member_id" integer NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "member_provider_links_id" integer;
  ALTER TABLE "member_provider_links" ADD CONSTRAINT "member_provider_links_member_id_users_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "member_provider_links_identity_idx" ON "member_provider_links" USING btree ("identity");
  CREATE INDEX "member_provider_links_member_idx" ON "member_provider_links" USING btree ("member_id");
  CREATE INDEX "member_provider_links_updated_at_idx" ON "member_provider_links" USING btree ("updated_at");
  CREATE INDEX "member_provider_links_created_at_idx" ON "member_provider_links" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_member_provider_links_fk" FOREIGN KEY ("member_provider_links_id") REFERENCES "public"."member_provider_links"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_member_provider_links_id_idx" ON "payload_locked_documents_rels" USING btree ("member_provider_links_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "member_provider_links" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "member_provider_links" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_member_provider_links_fk";
  
  DROP INDEX "payload_locked_documents_rels_member_provider_links_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "member_provider_links_id";`)
}
