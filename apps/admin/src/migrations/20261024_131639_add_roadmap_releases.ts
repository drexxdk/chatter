import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_roadmap_items_status" AS ENUM('planned', 'exploring', 'in-progress', 'done');
  CREATE TYPE "public"."enum_roadmap_items_priority" AS ENUM('high', 'medium', 'low');
  CREATE TYPE "public"."enum_roadmap_items_category" AS ENUM('reliability', 'chat', 'experience', 'documentation', 'engineering');
  CREATE TABLE "releases" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"version" varchar NOT NULL,
  	"released_at" timestamp(3) with time zone NOT NULL,
  	"published" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "releases_locales" (
  	"title" varchar NOT NULL,
  	"summary" varchar NOT NULL,
  	"changes" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "roadmap_items" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"status" "enum_roadmap_items_status" DEFAULT 'planned' NOT NULL,
  	"priority" "enum_roadmap_items_priority" DEFAULT 'medium' NOT NULL,
  	"category" "enum_roadmap_items_category" NOT NULL,
  	"order" numeric DEFAULT 0 NOT NULL,
  	"release_id" integer,
  	"published" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "roadmap_items_locales" (
  	"title" varchar NOT NULL,
  	"description" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "releases_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "roadmap_items_id" integer;
  ALTER TABLE "releases_locales" ADD CONSTRAINT "releases_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "roadmap_items" ADD CONSTRAINT "roadmap_items_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "roadmap_items_locales" ADD CONSTRAINT "roadmap_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."roadmap_items"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "releases_version_idx" ON "releases" USING btree ("version");
  CREATE INDEX "releases_updated_at_idx" ON "releases" USING btree ("updated_at");
  CREATE INDEX "releases_created_at_idx" ON "releases" USING btree ("created_at");
  CREATE UNIQUE INDEX "releases_locales_locale_parent_id_unique" ON "releases_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "roadmap_items_key_idx" ON "roadmap_items" USING btree ("key");
  CREATE INDEX "roadmap_items_release_idx" ON "roadmap_items" USING btree ("release_id");
  CREATE INDEX "roadmap_items_updated_at_idx" ON "roadmap_items" USING btree ("updated_at");
  CREATE INDEX "roadmap_items_created_at_idx" ON "roadmap_items" USING btree ("created_at");
  CREATE UNIQUE INDEX "roadmap_items_locales_locale_parent_id_unique" ON "roadmap_items_locales" USING btree ("_locale","_parent_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_releases_fk" FOREIGN KEY ("releases_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_roadmap_items_fk" FOREIGN KEY ("roadmap_items_id") REFERENCES "public"."roadmap_items"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_releases_id_idx" ON "payload_locked_documents_rels" USING btree ("releases_id");
  CREATE INDEX "payload_locked_documents_rels_roadmap_items_id_idx" ON "payload_locked_documents_rels" USING btree ("roadmap_items_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "releases" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "releases_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "roadmap_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "roadmap_items_locales" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "releases" CASCADE;
  DROP TABLE "releases_locales" CASCADE;
  DROP TABLE "roadmap_items" CASCADE;
  DROP TABLE "roadmap_items_locales" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_releases_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_roadmap_items_fk";
  
  DROP INDEX "payload_locked_documents_rels_releases_id_idx";
  DROP INDEX "payload_locked_documents_rels_roadmap_items_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "releases_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "roadmap_items_id";
  DROP TYPE "public"."enum_roadmap_items_status";
  DROP TYPE "public"."enum_roadmap_items_priority";
  DROP TYPE "public"."enum_roadmap_items_category";`)
}
