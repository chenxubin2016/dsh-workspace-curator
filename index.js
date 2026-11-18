/**
 * Workspace Admin, Host half.
 *
 * Registers one exact Fetch route on DSH's shared `/api` channel:
 *
 * - `GET  /api/workspace-curator` — liveness/version probe.
 * - `POST /api/workspace-curator` with `{ action: 'delete-session', sessionId }`.
 *
 * Workspace CRUD stays on the native Workspace Remote namespace; this route
 * exists only for the one capability that namespace does not expose:
 * permanently removing a stored Session tree and its registry references.
 *
 * The connection layer authenticates the browser cookie and applies its
 * Host/Origin fence before this handler runs, so the route needs no separate
 * token and works in a page that is already authenticated.
 */

import { AdminError, deleteStoredSession } from './session-delete.js'

/** Path below `/api`; the connection layer matches exact routes first. */
const PATH = '/api/workspace-curator'

/** Custom request header that a cross-site form or simple fetch cannot set. */
const GUARD_HEADER = 'x-workspace-curator'

/** Session identity shape accepted from the wire. */
const SESSION_ID = /^[A-Za-z0-9._-]{1,128}$/

/** Services required by the page and by permanent Session deletion. */
export const inject = ['connection', 'workspaceRegistry', 'sessionPersistence', 'sessions', 'agents']

/**
 * Register the admin route for the lifetime of this plugin.
 * @param ctx - Host context carrying the Connection and Session services.
 */
export function apply(ctx) {
  ctx.effect(() => ctx.connection.fetch.register({
    path: PATH,
    methods: ['GET', 'POST'],
    requestBody: 'buffered',
    fetch: request => handle(ctx, request),
  }), 'workspace-curator: api route')
}

/**
 * Answer one admin request as a Fetch response.
 * @param ctx - Host context.
 * @param request - authenticated request from an owner browser Peer.
 * @returns JSON response.
 */
async function handle(ctx, request) {
  try {
    if (request.method === 'GET') {
      return json(200, { ok: true, plugin: 'workspace-curator', version: 3 })
    }
    if (request.headers.get(GUARD_HEADER) !== '1') {
      throw new AdminError('request/forbidden', 'missing workspace-curator guard header', 403)
    }
    const contentType = request.headers.get('content-type') ?? ''
    if (!contentType.toLowerCase().startsWith('application/json')) {
      throw new AdminError('request/bad-json', 'content-type must be application/json', 415)
    }
    const body = parseJson(await request.text())
    if (body.action === 'delete-session') {
      const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
      if (!SESSION_ID.test(sessionId)) {
        throw new AdminError('session/bad-id', 'sessionId is not a valid Session identity', 400)
      }
      const result = await deleteStoredSession(ctx, sessionId)
      try {
        ctx.emit('api-session/removed', sessionId)
      } catch (error) {
        ctx.logger?.warn?.(`workspace-curator: removal announcement failed for "${sessionId}": ${String(error)}`)
      }
      if (result.warnings.length > 0) {
        ctx.logger?.warn?.(`workspace-curator: deleted "${sessionId}" with cleanup warnings: ${result.warnings.join('; ')}`)
      }
      ctx.logger?.info?.(`workspace-curator: deleted "${sessionId}" (${String(result.removedCount)} session dir(s))`)
      return json(200, { ok: true, sessionId, ...result })
    }
    throw new AdminError('request/unknown-action', 'unknown action', 400)
  } catch (error) {
    if (error instanceof AdminError) {
      return json(error.status, {
        error: { code: error.code, message: error.message, ...(error.details === undefined ? {} : { details: error.details }) },
      })
    }
    ctx.logger?.warn?.(`workspace-curator: request failed: ${String(error)}`)
    return json(500, { error: { code: 'server/failed', message: String(error) } })
  }
}

/**
 * Parse one JSON object.
 * @param text - Body text.
 * @returns the parsed object.
 * @throws {AdminError} when the body is not a JSON object.
 */
function parseJson(text) {
  let value
  try {
    value = JSON.parse(text)
  } catch {
    throw new AdminError('request/bad-json', 'request body is not valid JSON', 400)
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new AdminError('request/bad-json', 'request body must be a JSON object', 400)
  }
  return value
}

/**
 * Build one JSON response.
 * @param status - HTTP status code.
 * @param payload - JSON-safe payload.
 * @returns Fetch response with no-store caching.
 */
function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}
