# Workspace curator

A DeepSeek Harness (DSH) plugin for workspace and session housekeeping.

## Features

- Adds **Delete session** to the session row's `…` / right-click menu; no
  Settings trip and no keyboard shortcut is registered.
- Replaces the workspace row's delete entry with **Delete workspace**: the
  confirmation keeps the native wording the product expects, shows the session
  count and folder path, and then removes every session, the workspace folder,
  and the workspace registration.
- The plugin hides the native DSH workspace-delete action with a small
  compatibility shim so only one delete entry is visible. Other access checks
  are untouched; if a future DSH release makes the action inaccessible to
  plugins, the native item may reappear.
- Keeps the **Settings → Workspace curator** page for adding, renaming,
  reordering workspaces and for an overview of sessions.
- Archiving a running session still stops its work first.
- Shows session counts and folder paths before deleting user files.

## Install

From the plugin market, or:

```sh
dsh plugin --profile web add dsh-workspace-curator
```

Desktop users install through **Settings → Plugins**. Use the profile name your
Host actually runs instead of `web` when it differs.

Requires DSH `0.2.2-rc.5` or newer.

## Permanent deletion

DSH's session persistence seam has no delete verb, so this bundle removes the
log directories itself. Confirmation is required before anything is removed.

- **Cold session**: log, subagent descendants, workspace account references,
  archive entry, and pin entry are removed immediately.
- **Live session**: the Agent still owns a write handle, so the session is
  archived (its running work stops and it disappears from the list) and its id
  is queued. The log is removed at the next DSH start. The UI shows
  **restart DSH to finish cleaning the disk log**; it no longer refuses the
  action.
- **Workspace**: every session is deleted or queued, then the workspace folder
  is removed recursively, then the registration is removed. The folder may
  contain files unrelated to DSH; the confirmation says so and requires an
  explicit checkbox. The Host refuses to remove the running working directory,
  the home directory, filesystem roots, or DSH-managed folders.

Only session logs and the selected workspace folder are removed. Attachments
and projection caches outside the folder may remain.

## Endpoint trust

`/api/workspace-curator` is an exact Fetch route on DSH's shared `/api`
channel. The connection layer authenticates the browser cookie and applies its
Host/Origin fence before the handler runs. The handler additionally requires
`x-workspace-curator: 1` and `content-type: application/json` on `POST`.

## Development

- `index.js` — Host route.
- `session-delete.js` — per-session deletion tree and storage validation.
- `pending-deletions.js` — durable queue for live sessions.
- `workspace-delete.js` — cascade, folder removal, and path protection.
- `client.js` — Settings page, context-menu contributions, and confirmation
  overlay.

## License

MIT
