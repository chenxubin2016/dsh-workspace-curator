# Workspace curator

A DeepSeek Harness (DSH) plugin that adds one **Settings → Workspace curator**
page for workspace and session housekeeping.

## Features

- Lists ungrouped sessions first, then every workspace with its canonical path
  and session count.
- Adds a workspace from an existing folder (system folder picker or typed path).
- Renames a workspace and moves it up or down in the registry order.
- Removes a workspace registration; its folder and sessions stay, and the
  sessions move to **Ungrouped**.
- Opens a session, archives or restores it, and permanently deletes it.
- Archiving a running session asks first, then stops its work and archives it.
- Shows archived, pinned, and running badges, and disables Delete with a
  visible reason when the Host cannot accept it.

## Install

From the plugin market: search for **Workspace curator**, or install from npm:

```sh
dsh plugin --profile web add dsh-workspace-curator
```

Desktop users install through **Settings → Plugins**. Use the profile name your
Host actually runs instead of `web` when it differs.

Requires DSH `0.2.2-rc.1` or newer.

## Permanent session deletion

DSH's session persistence seam has no delete verb, so this bundle ships a small
Host endpoint. Before removing anything it:

1. collects the session and its subagent descendants;
2. refuses while any member is live in this Host process;
3. refuses while a composed activity provider reports running work (a turn,
   subagent, background job, or reminder);
4. validates every log directory against the persistence-reported layout;
5. removes the session log directories;
6. detaches the ids from workspace accounts, the archive set, and the pin set;
7. announces removal so open pages drop the rows.

Only session logs are removed. Uploaded attachments, projection caches, and
usage statistics are not reclaimed. Deletion is permanent; use **Archive** when
you only want to hide a session.

A session opened during the current DSH run cannot be deleted until the Host
restarts, because its live Agent still owns a write handle.

## Endpoint trust

`/api/workspace-curator` is an exact Fetch route on DSH's shared `/api` channel.
The connection layer authenticates the browser cookie and applies its
Host/Origin fence before the handler runs. The handler additionally requires
`x-workspace-curator: 1` and `content-type: application/json` on `POST`, which a
cross-site form or simple fetch cannot send. A request without a valid browser
session receives the connection layer's `401` and never reaches deletion.

Run a single DSH Host per session store. The lock file in a session directory is
an empty placeholder and cannot distinguish an idle session from one another
Host process is writing.

## Development

The package is a plain ES module bundle; no build step is required.

- `index.js` — Host route and request handling.
- `session-delete.js` — deletion tree, activity checks, and storage validation.
- `client.js` — Settings page registered through the Web client module table.
- `cordis.patch.yml` — inserts the plugin row.

## License

MIT
