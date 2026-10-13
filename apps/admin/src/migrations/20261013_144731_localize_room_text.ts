import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// The sample rooms as they were seeded, with their Danish and German text. A room still carrying its seeded English
// name gets the translations; one an admin has renamed is left with English only.
const SEEDED_TRANSLATIONS = [
  {
    slug: 'dating',
    en: 'Dating',
    da: ['Dating', 'Mød nye mennesker og flirt.'],
    de: ['Dating', 'Lerne neue Leute kennen und flirte.'],
  },
  {
    slug: 'general',
    en: 'General',
    da: ['Generelt', 'Åben chat om alt mellem himmel og jord.'],
    de: ['Allgemein', 'Offener Chat über alles Mögliche.'],
  },
  {
    slug: 'random',
    en: 'Random',
    da: ['Tilfældigt', 'Off-topic snak, memes og sidespring.'],
    de: ['Zufällig', 'Offtopic-Geplauder, Memes und Abschweifungen.'],
  },
  {
    slug: 'tech-talk',
    en: 'Tech Talk',
    da: ['Tech-snak', 'Programmering, gadgets og tech-nyheder.'],
    de: ['Tech-Talk', 'Programmierung, Gadgets und Tech-News.'],
  },
  {
    slug: 'gaming',
    en: 'Gaming',
    da: ['Gaming', 'Find holdkammerater og snak om spil.'],
    de: ['Gaming', 'Finde Mitspieler und sprich über Spiele.'],
  },
  {
    slug: 'music',
    en: 'Music',
    da: ['Musik', 'Del og diskuter musik i alle genrer.'],
    de: ['Musik', 'Teile und diskutiere Musik aller Genres.'],
  },
] as const

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "public_rooms_locales" (
  	"name" varchar NOT NULL,
  	"description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  ALTER TABLE "public_rooms_locales" ADD CONSTRAINT "public_rooms_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."public_rooms"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "public_rooms_locales_locale_parent_id_unique" ON "public_rooms_locales" USING btree ("_locale","_parent_id");
  INSERT INTO "public_rooms_locales" ("name", "description", "_locale", "_parent_id")
    SELECT "name", "description", 'en', "id" FROM "public_rooms";`)

  for (const room of SEEDED_TRANSLATIONS) {
    for (const locale of ['da', 'de'] as const) {
      const [name, description] = room[locale]

      await db.execute(sql`
        INSERT INTO "public_rooms_locales" ("name", "description", "_locale", "_parent_id")
          SELECT ${name}, ${description}, ${locale}::"_locales", "id"
          FROM "public_rooms"
          WHERE "slug" = ${room.slug} AND "name" = ${room.en}`)
    }
  }

  await db.execute(sql`
  ALTER TABLE "public_rooms" DROP COLUMN "name";
  ALTER TABLE "public_rooms" DROP COLUMN "description";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "public_rooms" ADD COLUMN "name" varchar;
  ALTER TABLE "public_rooms" ADD COLUMN "description" varchar;
  UPDATE "public_rooms" SET
    "name" = "public_rooms_locales"."name",
    "description" = "public_rooms_locales"."description"
    FROM "public_rooms_locales"
    WHERE "public_rooms_locales"."_parent_id" = "public_rooms"."id" AND "public_rooms_locales"."_locale" = 'en';
  ALTER TABLE "public_rooms" ALTER COLUMN "name" SET NOT NULL;
  DROP TABLE "public_rooms_locales" CASCADE;`)
}
