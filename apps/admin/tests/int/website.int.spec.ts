import type { Payload, PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import { Releases } from '@/collections/Releases'
import { RoadmapItems } from '@/collections/RoadmapItems'
import { INITIAL_ROADMAP, seedRoadmap } from '@/seed/roadmap'

describe.each([Releases, RoadmapItems])('$slug permissions', (collection) => {
  it.each([undefined, 'user', 'moderator', 'service', 'super-admin'])(
    'limits access for %s',
    async (role) => {
      const req = { user: role ? { role } : null } as PayloadRequest
      expect(await collection.access?.read?.({ req })).toBe(
        role === 'service' || role === 'super-admin',
      )
      for (const operation of ['create', 'update', 'delete'] as const) {
        expect(await collection.access?.[operation]?.({ req })).toBe(role === 'super-admin')
      }
    },
  )
})

describe('initial roadmap', () => {
  it('contains eighteen unique items and exactly the four supplied completed items', () => {
    expect(INITIAL_ROADMAP).toHaveLength(18)
    expect(new Set(INITIAL_ROADMAP.map((item) => item.key)).size).toBe(18)
    expect(
      INITIAL_ROADMAP.filter((item) => item.status === 'done')
        .map((item) => item.key)
        .sort(),
    ).toEqual(['axios', 'framework', 'notification-sounds', 'typing'])
  })

  it.each([0, 1])('creates only missing entries when existing count is %s', async (totalDocs) => {
    const count = vi.fn().mockResolvedValue({ totalDocs })
    const create = vi.fn().mockResolvedValue({})
    const payload = { count, create, logger: { info: vi.fn() } } as unknown as Payload
    await seedRoadmap(payload)
    expect(count).toHaveBeenCalledTimes(18)
    expect(create).toHaveBeenCalledTimes(totalDocs ? 0 : 18)
    for (const [request] of create.mock.calls) {
      expect(request).toMatchObject({
        collection: 'roadmap-items',
        locale: 'en',
        data: { published: true },
      })
    }
  })
})
