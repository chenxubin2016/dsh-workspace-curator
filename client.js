/**
 * Workspace Admin, browser half.
 *
 * Adds one Settings page that manages every Workspace (add, rename, reorder,
 * remove) and every non-subagent Session (open, archive/restore, permanently
 * delete). Workspace commands use the native Workspace Remote namespace; the
 * permanent-delete button calls the Host route registered by this bundle with
 * the page token injected into the authenticated index.
 */

window.__ModuleLoader__.load({
  id: 'dsh-workspace-curator',
  factory(require) {
    const React = require('react')
    const {
      Button, Modal, Tooltip, relativeTime,
      IconChevronUpOutlineRegular, IconChevronDownOutlineRegular,
      IconEditOutlineRegular, IconTrashOutlineRegular,
      IconFolderOpenOutlineRegular, IconWarningOutlineRegular,
    } = require('@deepseek-ai/dsh-client-ui-primitives')

    const h = React.createElement
    const NS = 'workspaceCurator'
    const ROUTE = '/api/workspace-curator'

    /** Tokens shared by every surface of this page. */
    const T = {
      text: 'var(--dsw-alias-label-primary)',
      secondary: 'var(--dsw-alias-label-secondary)',
      tertiary: 'var(--dsw-alias-label-tertiary)',
      card: 'var(--dsw-alias-settings-card-fill)',
      stroke: 'var(--dsw-alias-settings-card-stroke)',
      danger: 'var(--dsw-alias-state-error-primary)',
      success: 'var(--dsw-alias-state-success-primary)',
    }

    const zh = {
      nav: '工作区管家',
      'page.title': '工作区管家',
      'page.intro': '添加、重命名、排序或删除工作区；查看每个工作区中的会话，或永久删除不再需要的会话。',
      'add.title': '添加工作区',
      'add.hint': '选择电脑上已有的文件夹；DSH 不会移动或修改其中的文件。',
      'add.field': '文件夹路径',
      'add.placeholder': '/Users/you/project',
      'add.pick': '选择文件夹…',
      'add.submit': '添加',
      'workspaces': '工作区',
      'ungrouped': '未分组',
      'ungrouped.hint': '这些会话不属于任何工作区。',
      'sessions.count.one': '{n} 个会话',
      'sessions.count.other': '{n} 个会话',
      'sessions.empty': '暂无会话',
      'empty.workspaces': '还没有工作区，先添加一个文件夹。',
      'empty.ungrouped': '没有未分组的会话。',
      'loading.workspaces': '正在加载工作区…',
      'loading.sessions': '正在加载会话…',
      'error.workspaces': '工作区列表加载失败，请检查连接后重试。',
      'rename': '重命名',
      'delete': '删除',
      'open': '打开',
      'archive': '归档',
      'unarchive': '取消归档',
      'up': '上移',
      'down': '下移',
      'badge.archived': '已归档',
      'badge.pinned': '已置顶',
      'badge.running': '运行中',
      'confirm.workspace.title': '删除工作区？',
      'confirm.workspace.body': '将把“{name}”从工作区列表中移除。文件夹与其会话都会保留，这些会话会显示在“未分组”下。',
      'confirm.session.title': '永久删除此会话？',
      'confirm.session.body': '“{name}”的会话日志会从磁盘移除，无法恢复。如果它包含子代理会话，这些子会话也会一并删除。只想隐藏请使用“归档”。',
      'confirm.archive.title': '停止并归档此会话？',
      'confirm.archive.body': '“{name}”仍在运行。归档会先停止它正在进行的工作，之后可在“全部对话（显示已归档）”中恢复；被停止的工作不会自动继续。',
      'confirm.cancel': '取消',
      'confirm.deleteWorkspace': '删除工作区',
      'confirm.deleteSession': '永久删除',
      'confirm.archiveAction': '停止并归档',
      'confirm.deleting': '正在删除…',
      'confirm.archiving': '正在停止并归档…',
      'rename.title': '重命名工作区',
      'rename.field': '工作区名称',
      'rename.submit': '保存',
      'rename.saving': '正在保存…',
      'close': '关闭',
      'busy': '正在处理…',
      'notice.workspaceAdded': '工作区已就绪。',
      'notice.workspaceRenamed': '工作区已重命名。',
      'notice.workspaceDeleted': '工作区已删除，其会话已移入“未分组”。',
      'notice.sessionDeleted': '会话已从磁盘删除。',
      'notice.sessionDeletedWarnings': '会话已删除，但部分引用未能清理：{message}',
      'notice.sessionAlreadyGone': '该会话已不存在，列表已刷新。',
      'notice.sessionArchived': '会话已归档。',
      'notice.sessionUnarchived': '会话已取消归档。',
      'err.generic': '操作失败：{message}',
      'err.open': '该会话在当前 DSH 运行期间打开过，暂时无法安全删除。请重启 DSH 后再试，或改用“归档”。',
      'err.active': '该会话仍有运行中的工作（回合、子代理、后台任务或定时提醒）。请先停止这些工作，或改用“归档”。',
      'err.refresh': '登录状态可能已失效。请刷新页面或重新打开 DSH 链接后再试。',
      'err.notFound': '该会话已不存在，列表已刷新。',
      'err.forbidden': '请求被拒绝。如果刚更新过插件，请刷新页面后再试。',
      'err.unavailable': '无法连接删除服务：{message}。请确认页面由 DSH 提供；也可以改用“归档”。',
      'err.badId': '会话标识无效，未执行删除。',
      'err.layout': '该会话的存储格式无法安全删除，已取消。',
      'err.workspaceGone': '该工作区已不存在。',
      'err.archiveActive': '会话仍在运行，无法归档。请先停止它的工作。',
      'err.pickerUnavailable': '当前环境不支持系统目录选择器，请直接输入文件夹路径。',
      'err.nameConflict': '已存在同名工作区，请换一个名称。',
      'err.invalidPath': '该路径不是可用的文件夹。',
      'hint.archived': '已归档，取消归档后可打开',
      'hint.checking': '正在检查删除服务…',
      'hint.deleteUnavailable': '删除不可用：{reason}',
      'time.justNow': '刚刚',
      'time.minutes': '{n} 分钟前',
      'time.hours': '{n} 小时前',
      'time.days': '{n} 天前',
      'time.months': '{n} 个月前',
      'time.years': '{n} 年前',
      'footer.note': '永久删除只移除会话日志；已上传的附件与缓存可能继续占用磁盘空间。',
    }

    const en = {
      nav: 'Workspace curator',
      'page.title': 'Workspace curator',
      'page.intro': 'Add, rename, reorder, or remove workspaces; review the sessions in each one, or permanently delete sessions you no longer need.',
      'add.title': 'Add a workspace',
      'add.hint': 'Choose an existing folder. DSH never moves or modifies its files.',
      'add.field': 'Folder path',
      'add.placeholder': '/Users/you/project',
      'add.pick': 'Choose folder…',
      'add.submit': 'Add',
      'workspaces': 'Workspaces',
      'ungrouped': 'Ungrouped',
      'ungrouped.hint': 'These sessions do not belong to any workspace.',
      'sessions.count.one': '{n} session',
      'sessions.count.other': '{n} sessions',
      'sessions.empty': 'No sessions',
      'empty.workspaces': 'No workspaces yet. Add a folder first.',
      'empty.ungrouped': 'No ungrouped sessions.',
      'loading.workspaces': 'Loading workspaces…',
      'loading.sessions': 'Loading sessions…',
      'error.workspaces': 'The workspace list could not load. Check the connection and retry.',
      'rename': 'Rename',
      'delete': 'Delete',
      'open': 'Open',
      'archive': 'Archive',
      'unarchive': 'Unarchive',
      'up': 'Move up',
      'down': 'Move down',
      'badge.archived': 'Archived',
      'badge.pinned': 'Pinned',
      'badge.running': 'Running',
      'confirm.workspace.title': 'Delete this workspace?',
      'confirm.workspace.body': '“{name}” is removed from the workspace list. Its folder and sessions are kept; those sessions appear under “Ungrouped”.',
      'confirm.session.title': 'Delete this session permanently?',
      'confirm.session.body': 'The session log for “{name}” is removed from disk and cannot be recovered. Subagent sessions it contains are removed too. Use “Archive” to hide it instead.',
      'confirm.archive.title': 'Stop and archive this session?',
      'confirm.archive.body': '“{name}” is still running. Archiving first stops its work; you can restore it from “All conversations (including archived)”. Stopped work does not resume automatically.',
      'confirm.cancel': 'Cancel',
      'confirm.deleteWorkspace': 'Delete workspace',
      'confirm.deleteSession': 'Delete permanently',
      'confirm.archiveAction': 'Stop and archive',
      'confirm.deleting': 'Deleting…',
      'confirm.archiving': 'Stopping and archiving…',
      'rename.title': 'Rename workspace',
      'rename.field': 'Workspace name',
      'rename.submit': 'Save',
      'rename.saving': 'Saving…',
      'close': 'Close',
      'busy': 'Working…',
      'notice.workspaceAdded': 'Workspace is ready.',
      'notice.workspaceRenamed': 'Workspace renamed.',
      'notice.workspaceDeleted': 'Workspace deleted; its sessions moved to “Ungrouped”.',
      'notice.sessionDeleted': 'Session removed from disk.',
      'notice.sessionDeletedWarnings': 'Session removed, but some references could not be cleared: {message}',
      'notice.sessionAlreadyGone': 'That session no longer exists; the list has been refreshed.',
      'notice.sessionArchived': 'Session archived.',
      'notice.sessionUnarchived': 'Session unarchived.',
      'err.generic': 'Action failed: {message}',
      'err.open': 'This session was opened during the current DSH run, so it cannot be deleted safely. Restart DSH and retry, or archive it instead.',
      'err.active': 'This session still has running work (a turn, subagent, background job, or reminder). Stop that work first, or archive the session instead.',
      'err.refresh': 'The browser session may have expired. Refresh the page or reopen the DSH link and try again.',
      'err.notFound': 'That session no longer exists; the list has been refreshed.',
      'err.forbidden': 'The request was rejected. If the plugin was just updated, refresh the page and retry.',
      'err.unavailable': 'Cannot reach the delete service: {message}. Confirm the page is served by DSH, or archive the session instead.',
      'err.badId': 'Invalid session id; nothing was deleted.',
      'err.layout': 'This session uses a storage format that cannot be removed safely; deletion was cancelled.',
      'err.workspaceGone': 'That workspace no longer exists.',
      'err.archiveActive': 'The session is still running, so it cannot be archived. Stop its work first.',
      'err.pickerUnavailable': 'This environment has no system folder picker; type the folder path instead.',
      'err.nameConflict': 'A workspace with that name already exists.',
      'err.invalidPath': 'That path is not a usable folder.',
      'hint.archived': 'Archived; unarchive to open',
      'hint.checking': 'Checking the delete service…',
      'hint.deleteUnavailable': 'Deletion is unavailable: {reason}',
      'time.justNow': 'just now',
      'time.minutes': '{n} min ago',
      'time.hours': '{n} hr ago',
      'time.days': '{n} days ago',
      'time.months': '{n} months ago',
      'time.years': '{n} years ago',
      'footer.note': 'Permanent deletion removes the session log only; uploaded attachments and caches may keep using disk space.',
    }

    /**
     * Compact relative time for a Session row, using the shared formatter.
     * @param value - epoch milliseconds (seconds tolerated).
     * @param t - bound translator.
     * @returns localized label.
     */
    function formatWhen(value, t) {
      const ms = value < 1e12 ? value * 1000 : value
      const { unit, n } = typeof relativeTime === 'function'
        ? relativeTime(Date.now(), ms)
        : { unit: 'now', n: 0 }
      switch (unit) {
        case 'minutes': return t('time.minutes', { n: Math.max(1, n) })
        case 'hours': return t('time.hours', { n: Math.max(1, n) })
        case 'days': return t('time.days', { n: Math.max(1, n) })
        case 'months': return t('time.months', { n: Math.max(1, n) })
        case 'years': return t('time.years', { n: Math.max(1, n) })
        default: return t('time.justNow')
      }
    }

    /**
     * Read a failure code from our route, a Remote failure, or the message a
     * Workspace controller wrapper built around a Remote failure.
     * @param error - thrown value.
     * @returns the stable code when one can be recovered.
     */
    function errorCode(error) {
      const direct = error?.rpcError?.code ?? error?.code
      if (typeof direct === 'string' && direct.includes('/')) return direct
      const message = String(error?.message ?? '')
      const match = message.match(/(?:workspace|directory-picker|session|request|server)\/[a-z-]+/)
      return match === null ? undefined : match[0]
    }

    /** Map one Host/Workspace failure to localized copy. */
    function failureText(error, t) {
      switch (errorCode(error)) {
        case 'session/open': return t('err.open')
        case 'session/active': return t('err.active')
        case 'session/not-found': return t('err.notFound')
        case 'session/bad-id': return t('err.badId')
        case 'session/unsupported-layout': return t('err.layout')
        case 'request/forbidden': return t('err.forbidden')
        case 'request/refresh': return t('err.refresh')
        case 'workspace/not-found': return t('err.workspaceGone')
        case 'workspace/name-conflict': return t('err.nameConflict')
        case 'workspace/invalid-path': return t('err.invalidPath')
        case 'workspace/session-active': return t('err.archiveActive')
        case 'directory-picker/unavailable': return t('err.pickerUnavailable')
        default: return t('err.generic', { message: error?.message ?? String(error) })
      }
    }

    /**
     * Call the Host delete endpoint. The connection layer authenticates the
     * browser cookie before the handler runs.
     * @param action - wire action.
     * @param sessionId - target Session.
     * @returns the parsed success payload.
     * @throws an Error carrying the Host code.
     */
    async function callAdmin(action, sessionId) {
      const response = await fetch(ROUTE, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-workspace-curator': '1',
        },
        body: JSON.stringify({ action, sessionId }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || payload === null || payload.ok !== true) {
        const error = new Error(payload?.error?.message ?? `HTTP ${String(response.status)}`)
        error.code = payload?.error?.code
          ?? (response.status === 401 ? 'request/refresh' : response.status === 403 ? 'request/forbidden' : undefined)
        error.details = payload?.error?.details
        throw error
      }
      return payload
    }

    /**
     * Theme-inheriting text field.
     * @param props - native input props; `style` extends the base.
     */
    function TextField({ style, ...rest }) {
      return h('input', {
        ...rest,
        style: {
          width: '100%', boxSizing: 'border-box', height: 32, padding: '0 10px',
          borderRadius: 8, border: '1px solid ' + T.stroke, background: 'transparent',
          color: T.text, fontSize: 13, lineHeight: '20px', fontFamily: 'inherit',
          ...style,
        },
      })
    }

    /** Shared badge. */
    function Badge({ label }) {
      return h('span', {
        style: {
          fontSize: 12, lineHeight: '18px', padding: '0 6px', borderRadius: 6,
          color: T.secondary,
          background: 'var(--dsw-alias-interactive-bg-hover)',
          whiteSpace: 'nowrap',
        },
      }, label)
    }

    /**
     * One Session row with its management actions.
     * @param props - row data and callbacks.
     */
    function SessionRow({ session, archived, pinned, busy, deleteHint, t, onOpen, onArchive, onUnarchive, onDelete }) {
      const disabled = busy !== null
      const deleteDisabled = disabled || deleteHint !== null
      return h('div', {
        style: {
          display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8,
          minHeight: 34, padding: '4px 6px', borderRadius: 8,
        },
      },
      h('span', {
        'aria-hidden': true,
        style: {
          width: 6, height: 6, borderRadius: '50%', flex: 'none',
          background: session.running ? T.success : 'var(--dsw-alias-state-success-primary)',
          opacity: session.running ? 1 : 0.55,
        },
      }),
      h('span', {
        title: session.displayTitle,
        style: {
          flex: '1 1 140px', minWidth: 0, fontSize: 13, lineHeight: '20px', color: T.text,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        },
      }, session.displayTitle),
      session.running ? h(Badge, { label: t('badge.running') }) : null,
      pinned ? h(Badge, { label: t('badge.pinned') }) : null,
      archived ? h(Badge, { label: t('badge.archived') }) : null,
      h('span', {
        style: { fontSize: 12, lineHeight: '18px', color: T.tertiary, flex: 'none' },
      }, formatWhen(session.updatedAt, t)),
      h('span', { style: { display: 'flex', gap: 4, flex: 'none', marginLeft: 'auto' } },
        h(Tooltip, { label: archived ? t('hint.archived') : t('open'), side: 'bottom' },
          h(Button, {
            size: 'sm',
            disabled: disabled || archived,
            'aria-label': archived ? `${t('open')} — ${t('hint.archived')}` : t('open'),
            onClick: () => onOpen(session.id),
          }, t('open'))),
        h(Button, {
          size: 'sm',
          disabled,
          onClick: () => (archived ? onUnarchive(session.id) : onArchive(session)),
        }, archived ? t('unarchive') : t('archive')),
        h(Button, {
          size: 'sm',
          disabled: deleteDisabled,
          style: { color: T.danger },
          'aria-label': deleteHint ?? t('delete'),
          onClick: () => onDelete(session),
        }, t('delete'))))
    }

    /** The title of a Session count. */
    function countText(count, t) {
      return t(count === 1 ? 'sessions.count.one' : 'sessions.count.other', { n: count })
    }

    /**
     * One Workspace card: identity, ordering, rename/delete, and its sessions.
     * @param props - workspace row, sessions, position, and callbacks.
     */
    function WorkspaceCard({ workspace, sessions, index, total, archivedSet, pinnedSet, busy, deleteHint, t, actions }) {
      const disabled = busy !== null
      return h('div', {
        style: {
          border: '0.5px solid ' + T.stroke, background: T.card,
          borderRadius: 'var(--dsw-radius-xl)', padding: '12px 14px',
          display: 'flex', flexDirection: 'column', gap: 8,
        },
      },
      h('div', { style: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, minWidth: 0 } },
        h('span', { style: { color: T.secondary, display: 'flex', flex: 'none' } },
          h(IconFolderOpenOutlineRegular, { size: 16 })),
        h('span', {
          style: {
            flex: '1 1 140px', minWidth: 0, fontSize: 14, lineHeight: '22px',
            fontWeight: 500, color: T.text, overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          },
        }, workspace.title),
        h('span', { style: { fontSize: 12, lineHeight: '18px', color: T.tertiary, flex: 'none' } },
          countText(sessions.length, t)),
        h('span', { style: { display: 'flex', gap: 4, flex: 'none', marginLeft: 'auto' } },
          h(Tooltip, { label: t('up'), side: 'bottom' },
            h(Button, {
              size: 'sm', icon: h(IconChevronUpOutlineRegular, { size: 14 }),
              'aria-label': t('up'), disabled: disabled || index === 0,
              onClick: () => actions.move(workspace.workspaceId, -1),
            })),
          h(Tooltip, { label: t('down'), side: 'bottom' },
            h(Button, {
              size: 'sm', icon: h(IconChevronDownOutlineRegular, { size: 14 }),
              'aria-label': t('down'), disabled: disabled || index === total - 1,
              onClick: () => actions.move(workspace.workspaceId, 1),
            })),
          h(Button, {
            size: 'sm', icon: h(IconEditOutlineRegular, { size: 14 }),
            disabled, onClick: () => actions.rename(workspace),
          }, t('rename')),
          h(Button, {
            size: 'sm', icon: h(IconTrashOutlineRegular, { size: 14 }),
            disabled, style: { color: T.danger }, onClick: () => actions.remove(workspace),
          }, t('delete')))),
      h('div', {
        title: workspace.path,
        style: {
          fontFamily: 'var(--dsw-font-mono, monospace)', fontSize: 12, lineHeight: '18px',
          color: T.tertiary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        },
      }, workspace.path),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2 } },
        sessions.length === 0
          ? h('div', { style: { fontSize: 13, lineHeight: '20px', color: T.tertiary, padding: '4px 6px' } }, t('sessions.empty'))
          : sessions.map(session => h(SessionRow, {
            key: session.id,
            session,
            archived: archivedSet.has(session.id),
            pinned: pinnedSet.has(session.id),
            busy,
            deleteHint,
            t,
            onOpen: actions.open,
            onArchive: actions.archive,
            onUnarchive: actions.unarchive,
            onDelete: actions.requestDelete,
          }))))
    }

    /**
     * Settings page body.
     * @param props - shell close, injected services, and translator.
     */
    function Page({ close, t, workspaces, sessions, uiWorkspace, subscribeLocale, localeRevision }) {
      React.useSyncExternalStore(subscribeLocale, localeRevision)
      const subscribeWorkspaces = React.useCallback(listener => workspaces.list.subscribe(listener), [workspaces])
      const readWorkspaces = React.useCallback(() => workspaces.list.getSnapshot(), [workspaces])
      const subscribeSessions = React.useCallback(listener => sessions.list.subscribe(listener), [sessions])
      const readSessions = React.useCallback(() => sessions.list.getSnapshot(), [sessions])
      const workspaceSnapshot = React.useSyncExternalStore(subscribeWorkspaces, readWorkspaces)
      const sessionSnapshot = React.useSyncExternalStore(subscribeSessions, readSessions)
      const [path, setPath] = React.useState('')
      const [busy, setBusy] = React.useState(null)
      const [notice, setNotice] = React.useState(null)
      const [renaming, setRenaming] = React.useState(null)
      const [renameValue, setRenameValue] = React.useState('')
      const [renameBusy, setRenameBusy] = React.useState(false)
      const [renameError, setRenameError] = React.useState(null)
      const [confirming, setConfirming] = React.useState(null)
      const [confirmBusy, setConfirmBusy] = React.useState(false)
      const [confirmError, setConfirmError] = React.useState(null)
      const [deleteReady, setDeleteReady] = React.useState(null)
      const [deleteReason, setDeleteReason] = React.useState('')
      const noticeRef = React.useRef(null)

      const archivedSet = React.useMemo(
        () => new Set(workspaceSnapshot.archivedSessionIds),
        [workspaceSnapshot],
      )
      const pinnedSet = React.useMemo(
        () => new Set(workspaceSnapshot.pinnedSessionIds),
        [workspaceSnapshot],
      )
      const summaryById = sessionSnapshot.byId
      const managed = React.useMemo(() => sessionSnapshot.ids
        .map(id => summaryById[id])
        .filter(session => session !== undefined && session.origin !== 'subagent' && !session.blank), [sessionSnapshot])
      const accounted = React.useMemo(() => {
        const ids = new Set()
        for (const item of workspaceSnapshot.items) for (const id of item.sessionIds) ids.add(id)
        return ids
      }, [workspaceSnapshot])
      const ungrouped = React.useMemo(
        () => managed.filter(session => !accounted.has(session.id))
          .sort((left, right) => right.updatedAt - left.updatedAt),
        [managed, accounted],
      )
      const workspacesLoading = workspaceSnapshot.phase === 'pending' && workspaceSnapshot.state === 'loading'
      const workspacesFailed = workspaceSnapshot.state === 'error'
      const sessionsLoading = sessionSnapshot.phase === 'pending'

      const say = React.useCallback((text, tone = 'success') => {
        setNotice({ text, tone })
      }, [])

      React.useEffect(() => {
        if (notice !== null) noticeRef.current?.scrollIntoView({ block: 'nearest' })
      }, [notice])

      // Probe the Host half once so Delete can be disabled with a reason when
      // the route is unreachable or the browser session is no longer valid.
      React.useEffect(() => {
        let disposed = false
        const controller = new AbortController()
        void (async () => {
          try {
            const response = await fetch(ROUTE, {
              method: 'GET',
              headers: { 'x-workspace-curator': '1' },
              signal: controller.signal,
            })
            const payload = await response.json().catch(() => null)
            if (disposed) return
            const ready = response.ok && payload?.ok === true
            setDeleteReady(ready)
            setDeleteReason(ready
              ? ''
              : response.status === 401
                ? t('err.refresh')
                : t('err.unavailable', { message: `HTTP ${String(response.status)}` }))
          } catch (error) {
            if (!disposed) {
              setDeleteReady(false)
              setDeleteReason(t('err.unavailable', { message: error?.message ?? String(error) }))
            }
          }
        })()
        return () => { disposed = true; controller.abort() }
        // The probe is a one-shot on mount; localized copy for a later locale
        // switch is not worth re-probing.
      }, [])

      const run = React.useCallback(async (key, operation, successText) => {
        setBusy(key)
        setNotice(null)
        try {
          await operation()
          if (successText !== undefined) say(successText)
        } catch (error) {
          say(failureText(error, t), 'error')
        } finally {
          setBusy(current => (current === key ? null : current))
        }
      }, [say, t])

      const adding = busy === 'add'
      const add = React.useCallback(() => {
        const target = path.trim()
        if (target === '' || busy !== null) return
        void run('add', async () => {
          await workspaces.create({ path: target })
          setPath('')
        }, t('notice.workspaceAdded'))
      }, [busy, path, run, t, workspaces])

      const pick = React.useCallback(() => {
        if (busy !== null) return
        void (async () => {
          try {
            const picked = await uiWorkspace.pickDirectory()
            if (typeof picked === 'string' && picked !== '') setPath(picked)
          } catch (error) {
            say(failureText(error, t), 'error')
          }
        })()
      }, [busy, say, t, uiWorkspace])

      const move = React.useCallback((workspaceId, direction) => {
        if (busy !== null) return
        const items = workspaceSnapshot.items
        const index = items.findIndex(item => item.workspaceId === workspaceId)
        if (index < 0) return
        const before = direction < 0 ? items[index - 1] : items[index + 2]
        void run('move:' + String(workspaceId), async () => {
          await workspaces.insertBefore(workspaceId, before === undefined ? undefined : before.workspaceId)
        })
      }, [busy, run, workspaceSnapshot, workspaces])

      const requestRemove = React.useCallback((workspace) => {
        setConfirmError(null)
        setConfirming({ kind: 'workspace', id: workspace.workspaceId, title: workspace.title })
      }, [])

      const requestDelete = React.useCallback((session) => {
        setConfirmError(null)
        setConfirming({ kind: 'session', id: session.id, title: session.displayTitle })
      }, [])

      const openSession = React.useCallback((sessionId) => {
        uiWorkspace.openSession(sessionId)
        close()
      }, [close, uiWorkspace])

      const archive = React.useCallback((session) => {
        if (busy !== null) return
        if (session.running) {
          setConfirmError(null)
          setConfirming({ kind: 'archive', id: session.id, title: session.displayTitle })
          return
        }
        void run('archive:' + String(session.id), async () => {
          await uiWorkspace.archiveSession(session.id)
        }, t('notice.sessionArchived'))
      }, [busy, run, t, uiWorkspace])

      const unarchive = React.useCallback((sessionId) => {
        if (busy !== null) return
        void run('unarchive:' + String(sessionId), async () => {
          await uiWorkspace.unarchiveSession(sessionId)
        }, t('notice.sessionUnarchived'))
      }, [busy, run, t, uiWorkspace])

      const deleteSession = React.useCallback(async (sessionId) => {
        setConfirmBusy(true)
        setConfirmError(null)
        try {
          const result = await callAdmin('delete-session', sessionId)
          await sessions.refresh().catch(() => {})
          setConfirming(null)
          if (Array.isArray(result.warnings) && result.warnings.length > 0) {
            say(t('notice.sessionDeletedWarnings', { message: result.warnings.join('; ') }), 'error')
          } else if (result.alreadyGone === true) {
            say(t('notice.sessionAlreadyGone'))
          } else {
            say(t('notice.sessionDeleted'))
          }
        } catch (error) {
          if (error instanceof TypeError) {
            setConfirmError(t('err.unavailable', { message: error.message }))
          } else {
            setConfirmError(failureText(error, t))
          }
        } finally {
          setConfirmBusy(false)
        }
      }, [say, sessions, t])

      const deleteWorkspace = React.useCallback(async (workspaceId) => {
        setConfirmBusy(true)
        setConfirmError(null)
        try {
          await workspaces.delete(workspaceId)
          setConfirming(null)
          say(t('notice.workspaceDeleted'))
        } catch (error) {
          setConfirmError(failureText(error, t))
        } finally {
          setConfirmBusy(false)
        }
      }, [say, t, workspaces])

      const stopAndArchive = React.useCallback(async (sessionId) => {
        setConfirmBusy(true)
        setConfirmError(null)
        try {
          await uiWorkspace.archiveSession(sessionId, { stopActivity: true })
          setConfirming(null)
          say(t('notice.sessionArchived'))
        } catch (error) {
          setConfirmError(failureText(error, t))
        } finally {
          setConfirmBusy(false)
        }
      }, [say, t, uiWorkspace])

      const confirmAction = React.useCallback(() => {
        const target = confirming
        if (target === null || confirmBusy) return
        if (target.kind === 'workspace') void deleteWorkspace(target.id)
        else if (target.kind === 'session') void deleteSession(target.id)
        else void stopAndArchive(target.id)
      }, [confirmBusy, confirming, deleteSession, deleteWorkspace, stopAndArchive])

      const openRename = React.useCallback((workspace) => {
        setRenaming(workspace)
        setRenameValue(workspace.title)
        setRenameError(null)
      }, [])

      const submitRename = React.useCallback(() => {
        const target = renaming
        const title = renameValue.trim()
        if (target === null || title === '' || renameBusy) return
        setRenameBusy(true)
        setRenameError(null)
        void (async () => {
          try {
            await workspaces.rename(target.workspaceId, title)
            setRenaming(null)
            say(t('notice.workspaceRenamed'))
          } catch (error) {
            setRenameError(failureText(error, t))
          } finally {
            setRenameBusy(false)
          }
        })()
      }, [renameBusy, renameValue, renaming, say, t, workspaces])

      const actions = {
        move, rename: openRename, remove: requestRemove,
        open: openSession, archive, unarchive, requestDelete,
      }

      const deleteHint = deleteReady === true
        ? null
        : deleteReady === false
          ? t('hint.deleteUnavailable', { reason: deleteReason })
          : t('hint.checking')
      const confirmTitle = confirming === null ? '' : confirming.kind === 'workspace'
        ? t('confirm.workspace.title')
        : confirming.kind === 'session' ? t('confirm.session.title') : t('confirm.archive.title')
      const confirmBody = confirming === null ? '' : confirming.kind === 'workspace'
        ? t('confirm.workspace.body', { name: confirming.title })
        : confirming.kind === 'session'
          ? t('confirm.session.body', { name: confirming.title })
          : t('confirm.archive.body', { name: confirming.title })
      const confirmLabel = confirming === null ? ''
        : confirming.kind === 'workspace'
          ? t('confirm.deleteWorkspace')
          : confirming.kind === 'session' ? t('confirm.deleteSession') : t('confirm.archiveAction')
      const confirmProgress = confirmBusy
        ? (confirming?.kind === 'archive' ? t('confirm.archiving') : t('confirm.deleting'))
        : confirmLabel

      const sessionList = (list) => list.map(session => h(SessionRow, {
        key: session.id,
        session,
        archived: archivedSet.has(session.id),
        pinned: pinnedSet.has(session.id),
        busy,
        deleteHint,
        t,
        onOpen: openSession,
        onArchive: archive,
        onUnarchive: unarchive,
        onDelete: requestDelete,
      }))

      return h('section', {
        style: {
          display: 'flex', flexDirection: 'column', gap: 12,
          maxWidth: 760, color: T.text,
        },
      },
      h('h2', { style: { margin: 0, fontSize: 16, lineHeight: '24px', fontWeight: 500 } }, t('page.title')),
      h('p', { style: { margin: 0, fontSize: 14, lineHeight: '22px', color: T.tertiary } }, t('page.intro')),
      notice === null ? null : h('div', {
        ref: noticeRef,
        role: notice.tone === 'error' ? 'alert' : 'status',
        style: {
          fontSize: 13, lineHeight: '20px', padding: '8px 10px', borderRadius: 8,
          color: notice.tone === 'error' ? T.danger : T.success,
          background: 'var(--dsw-alias-interactive-bg-hover)',
          display: 'flex', alignItems: 'flex-start', gap: 6,
        },
      },
      notice.tone === 'error' ? h(IconWarningOutlineRegular, { size: 14 }) : null,
      h('span', null, notice.text)),
      h('div', {
        style: {
          border: '0.5px solid ' + T.stroke, background: T.card,
          borderRadius: 'var(--dsw-radius-xl)', padding: '12px 14px',
          display: 'flex', flexDirection: 'column', gap: 8,
        },
      },
      h('div', { style: { fontSize: 14, lineHeight: '22px', fontWeight: 500 } }, t('add.title')),
      h('div', { id: 'workspace-curator-add-hint', style: { fontSize: 12, lineHeight: '18px', color: T.tertiary } }, t('add.hint')),
      h('div', { style: { display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' } },
        h('div', { style: { flex: 1, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 4 } },
          h('label', {
            htmlFor: 'workspace-curator-path',
            style: { fontSize: 12, lineHeight: '18px', color: T.secondary },
          }, t('add.field')),
          h(TextField, {
            id: 'workspace-curator-path',
            value: path,
            onChange: event => { setPath(event.target.value) },
            onKeyDown: event => {
              if (event.key !== 'Enter' || event.nativeEvent?.isComposing === true) return
              event.preventDefault()
              add()
            },
            placeholder: t('add.placeholder'),
            'aria-describedby': 'workspace-curator-add-hint',
          })),
        h(Button, { disabled: busy !== null, onClick: pick }, t('add.pick')),
        h(Button, {
          variant: 'primary',
          disabled: busy !== null || path.trim() === '',
          onClick: add,
        }, adding ? t('busy') : t('add.submit')))),
      h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 } },
        h('h3', { style: { margin: 0, fontSize: 14, lineHeight: '22px', fontWeight: 500 } }, t('ungrouped')),
        h('span', { style: { fontSize: 12, color: T.tertiary } }, String(ungrouped.length)),
        h('span', { style: { fontSize: 12, color: T.tertiary } }, t('ungrouped.hint'))),
      sessionsLoading
        ? h('div', { style: { fontSize: 13, lineHeight: '20px', color: T.tertiary } }, t('loading.sessions'))
        : ungrouped.length === 0
          ? h('div', { style: { fontSize: 13, lineHeight: '20px', color: T.tertiary } }, t('empty.ungrouped'))
          : h('div', {
            style: {
              border: '0.5px solid ' + T.stroke, background: T.card,
              borderRadius: 'var(--dsw-radius-xl)', padding: '8px 10px',
              display: 'flex', flexDirection: 'column', gap: 2,
            },
          }, sessionList(ungrouped)),
      h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 } },
        h('h3', { style: { margin: 0, fontSize: 14, lineHeight: '22px', fontWeight: 500 } }, t('workspaces')),
        h('span', { style: { fontSize: 12, color: T.tertiary } }, String(workspaceSnapshot.items.length))),
      workspacesLoading
        ? h('div', { style: { fontSize: 13, lineHeight: '20px', color: T.tertiary } }, t('loading.workspaces'))
        : workspacesFailed
          ? h('div', { role: 'alert', style: { fontSize: 13, lineHeight: '20px', color: T.danger } }, t('error.workspaces'))
          : workspaceSnapshot.items.length === 0
            ? h('div', { style: { fontSize: 13, lineHeight: '20px', color: T.tertiary } }, t('empty.workspaces'))
            : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
              workspaceSnapshot.items.map((workspace, index) => h(WorkspaceCard, {
                key: workspace.workspaceId,
                workspace,
                index,
                total: workspaceSnapshot.items.length,
                sessions: workspace.sessionIds
                  .map(id => summaryById[id])
                  .filter(session => session !== undefined && session.origin !== 'subagent' && !session.blank),
                archivedSet,
                pinnedSet,
                busy,
                deleteHint,
                t,
                actions,
              }))),
      h('div', { style: { fontSize: 12, lineHeight: '18px', color: T.tertiary } },
        deleteHint === null ? t('footer.note') : deleteHint),
      h(Modal, {
        open: confirming !== null,
        onClose: () => { if (!confirmBusy) { setConfirming(null); setConfirmError(null) } },
        closeLabel: t('close'),
        title: confirmTitle,
        description: confirmBody,
        tone: 'warning',
        footer: h(React.Fragment, null,
          h(Button, { variant: 'outline', disabled: confirmBusy, onClick: () => { setConfirming(null); setConfirmError(null) } }, t('confirm.cancel')),
          h(Button, {
            variant: 'outline',
            style: { color: T.danger },
            disabled: confirmBusy,
            onClick: confirmAction,
          }, confirmProgress)),
      },
      confirmError === null ? null : h('div', { role: 'alert', style: { fontSize: 12, lineHeight: '18px', color: T.danger } }, confirmError)),
      h(Modal, {
        open: renaming !== null,
        onClose: () => { if (!renameBusy) setRenaming(null) },
        closeLabel: t('close'),
        title: t('rename.title'),
        footer: h(React.Fragment, null,
          h(Button, { variant: 'outline', disabled: renameBusy, onClick: () => setRenaming(null) }, t('confirm.cancel')),
          h(Button, {
            variant: 'primary',
            disabled: renameBusy || renameValue.trim() === '',
            onClick: submitRename,
          }, renameBusy ? t('rename.saving') : t('rename.submit'))),
      },
      h('label', { style: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: T.secondary } },
        t('rename.field'),
        h(TextField, {
          value: renameValue,
          autoFocus: true,
          disabled: renameBusy,
          onChange: event => { setRenameValue(event.target.value) },
          onKeyDown: event => {
            if (event.key !== 'Enter' || event.nativeEvent?.isComposing === true) return
            event.preventDefault()
            submitRename()
          },
          'aria-label': t('rename.field'),
        })),
      renameError === null ? null : h('div', { role: 'alert', style: { fontSize: 12, lineHeight: '18px', color: T.danger } }, renameError)))
    }

    /** Navigation glyph: a folder with a removal cross, drawn in currentColor. */
    function AdminIcon({ size = 16 }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24',
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.8,
        strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true, style: { display: 'block' },
      },
      h('path', { d: 'M3.5 8A1.8 1.8 0 0 1 5.3 6.2h3.9l1.7 1.9h7.8A1.8 1.8 0 0 1 20.5 9.9v7.3a1.8 1.8 0 0 1-1.8 1.8H5.3a1.8 1.8 0 0 1-1.8-1.8z' }),
      h('path', { d: 'M16.2 12.4l4 4M20.2 12.4l-4 4' }))
    }

    return {
      inject: ['slots', 'locale', 'workspaces', 'sessions', 'uiWorkspace'],
      apply(ctx) {
        const t = ctx.locale.bind(NS)
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'workspace-curator: dictionaries')
        const subscribeLocale = listener => ctx.locale.subscribe(listener)
        const localeRevision = () => ctx.locale.getSnapshot().revision
        const injected = () => ({
          t,
          workspaces: ctx.workspaces,
          sessions: ctx.sessions,
          uiWorkspace: ctx.uiWorkspace,
          subscribeLocale,
          localeRevision,
        })
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'workspace-curator',
          order: 20,
          label: () => t('nav'),
          locale: NS,
          inject: injected,
        }, Page))
        ctx.slots.inject('settings.section.icon', () => ctx.slots.register({
          name: 'settings.section.icon',
          id: 'workspace-curator',
        }, AdminIcon))
      },
    }
  },
})
