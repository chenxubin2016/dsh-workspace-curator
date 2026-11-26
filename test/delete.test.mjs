import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, stat, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { deleteOrQueueSession } from '../workspace-delete.js'
import { PendingDeletions } from '../pending-deletions.js'

const SESSION_ID = '11111111-1111-1111-1111-111111111111'

async function fixture(live) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-delete-test-')))
  process.env.DSH_PROFILE_DIR = join(root, 'profile')
  const dir = join(root, 'sessions', '--p--', `session-${SESSION_ID}`)
  const log = join(dir, 'session.v4.jsonl.zstd')
  await mkdir(dir, { recursive: true })
  await writeFile(log, 'x')
  const archived = new Set()
  const pinned = new Set()
  const queued = []
  const detached = []
  const workspace = {
    id: 'ws-1', path: join(root, 'project'), title: 'P', sessionIds: [SESSION_ID],
    detachSession: async id => { detached.push(id) },
  }
  return {
    root, dir, log, archived, queued, detached,
    ctx: {
      sessions: { get: () => live ? { id: SESSION_ID } : undefined },
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

test('a live session is queued without deleting its log or detaching its account', async () => {
  const f = await fixture(true)
  try {
    const result = await deleteOrQueueSession(f.ctx, { queue: async id => { f.queued.push(id) } }, SESSION_ID)
    assert.equal(result.deleted, false)
    assert.equal(result.queued, true)
    assert.deepEqual(f.queued, [SESSION_ID])
    assert.deepEqual(f.detached, [])
    assert.ok(await stat(f.log))
    assert.ok(f.archived.has(SESSION_ID))
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

test('a cold session is deleted immediately and its account is detached', async () => {
  const f = await fixture(false)
  try {
    const result = await deleteOrQueueSession(f.ctx, { queue: async id => { f.queued.push(id) } }, SESSION_ID)
    assert.equal(result.deleted, true)
    assert.equal(result.queued, false)
    assert.deepEqual(f.queued, [])
    assert.deepEqual(f.detached, [SESSION_ID])
    await assert.rejects(stat(f.dir))
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})

test('the restart queue deletes the log once the session is no longer live', async () => {
  const f = await fixture(true)
  try {
    const pending = new PendingDeletions(f.ctx)
    await pending.queue(SESSION_ID)
    f.ctx.sessions = { get: () => undefined }
    await pending.cleanup()
    await assert.rejects(stat(f.dir))
    assert.deepEqual(await pending.entries(), [])
    assert.deepEqual(f.detached, [SESSION_ID])
  } finally {
    await rm(f.root, { recursive: true, force: true })
  }
})
