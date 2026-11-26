/**
 * Durable queue of Sessions whose logs must be removed after the Host restarts.
 *
 * A Session that is live in the current Host owns a write handle, so its log
 * cannot be removed safely now. The delete action archives it immediately and
 * records the id here; the next Host startup removes the log before any Agent
 * can reopen it.
 *
 * The queue is a small JSON file beside the profile, deliberately dependency
 * free so it resolves without relying on the Host's package table.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { deleteStoredSession } from './session-delete.js'

/** Directory holding this plugin's durable queue. */
function queueFile() {
  const profile = process.env.DSH_PROFILE_DIR
  const base = profile !== undefined && profile !== ''
    ? profile
    : join(homedir(), '.dsh', 'workspace-curator')
  return join(base, 'pending-deletions.json')
}

/** Durable pending-deletion store backed by a JSON file. */
export class PendingDeletions {
  /** @param ctx - Host context used when cleaning queued logs. */
  constructor(ctx) {
    this.ctx = ctx
    this.file = queueFile()
    this.ids = []
    this.tail = Promise.resolve()
    this.opening = this.load()
  }

  /** Read the queue, treating an absent file as empty. */
  async load() {
    try {
      const raw = await readFile(this.file, 'utf8')
      const parsed = JSON.parse(raw)
      this.ids = Array.isArray(parsed) ? parsed.filter(id => typeof id === 'string') : []
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        this.ctx.logger?.warn?.(`workspace-curator: could not read pending deletions: ${String(error)}`)
      }
      this.ids = []
    }
  }

  /**
   * Persist one id snapshot atomically.
   * @param ids - ids to write.
   */
  async save(ids) {
    await mkdir(dirname(this.file), { recursive: true })
    const temporary = `${this.file}.${process.pid}.tmp`
    await writeFile(temporary, JSON.stringify(ids), 'utf8')
    await rename(temporary, this.file)
  }

  /** Wait for the initial read. */
  async ready() {
    await this.opening
  }

  /**
   * Record one Session for cleanup after restart.
   * @param sessionId - Session whose log must be removed later.
   */
  async queue(sessionId) {
    await this.ready()
    const operation = this.tail.then(async () => {
      if (!this.ids.includes(sessionId)) {
        const next = [...this.ids, sessionId]
        await this.save(next)
        this.ids = next
      }
    })
    // Keep the chain usable after a failed write; the caller still sees the
    // failure and can retry.
    this.tail = operation.catch(() => {})
    await operation
  }

  /**
   * Read every pending id.
   * @returns entries in queue order.
   */
  async entries() {
    await this.ready()
    return this.ids.map(id => [id, {}])
  }

  /**
   * Remove one id after a successful cleanup.
   * @param sessionId - cleaned Session.
   */
  async forget(sessionId) {
    await this.ready()
    const operation = this.tail.then(async () => {
      const next = this.ids.filter(id => id !== sessionId)
      if (next.length !== this.ids.length) {
        await this.save(next)
        this.ids = next
      }
    })
    this.tail = operation.catch(() => {})
    await operation
  }

  /** Nothing to close for a file-backed queue. */
  async close() {}

  /**
   * Remove every queued Session log that is no longer live.
   *
   * A Session that is still live or still reports activity stays queued for the
   * next start; deleting it now would write into a log another process owns.
   */
  async cleanup() {
    const entries = await this.entries()
    for (const [sessionId] of entries) {
      // A queued Session must be invisible now even when its live Agent keeps
      // the log until restart. The actual deletion below may still defer.
      try {
        this.ctx.emit('api-session/removed', sessionId)
      } catch (error) {
        this.ctx.logger?.warn?.(`workspace-curator: queued removal announcement failed for "${sessionId}": ${String(error)}`)
      }
      try {
        const result = await deleteStoredSession(this.ctx, sessionId)
        try {
          this.ctx.emit('api-session/removed', sessionId)
        } catch (error) {
          this.ctx.logger?.warn?.(`workspace-curator: removal announcement failed for "${sessionId}": ${String(error)}`)
        }
        await this.forget(sessionId)
        if (result.warnings.length > 0) {
          this.ctx.logger?.warn?.(`workspace-curator: cleaned "${sessionId}" with warnings: ${result.warnings.join('; ')}`)
        } else {
          this.ctx.logger?.info?.(`workspace-curator: cleaned queued Session "${sessionId}"`)
        }
      } catch (error) {
        this.ctx.logger?.warn?.(`workspace-curator: queued Session "${sessionId}" is not removable yet: ${String(error)}`)
      }
    }
  }
}
