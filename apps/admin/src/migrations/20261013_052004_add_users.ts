import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_avatar" AS ENUM('male', 'female', 'trans', 'other');
  CREATE TABLE "users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"provider" varchar NOT NULL,
  	"provider_user_id" varchar NOT NULL,
  	"identity" varchar NOT NULL,
  	"email" varchar,
  	"email_verified" boolean DEFAULT false,
  	"nickname" varchar NOT NULL,
  	"nickname_key" varchar NOT NULL,
  	"avatar" "enum_users_avatar" DEFAULT 'other' NOT NULL,
  	"age" numeric,
  	"last_login_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "users_id" integer;
  CREATE UNIQUE INDEX "users_identity_idx" ON "users" USING btree ("identity");
  CREATE UNIQUE INDEX "users_nickname_key_idx" ON "users" USING btree ("nickname_key");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "users" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_users_fk";
  
  DROP INDEX "payload_locked_documents_rels_users_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "users_id";
  DROP TYPE "public"."enum_users_avatar";`)
}
