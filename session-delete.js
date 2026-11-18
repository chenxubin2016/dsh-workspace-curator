/**
 * Host-side permanent deletion of one stored Session and its subagent descendants.
 *
 * The Session persistence seam has no delete verb, so this module removes the
 * per-Session log directories itself, then clears the Workspace registry's
 * references. It only accepts Sessions with no live instance, no live child
 * subagent, and no running activity reported by the composed providers.
 */

import { rm } from 'node:fs/promises'
import { basename, dirname } from 'node:path'

/** One safe filesystem segment. */
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/

/** Accepted basenames of the canonical generation file inside a Session directory. */
const SESSION_LOG_FILE = /^session(\.[A-Za-z0-9]+)*\.jsonl(\.zstd)?$/

/** A refusal or failure with a wire code the Client turns into localized copy. */
export class AdminError extends Error {
  /**
   * @param code - stable machine code returned to the page.
   * @param message - developer-facing English text, logged and used as fallback.
   * @param status - HTTP status for the route response.
   * @param details - optional structured context.
   */
  constructor(code, message, status, details) {
    super(message)
    this.name = 'AdminError'
    this.code = code
    this.status = status
    this.details = details
  }
}

/**
 * Permanently remove one Session tree.
 * @param ctx - Host context carrying the Session store, Agents, persistence, and Workspace registry.
 * @param sessionId - Session identity validated by the route.
 * @returns removed paths, warnings, and whether the log was already gone.
 * @throws {AdminError} when a Session is live or active, or stored in an unexpected layout.
 */
export async function deleteStoredSession(ctx, sessionId) {
  const targets = await collectTree(ctx, sessionId)
  await assertInactive(ctx, targets)
  const removals = await resolveRemovals(ctx, targets)
  // Children first, so an interrupted removal never leaves a live child whose
  // parent log is already gone.
  for (const removal of [...removals].reverse()) {
    await rm(removal.directory, { recursive: true, force: true })
  }
  const warnings = []
  for (const id of targets) await detachReferences(ctx, id, warnings)
  return {
    alreadyGone: removals.length === 0,
    removedCount: removals.length,
    removedPaths: removals.map(removal => removal.directory),
    warnings,
  }
}

/**
 * Collect the Session and its direct or transitive subagent descendants.
 * Other fork children keep their own logs: only `origin: 'subagent'` rows are
 * part of this Session's execution tree.
 * @param ctx - Host context.
 * @param root - Session being deleted.
 * @returns root first, descendants after.
 */
async function collectTree(ctx, root) {
  const snapshots = await ctx.sessionPersistence.list()
  const children = new Map()
  for (const snapshot of snapshots) {
    const parent = snapshot.header.parentSession
    if (parent === undefined || snapshot.header.origin !== 'subagent') continue
    const list = children.get(parent) ?? []
    list.push(snapshot.header.id)
    children.set(parent, list)
  }
  const targets = [root]
  for (let index = 0; index < targets.length; index += 1) {
    for (const child of children.get(targets[index]) ?? []) {
      if (!targets.includes(child)) targets.push(child)
    }
  }
  return targets
}

/**
 * Refuse the whole tree while any member is live or reports running activity.
 * Every check runs before any directory is removed.
 * @param ctx - Host context.
 * @param targets - root and subagent descendants.
 * @throws {AdminError} naming the first live or active member.
 */
async function assertInactive(ctx, targets) {
  for (const id of targets) {
    if (ctx.sessions.get(id) !== undefined) {
      throw new AdminError('session/open', `Session "${id}" is live in this process`, 409, { sessionId: id })
    }
    if (ctx.agents.get(id) !== undefined) {
      throw new AdminError('session/open', `Session "${id}" still owns a live Agent`, 409, { sessionId: id })
    }
    const activity = await readActivity(ctx, id)
    if (activity.length > 0) {
      throw new AdminError('session/active', `Session "${id}" still reports running work`, 409, {
        sessionId: id,
        activity,
      })
    }
  }
}

/**
 * Ask the composed activity providers what still runs for one Session.
 * @param ctx - Host context.
 * @param sessionId - member of the tree.
 * @returns reported families; empty when nothing runs.
 */
async function readActivity(ctx, sessionId) {
  const reported = await ctx.waterfall(
    'workspace/session-activity',
    { sessionId },
    () => Promise.resolve([]),
  )
  return Array.isArray(reported) ? reported : []
}

/**
 * Resolve and validate every removable log directory before deleting anything.
 * @param ctx - Host context.
 * @param targets - root and subagent descendants.
 * @returns validated directories, parent first.
 * @throws {AdminError} for an unsupported storage layout.
 */
async function resolveRemovals(ctx, targets) {
  const removals = []
  for (const id of targets) {
    const snapshot = await ctx.sessionPersistence.stat(id)
    if (snapshot === undefined) continue
    const location = snapshot.location
    if (location === undefined || location.kind !== 'jsonl' || typeof location.path !== 'string') {
      throw new AdminError('session/unsupported-layout', `Session "${id}" has no removable JSONL log`, 409, { sessionId: id })
    }
    const directory = dirname(location.path)
    const directoryName = basename(directory)
    if (!SAFE_SEGMENT.test(directoryName)
      || directoryName === '.'
      || directoryName === '..'
      || !directoryName.includes(String(id))
      || !SESSION_LOG_FILE.test(basename(location.path))
      || dirname(location.path) !== directory
      || dirname(directory) === directory) {
      throw new AdminError(
        'session/unsupported-layout',
        `Refusing to remove unexpected path "${location.path}"`,
        409,
        { sessionId: id, path: location.path },
      )
    }
    removals.push({ id, directory })
  }
  return removals
}

/**
 * Drop every Workspace-account, archive, and pin reference to one removed Session.
 * @param ctx - Host context carrying the Workspace registry.
 * @param sessionId - Removed Session identity.
 * @param warnings - accumulator for non-fatal cleanup failures.
 */
async function detachReferences(ctx, sessionId, warnings) {
  const registry = ctx.workspaceRegistry
  for (const workspace of registry.list()) {
    if (!workspace.sessionIds.includes(sessionId)) continue
    try {
      await workspace.detachSession(sessionId)
    } catch (error) {
      warnings.push(`workspace ${workspace.id} detach failed: ${String(error)}`)
    }
  }
  if (registry.archivedSessionIds.includes(sessionId)) {
    try {
      await registry.unarchiveSession(sessionId)
    } catch (error) {
      warnings.push(`unarchive failed: ${String(error)}`)
    }
  }
  if (registry.pinnedSessionIds.includes(sessionId)) {
    try {
      await registry.unpinSession(sessionId)
    } catch (error) {
      warnings.push(`unpin failed: ${String(error)}`)
    }
  }
}
