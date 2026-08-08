import { inspectScope } from './tenant-scope.inspector'

const M = 'OutboxMessage'

describe('inspectScope', () => {
  it('ignores unregistered models', () => {
    expect(inspectScope({ model: 'Product', operation: 'findMany', args: {} })).toEqual([])
    expect(inspectScope({ model: undefined, operation: '$queryRaw', args: {} })).toEqual([])
  })

  it('flags reads without store scope', () => {
    const v = inspectScope({ model: M, operation: 'findMany', args: { where: { status: 'pending' } } })
    expect(v.map(x => x.kind).sort()).toEqual(['missing_mode_scope', 'missing_store_scope'])
  })

  it('accepts a fully scoped read', () => {
    expect(inspectScope({ model: M, operation: 'findMany', args: { where: { store_id: 1n, mode: 'live' } } })).toEqual([])
  })

  it('accepts scope nested inside AND', () => {
    expect(inspectScope({ model: M, operation: 'findMany',
      args: { where: { AND: [{ store_id: 1n }, { mode: 'live' }] } } })).toEqual([])
  })

  it('accepts equals-form filters', () => {
    expect(inspectScope({ model: M, operation: 'findFirst',
      args: { where: { store_id: { equals: 1n }, mode: { equals: 'live' } } } })).toEqual([])
  })

  it('flags creates missing tenant fields', () => {
    const v = inspectScope({ model: M, operation: 'create', args: { data: { event_type: 'x' } } })
    expect(v.map(x => x.kind).sort()).toEqual(['missing_mode_value', 'missing_store_value'])
  })

  it('accepts a fully populated create', () => {
    expect(inspectScope({ model: M, operation: 'create',
      args: { data: { store_id: 1n, mode: 'live' } } })).toEqual([])
  })

  it('inspects every row of createMany', () => {
    const v = inspectScope({ model: M, operation: 'createMany',
      args: { data: [{ store_id: 1n, mode: 'live' }, { store_id: 2n }] } })
    expect(v).toHaveLength(1)
    expect(v[0].kind).toBe('missing_mode_value')
  })

  it('flags a mismatch against the request context', () => {
    const v = inspectScope({ model: M, operation: 'findMany',
      args: { where: { store_id: 9n, mode: 'live' } }, contextStoreId: '1' })
    expect(v).toHaveLength(1)
    expect(v[0].kind).toBe('store_scope_mismatch')
  })

  it('does not flag a matching context', () => {
    expect(inspectScope({ model: M, operation: 'findMany',
      args: { where: { store_id: 1n, mode: 'live' } }, contextStoreId: '1' })).toEqual([])
  })

  it('flags deletes and updates without scope', () => {
    for (const op of ['updateMany', 'deleteMany', 'update', 'delete']) {
      expect(inspectScope({ model: M, operation: op, args: { where: { id: 1n } } }).length).toBeGreaterThan(0)
    }
  })

  it('checks the create branch of upsert', () => {
    const v = inspectScope({ model: M, operation: 'upsert',
      args: { where: { store_id: 1n, mode: 'live' }, create: { event_type: 'x' }, update: {} } })
    expect(v.map(x => x.kind)).toEqual(['missing_store_value'])
  })

  it('tolerates missing or malformed args', () => {
    expect(() => inspectScope({ model: M, operation: 'findMany', args: undefined })).not.toThrow()
    expect(() => inspectScope({ model: M, operation: 'create', args: { data: null } })).not.toThrow()
  })
})
