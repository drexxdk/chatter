import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_reports_reasons" AS ENUM('spam', 'harassment', 'sexual', 'illegal', 'other');
  CREATE TYPE "public"."enum_reports_status" AS ENUM('open', 'hidden', 'dismissed', 'actioned');
  CREATE TABLE "reports_reasons" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_reports_reasons",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "reports" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"status" "enum_reports_status" DEFAULT 'open' NOT NULL,
  	"message_id" varchar NOT NULL,
  	"room_slug" varchar NOT NULL,
  	"text" varchar NOT NULL,
  	"nickname" varchar NOT NULL,
  	"guest_id" varchar,
  	"sender_hash" varchar,
  	"reporter_count" numeric DEFAULT 1 NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "reports_id" integer;
  ALTER TABLE "reports_reasons" ADD CONSTRAINT "reports_reasons_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "reports_reasons_order_idx" ON "reports_reasons" USING btree ("order");
  CREATE INDEX "reports_reasons_parent_idx" ON "reports_reasons" USING btree ("parent_id");
  CREATE UNIQUE INDEX "reports_message_id_idx" ON "reports" USING btree ("message_id");
  CREATE INDEX "reports_updated_at_idx" ON "reports" USING btree ("updated_at");
  CREATE INDEX "reports_created_at_idx" ON "reports" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_reports_fk" FOREIGN KEY ("reports_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_reports_id_idx" ON "payload_locked_documents_rels" USING btree ("reports_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "reports_reasons" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "reports" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "reports_reasons" CASCADE;
  DROP TABLE "reports" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_reports_fk";
  
  DROP INDEX "payload_locked_documents_rels_reports_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "reports_id";
  DROP TYPE "public"."enum_reports_reasons";
  DROP TYPE "public"."enum_reports_status";`)
}
