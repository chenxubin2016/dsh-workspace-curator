/**
 * Host-side removal of one Workspace: its Session tree, its folder, and its
 * registry record.
 *
 * A Workspace folder is user content, so the path is re-resolved and checked
 * against the running Host's own locations before anything is removed. Live
 * Sessions are archived and queued for the next Host start; cold Sessions are
 * removed immediately.
 */

import { realpath, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { parse, resolve, sep } from 'node:path'
import { AdminError, deleteStoredSession } from './session-delete.js'

/**
 * Whether one path is the parent or the same path.
 * @param child - candidate child.
 * @param parent - candidate parent.
 * @returns true when `child` equals `parent` or sits below it.
 */
function isInside(child, parent) {
  return child === parent || child.startsWith(parent.endsWith(sep) ? parent : `${parent}${sep}`)
}

/**
 * Validate a Workspace folder before removing user content.
 * @param folder - canonical Workspace path.
 * @returns the resolved target and whether it is already missing.
 * @throws {AdminError} for protected paths or a non-directory target.
 */
export async function assertWorkspacePathRemovable(folder) {
  const absolute = resolve(folder)
  let target
  try {
    target = await realpath(absolute)
  } catch (error) {
    if (error?.code === 'ENOENT') return { target: absolute, missing: true }
    throw error
  }

  if (target !== absolute) {
    throw new AdminError('workspace/path-changed', 'Workspace path now resolves elsewhere', 409, { path: absolute, target })
  }

  const root = parse(target).root
  const home = homedir()
  const dshHome = resolve(home, '.dsh')
  const profile = process.env.DSH_PROFILE_DIR
  const install = process.env.DSH_INSTALL_DIR
  const cwd = process.cwd()

  const protectedPath = (candidate) => {
    if (target === candidate) return true
    // The target may contain a protected location, or be one.
    if (isInside(target, candidate) || isInside(candidate, target)) return true
    return false
  }

  if (target === root) {
    throw new AdminError('workspace/protected-path', 'refusing to remove a filesystem root', 409, { path: target })
  }
  if (isInside(home, target)) {
    throw new AdminError('workspace/protected-path', 'refusing to remove the home directory or an ancestor', 409, { path: target })
  }
  if (protectedPath(dshHome)
    || (profile !== undefined && protectedPath(resolve(profile)))
    || (install !== undefined && protectedPath(resolve(install)))) {
    throw new AdminError('workspace/protected-path', 'refusing to remove a DSH-managed folder', 409, { path: target })
  }
  if (isInside(cwd, target)) {
    throw new AdminError('workspace/protected-path', 'refusing to remove the running working directory or an ancestor', 409, { path: target })
  }

  const info = await stat(target)
  if (!info.isDirectory()) {
    throw new AdminError('workspace/not-a-directory', 'Workspace path is not a directory', 409, { path: target })
  }
  return { target, missing: false }
}

/**
 * Archive and queue one live Session, or delete one cold Session.
 * @param ctx - Host context.
 * @param pending - durable pending-deletion store.
 * @param sessionId - Session to remove.
 * @returns whether it was deleted now or queued for restart.
 */
export async function deleteOrQueueSession(ctx, pending, sessionId) {
  const live = ctx.sessions.get(sessionId) !== undefined || ctx.agents.get(sessionId) !== undefined
  const activity = await ctx.waterfall(
    'workspace/session-activity',
    { sessionId },
    () => Promise.resolve([]),
  )
  const active = Array.isArray(activity) && activity.length > 0

  if (live || active) {
    const archived = ctx.workspaceRegistry.archivedSessionIds.includes(sessionId)
    if (!archived) {
      await ctx.workspaceRegistry.archiveSession(sessionId, { stopActivity: true })
    }
  }

  let lastError
  // Archiving stops activity, but providers can take a moment to clear.
  // Give a just-created/just-stopped session a short window to become idle so
  // the common case is a real deletion instead of an archived queued row.
  const attempts = live ? 9 : 1
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const result = await deleteStoredSession(ctx, sessionId, { allowLive: live })
      return { deleted: true, queued: false, result }
    } catch (error) {
      lastError = error
      const retry = live && error instanceof AdminError && error.code === 'session/active'
        && attempt < attempts - 1
      if (!retry) break
      await new Promise(resolve => setTimeout(resolve, 250))
    }
  }

  if (!live) throw lastError
  // A live Agent owns the log. Try the removal after archiving; only when the
  // filesystem or an activity provider still holds it do we defer to the next
  // Host start.
  if (lastError instanceof AdminError
    && (lastError.code === 'session/unsupported-layout' || lastError.code === 'session/bad-id')) {
    throw lastError
  }
  await pending.queue(sessionId)
  return { deleted: false, queued: true }
}

/**
 * Remove one Workspace: Sessions first, then the folder, then the registration.
 * @param ctx - Host context.
 * @param pending - durable pending-deletion store.
 * @param workspaceId - Workspace identity.
 * @returns counts and restart requirement.
 * @throws {AdminError} when the folder is protected or a hard deletion fails.
 */
export async function deleteWorkspaceTree(ctx, pending, workspaceId) {
  const workspace = ctx.workspaceRegistry.get(workspaceId)
  if (workspace === undefined) {
    throw new AdminError('workspace/not-found', `Workspace "${workspaceId}" was not found`, 404, { workspaceId })
  }

  // Removing the only Workspace makes DSH initialize a fresh default
  // Workspace on the next restore, complete with a blank Session. Refuse it
  // instead of silently creating replacement data.
  if (ctx.workspaceRegistry.list().length <= 1) {
    throw new AdminError('workspace/last-workspace', 'The only workspace cannot be deleted', 409, { workspaceId })
  }

  const pathCheck = await assertWorkspacePathRemovable(workspace.path)
  const sessionIds = [...workspace.sessionIds]
  let deleted = 0
  let queued = 0
  const warnings = []

  for (const sessionId of sessionIds) {
    let outcome
    try {
      outcome = await deleteOrQueueSession(ctx, pending, sessionId)
    } catch (error) {
      throw new AdminError(
        'workspace/session-delete-failed',
        `Workspace "${workspaceId}" could not remove Session "${sessionId}": ${String(error)}`,
        500,
        { workspaceId, sessionId },
      )
    }
    if (outcome.queued) {
      queued += 1
    } else {
      deleted += 1
      try {
        ctx.emit('api-session/removed', sessionId)
      } catch (error) {
        warnings.push(`announcement failed: ${String(error)}`)
      }
    }
    if (Array.isArray(outcome.result?.warnings)) warnings.push(...outcome.result.warnings)
  }

  let folderRemoved = false
  if (!pathCheck.missing) {
    try {
      await rm(pathCheck.target, { recursive: true, force: true })
      folderRemoved = true
    } catch (error) {
      throw new AdminError(
        'workspace/folder-delete-failed',
        `Workspace "${workspaceId}" sessions were removed, but its folder could not be removed: ${String(error)}`,
        500,
        { workspaceId, path: pathCheck.target },
      )
    }
  }

  await ctx.workspaceRegistry.delete(workspaceId)
  return {
    deleted,
    queued,
    requiresRestart: queued > 0,
    folderRemoved,
    sessionCount: sessionIds.length,
    warnings,
  }
}
