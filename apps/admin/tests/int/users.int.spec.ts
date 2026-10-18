import { randomUUID } from 'node:crypto'
import type { Payload } from 'payload'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { Users } from '@/collections/Users'

const hook = Users.hooks!.beforeValidate![0]!
const derive = (data: Record<string, unknown>, originalDoc?: Record<string, unknown>) =>
  hook({ data, originalDoc } as Parameters<typeof hook>[0])

describe('user name derivation', () => {
  it('derives both keys and ignores supplied keys and claims', async () => {
    expect(
      await derive({
        nickname: 'A.l_i-ce',
        displayName: 'Ａlice Wonder',
        nicknameKey: 'forged',
        displayNameKey: 'forged',
        nameClaims: [{ key: 'somebodyelse' }],
      }),
    ).toMatchObject({
      nicknameKey: 'alice',
      displayNameKey: 'alicewonder',
      nameClaims: [{ key: 'alice' }, { key: 'alicewonder' }],
    })
  })

  it('claims matching username and display name only once', async () => {
    expect(await derive({ nickname: 'alice', displayName: 'A L I C E' })).toMatchObject({
      nicknameKey: 'alice',
      displayNameKey: 'alice',
      nameClaims: [{ key: 'alice' }],
    })
  })

  it('uses the username when the display name is empty or absent', async () => {
    for (const displayName of [undefined, null, '']) {
      expect(await derive({ nickname: 'Alice', displayName })).toMatchObject({
        nicknameKey: 'alice',
        displayNameKey: 'alice',
        nameClaims: [{ key: 'alice' }],
      })
    }
  })

  it('keeps claim ids and the username during partial admin edits', async () => {
    expect(
      await derive(
        { displayName: 'New Name', age: 30 },
        {
          nickname: 'Alice',
          displayName: 'Old Name',
          nameClaims: [
            { id: 'kept', key: 'alice' },
            { id: 'removed', key: 'oldname' },
          ],
        },
      ),
    ).toMatchObject({
      age: 30,
      nicknameKey: 'alice',
      displayNameKey: 'newname',
      nameClaims: [{ id: 'kept', key: 'alice' }, { key: 'newname' }],
    })
  })
})

describe.skipIf(!process.env.TEST_DATABASE_URL)('database name ownership', () => {
  let payload: Payload
  const provider = `name-claims-test-${randomUUID()}`

  beforeAll(async () => {
    const { getPayload } = await import('payload')
    const { postgresAdapter } = await import('@payloadcms/db-postgres')
    const { default: config } = await import('@/payload.config')
    const options = await config
    const adapter = postgresAdapter({
      pool: { connectionString: process.env.TEST_DATABASE_URL },
      push: false,
    })
    payload = await getPayload({
      config: {
        ...options,
        db: { ...options.db, init: adapter.init },
      },
    })
  }, 60_000)

  afterEach(async () => {
    if (!payload) return
    await payload.delete({ collection: 'users', where: { provider: { equals: provider } } })
  })

  afterAll(async () => {
    await payload?.destroy()
  })

  const makeUser = (nickname: string, displayName = nickname) =>
    payload.create({
      collection: 'users',
      data: {
        provider,
        providerUserId: randomUUID(),
        identity: `${provider}:${randomUUID()}`,
        nickname,
        nicknameKey: 'untrusted',
        displayName,
        displayNameKey: 'untrusted',
        nameClaims: [{ key: 'untrusted' }],
        avatar: 'other',
      },
    })

  it('persists derived claims and supports matching own names and partial updates', async () => {
    const user = await makeUser('alice', 'A L I C E')
    expect(user.nicknameKey).toBe('alice')
    expect(user.displayNameKey).toBe('alice')
    expect(user.nameClaims).toEqual([expect.objectContaining({ key: 'alice' })])

    const updated = await payload.update({ collection: 'users', id: user.id, data: { age: 30 } })
    expect(updated.age).toBe(30)
    expect(updated.nameClaims).toEqual(user.nameClaims)
  })

  it.each([
    ['beta', 'Gamma'],
    ['gamma', 'A L P H A'],
  ])(
    'rejects cross-column ownership for %s / %s and rolls back the user',
    async (nickname, displayName) => {
      await makeUser('alpha', 'Beta')
      await expect(makeUser(nickname, displayName)).rejects.toMatchObject({
        status: 400,
        data: { errors: [expect.objectContaining({ path: 'key', tableName: 'users' })] },
      })

      const users = await payload.find({
        collection: 'users',
        where: { provider: { equals: provider } },
      })
      expect(users.totalDocs).toBe(1)
    },
  )

  it('permits exactly one of two concurrent swapped-name registrations', async () => {
    const results = await Promise.allSettled([makeUser('alpha', 'Beta'), makeUser('beta', 'Alpha')])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find((result) => result.status === 'rejected')
    expect(rejected?.reason).toMatchObject({ status: 400 })

    const users = await payload.find({
      collection: 'users',
      where: { provider: { equals: provider } },
    })
    expect(users.totalDocs).toBe(1)
    expect(users.docs[0]?.nameClaims?.map((claim) => claim.key)).toEqual(['alpha', 'beta'])
  })

  it('rolls back the entire profile and its old claims when a rename conflicts', async () => {
    await makeUser('alpha', 'Alpha Name')
    const user = await makeUser('beta', 'Beta Name')

    await expect(
      payload.update({
        collection: 'users',
        id: user.id,
        data: { displayName: 'ALPHA', avatar: 'female' },
      }),
    ).rejects.toMatchObject({ status: 400 })

    const unchanged = await payload.findByID({ collection: 'users', id: user.id })
    expect(unchanged.displayName).toBe('Beta Name')
    expect(unchanged.avatar).toBe('other')
    expect(unchanged.nameClaims).toEqual(user.nameClaims)
  })

  it('releases old claims on admin renames and cascades claims on deletion', async () => {
    const user = await makeUser('alpha', 'Alpha Name')
    await payload.update({
      collection: 'users',
      id: user.id,
      data: { nickname: 'newusername', displayName: 'New Display' },
    })
    await expect(makeUser('alpha', 'Alpha Name')).resolves.toMatchObject({ nicknameKey: 'alpha' })

    await payload.delete({ collection: 'users', id: user.id })
    await expect(makeUser('newusername', 'New Display')).resolves.toMatchObject({
      nicknameKey: 'newusername',
      displayNameKey: 'newdisplay',
    })
  })

  it('backfills legacy accounts with missing claims and stale keys', async () => {
    const { sql } = await import('@payloadcms/db-postgres')
    const { backfillUserNames } = await import('@/migrations/20261018_201837_add_user_name_claims')
    const user = await makeUser('legacy', 'Legacy Name')
    const db = payload.db.drizzle
    await db.execute(sql`DELETE FROM users_name_claims WHERE _parent_id = ${user.id}`)
    await db.execute(
      sql`UPDATE users SET nickname_key = 'stale', display_name_key = 'staledisplay' WHERE id = ${user.id}`,
    )

    await backfillUserNames({ db })

    const updated = await payload.findByID({ collection: 'users', id: user.id })
    expect(updated.nicknameKey).toBe('legacy')
    expect(updated.displayNameKey).toBe('legacyname')
    expect(updated.nameClaims?.map((claim) => claim.key)).toEqual(['legacy', 'legacyname'])
  })
})
