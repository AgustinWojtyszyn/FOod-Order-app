import { describe, expect, it } from 'vitest'
import { normalizeAdminPeoplePage } from './adminMappers'

describe('adminMappers', () => {
  it('normalizes paged admin people RPC payloads for the admin users table', () => {
    const page = normalizeAdminPeoplePage({
      items: [
        {
          person_id: 'person-1',
          display_name: 'Claudia Sarmiento',
          emails: ['sarmientoclaudia985@gmail.com', 'claudia@example.com'],
          user_ids: ['user-1'],
          role: 'admin',
          first_created: '2026-08-01T10:00:00.000Z'
        }
      ],
      total_count: 20,
      total_pages: 1
    })

    expect(page.total_count).toBe(20)
    expect(page.total_pages).toBe(1)
    expect(page.items).toHaveLength(1)
    expect(page.items[0]).toMatchObject({
      person_id: 'person-1',
      full_name: 'Claudia Sarmiento',
      email: 'sarmientoclaudia985@gmail.com',
      primary_user_id: 'user-1',
      role: 'admin',
      members_count: 2,
      is_grouped: true
    })
  })
})
