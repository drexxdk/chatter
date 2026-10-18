import { randomUUID } from 'node:crypto'
import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "users_name_claims" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL
  );
  
  ALTER TABLE "users_name_claims" ADD CONSTRAINT "users_name_claims_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_name_claims_order_idx" ON "users_name_claims" USING btree ("_order");
  CREATE INDEX "users_name_claims_parent_id_idx" ON "users_name_claims" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "users_name_claims_key_idx" ON "users_name_claims" USING btree ("key");`)

  await backfillUserNames({ db })
}

export async function backfillUserNames({ db }: Pick<MigrateUpArgs, 'db'>): Promise<void> {
  let lastId = 0
  const normalize = (name: string) =>
    name
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\s._-]+/g, '')

  for (;;) {
    const users = await db.execute<{ id: number; nickname: string; display_name: string | null }>(
      sql`SELECT id, nickname, display_name FROM users WHERE id > ${lastId} ORDER BY id LIMIT 500`,
    )

    for (const user of users.rows) {
      const nicknameKey = normalize(user.nickname)
      const displayNameKey = normalize(user.display_name || user.nickname)
      await db.execute(
        sql`UPDATE users SET nickname_key = ${nicknameKey}, display_name_key = ${displayNameKey} WHERE id = ${user.id}`,
      )
      await db.execute(sql`DELETE FROM users_name_claims WHERE _parent_id = ${user.id}`)

      const claims = [...new Set([nicknameKey, displayNameKey])].sort()
      for (const [index, key] of claims.entries()) {
        await db.execute(
          sql`INSERT INTO users_name_claims (_order, _parent_id, id, key) VALUES (${index + 1}, ${user.id}, ${randomUUID()}, ${key})`,
        )
      }
      lastId = user.id
    }

    if (users.rows.length < 500) break
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "users_name_claims" CASCADE;`)
}
