import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."_locales" AS ENUM('en', 'da', 'de');
  CREATE TYPE "public"."enum_legal_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__legal_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__legal_v_published_locale" AS ENUM('en', 'da', 'de');
  CREATE TABLE "legal_terms_sections" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"paragraphs" varchar,
  	"items" varchar
  );
  
  CREATE TABLE "legal_privacy_sections" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"paragraphs" varchar,
  	"items" varchar
  );
  
  CREATE TABLE "legal" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"terms_version" varchar,
  	"contact_email" varchar,
  	"_status" "enum_legal_status" DEFAULT 'draft',
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "legal_locales" (
  	"terms_title" varchar,
  	"terms_updated" varchar,
  	"privacy_title" varchar,
  	"privacy_updated" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_legal_v_version_terms_sections" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"paragraphs" varchar,
  	"items" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_legal_v_version_privacy_sections" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"paragraphs" varchar,
  	"items" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_legal_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"version_terms_version" varchar,
  	"version_contact_email" varchar,
  	"version__status" "enum__legal_v_version_status" DEFAULT 'draft',
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__legal_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "_legal_v_locales" (
  	"version_terms_title" varchar,
  	"version_terms_updated" varchar,
  	"version_privacy_title" varchar,
  	"version_privacy_updated" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  ALTER TABLE "legal_terms_sections" ADD CONSTRAINT "legal_terms_sections_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."legal"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "legal_privacy_sections" ADD CONSTRAINT "legal_privacy_sections_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."legal"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "legal_locales" ADD CONSTRAINT "legal_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."legal"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_legal_v_version_terms_sections" ADD CONSTRAINT "_legal_v_version_terms_sections_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_legal_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_legal_v_version_privacy_sections" ADD CONSTRAINT "_legal_v_version_privacy_sections_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_legal_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_legal_v_locales" ADD CONSTRAINT "_legal_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_legal_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "legal_terms_sections_order_idx" ON "legal_terms_sections" USING btree ("_order");
  CREATE INDEX "legal_terms_sections_parent_id_idx" ON "legal_terms_sections" USING btree ("_parent_id");
  CREATE INDEX "legal_terms_sections_locale_idx" ON "legal_terms_sections" USING btree ("_locale");
  CREATE INDEX "legal_privacy_sections_order_idx" ON "legal_privacy_sections" USING btree ("_order");
  CREATE INDEX "legal_privacy_sections_parent_id_idx" ON "legal_privacy_sections" USING btree ("_parent_id");
  CREATE INDEX "legal_privacy_sections_locale_idx" ON "legal_privacy_sections" USING btree ("_locale");
  CREATE INDEX "legal__status_idx" ON "legal" USING btree ("_status");
  CREATE UNIQUE INDEX "legal_locales_locale_parent_id_unique" ON "legal_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_legal_v_version_terms_sections_order_idx" ON "_legal_v_version_terms_sections" USING btree ("_order");
  CREATE INDEX "_legal_v_version_terms_sections_parent_id_idx" ON "_legal_v_version_terms_sections" USING btree ("_parent_id");
  CREATE INDEX "_legal_v_version_terms_sections_locale_idx" ON "_legal_v_version_terms_sections" USING btree ("_locale");
  CREATE INDEX "_legal_v_version_privacy_sections_order_idx" ON "_legal_v_version_privacy_sections" USING btree ("_order");
  CREATE INDEX "_legal_v_version_privacy_sections_parent_id_idx" ON "_legal_v_version_privacy_sections" USING btree ("_parent_id");
  CREATE INDEX "_legal_v_version_privacy_sections_locale_idx" ON "_legal_v_version_privacy_sections" USING btree ("_locale");
  CREATE INDEX "_legal_v_version_version__status_idx" ON "_legal_v" USING btree ("version__status");
  CREATE INDEX "_legal_v_created_at_idx" ON "_legal_v" USING btree ("created_at");
  CREATE INDEX "_legal_v_updated_at_idx" ON "_legal_v" USING btree ("updated_at");
  CREATE INDEX "_legal_v_snapshot_idx" ON "_legal_v" USING btree ("snapshot");
  CREATE INDEX "_legal_v_published_locale_idx" ON "_legal_v" USING btree ("published_locale");
  CREATE INDEX "_legal_v_latest_idx" ON "_legal_v" USING btree ("latest");
  CREATE UNIQUE INDEX "_legal_v_locales_locale_parent_id_unique" ON "_legal_v_locales" USING btree ("_locale","_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "legal_terms_sections" CASCADE;
  DROP TABLE "legal_privacy_sections" CASCADE;
  DROP TABLE "legal" CASCADE;
  DROP TABLE "legal_locales" CASCADE;
  DROP TABLE "_legal_v_version_terms_sections" CASCADE;
  DROP TABLE "_legal_v_version_privacy_sections" CASCADE;
  DROP TABLE "_legal_v" CASCADE;
  DROP TABLE "_legal_v_locales" CASCADE;
  DROP TYPE "public"."_locales";
  DROP TYPE "public"."enum_legal_status";
  DROP TYPE "public"."enum__legal_v_version_status";
  DROP TYPE "public"."enum__legal_v_published_locale";`)
}
