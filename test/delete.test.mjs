import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, stat, realpath, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { deleteOrQueueSession } from '../workspace-delete.js'

const SESSION_ID = '11111111-1111-1111-1111-111111111111'

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-delete-test-')))
  const base = join(root, 'sessions', '--p--')
  const dir = join(base, `session-${SESSION_ID}`)
  const log = join(dir, 'session.v4.jsonl.zstd')
  await mkdir(dir, { recursive: true })
  await writeFile(log, 'x')
  const archived = new Set()
  const pinned = new Set()
  const queued = []
  const workspace = {
    id: 'ws-1', path: join(root, 'project'), title: 'P', sessionIds: [SESSION_ID],
    detachSession: async () => {},
  }
  return {
    root, base, dir, log, archived, pinned, queued, workspace,
    ctx: {
      sessions: { get: () => ({ id: SESSION_ID }) },
      agents: { get: () => undefined },
      waterfall: async () => [],
      sessionPersistence: {
        list: async () => [{ header: { id: SESSION_ID } }],
        stat: async () => ({ location: { kind: 'jsonl', path: log } }),
      },
      workspaceRegistry: {
        list: () => [workspace],
        get: id => id === 'ws-1' ? workspace : undefined,
        get archivedSessionIds() { return [...archived] },
        get pinnedSessionIds() { return [...pinned] },
        archiveSession: async id => { archived.add(id) },
        unarchiveSession: async id => { archived.delete(id) },
        unpinSession: async id => { pinned.delete(id) },
      },
      emit: () => {}, logger: { warn() {}, info() {} },
    },
  }
}

test('live idle session is deleted immediately, not archived', async () => {
  const f = await fixture()
  try {
    const result = await deleteOrQueueSession(f.ctx, { queue: async id => { f.queued.push(id) } }, SESSION_ID)
    assert.equal(result.deleted, true)
    assert.equal(result.queued, false)
    assert.deepEqual(f.queued, [])
    await assert.rejects(stat(f.dir))
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

test('live session whose log is still held falls back to the restart queue', async () => {
  const f = await fixture()
  try {
    await chmod(f.base, 0o500)
    let result
    try {
      result = await deleteOrQueueSession(f.ctx, { queue: async id => { f.queued.push(id) } }, SESSION_ID)
    } finally {
      await chmod(f.base, 0o700)
    }
    assert.equal(result.deleted, false)
    assert.equal(result.queued, true)
    assert.deepEqual(f.queued, [SESSION_ID])
    assert.ok(await stat(f.log))
  } finally {
    await chmod(f.base, 0o700).catch(() => {})
    await rm(f.root, { recursive: true, force: true })
  }
})

test('cold session is deleted immediately without touching the queue', async () => {
  const f = await fixture()
  try {
    f.ctx.sessions = { get: () => undefined }
    const result = await deleteOrQueueSession(f.ctx, { queue: async id => { f.queued.push(id) } }, SESSION_ID)
    assert.equal(result.deleted, true)
    assert.equal(result.queued, false)
    assert.deepEqual(f.queued, [])
    await assert.rejects(stat(f.dir))
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

test('a just-created live session is deleted after archiving clears its turn', async () => {
  const f = await fixture()
  try {
    let active = true
    f.ctx.waterfall = async () => active ? [{ kind: 'turn' }] : []
    const archive = f.ctx.workspaceRegistry.archiveSession
    f.ctx.workspaceRegistry.archiveSession = async id => {
      await archive(id)
      active = false
    }
    const result = await deleteOrQueueSession(f.ctx, { queue: async id => { f.queued.push(id) } }, SESSION_ID)
    assert.equal(result.deleted, true)
    assert.equal(result.queued, false)
    assert.deepEqual(f.queued, [])
    await assert.rejects(stat(f.dir))
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})
