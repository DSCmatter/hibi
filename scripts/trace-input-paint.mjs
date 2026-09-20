import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  access,
  mkdir,
  mkdtemp,
  open,
  readFile,
  writeFile,
} from 'node:fs/promises'
import { cpus, release, tmpdir, totalmem } from 'node:os'
import { join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { parseArgs } from 'node:util'
import { clickMenu, pressShortcut } from '../tests/keyboard.mjs'
import {
  launchBenchmarkApp,
  switchToSource,
  waitForEditor,
} from './benchmark-flows.mjs'

const { values } = parseArgs({
  options: {
    mode: { type: 'string', default: 'all' },
    file: { type: 'string' },
    size: { type: 'string', default: 'all' },
    shape: { type: 'string', default: 'all' },
    position: { type: 'string', default: 'middle' },
    target: { type: 'string', default: 'both' },
    'hold-ms': { type: 'string', default: '30000' },
    'settle-ms': { type: 'string', default: '15000' },
    rate: { type: 'string', default: '30' },
    addons: {
      type: 'string',
      default:
        'frontmatter,github-markdown,text-extras,word-count,typing-speed',
    },
    out: { type: 'string' },
    quick: { type: 'boolean' },
    'continue-on-error': { type: 'boolean' },
    'trace-screenshots': { type: 'boolean' },
    'cpu-profile': { type: 'boolean' },
    help: { type: 'boolean' },
  },
})
if (values.help) {
  console.log(
    'node scripts/trace-input-paint.mjs --mode source|visual|split|all [--file PATH | --size chars|words|all --shape paragraphs|giant|all] --position start|middle|end|all --target source|visual|both --out NEW_DIRECTORY [--quick] [--hold-ms 30000] [--rate 30] [--trace-screenshots] [--cpu-profile] [--continue-on-error]',
  )
  process.exit(0)
}
const choose = (value, choices) => {
  if (value === 'all') return choices
  assert.ok(choices.includes(value), `Choose ${choices.join(', ')} or all.`)
  return [value]
}
const modes = choose(values.mode, ['source', 'visual', 'split']),
  sizes = values.file ? ['file'] : choose(values.size, ['chars', 'words']),
  shapes = values.file
    ? ['original']
    : choose(values.shape, ['paragraphs', 'giant']),
  positions = choose(values.position, ['start', 'middle', 'end']),
  holdMs = values.quick ? 0 : Number(values['hold-ms']),
  rate = Number(values.rate),
  settleMs = Number(values['settle-ms'])
assert.ok(['source', 'visual', 'both'].includes(values.target))
assert.ok(Number.isFinite(holdMs) && holdMs >= 0 && holdMs <= 30000)
assert.ok(Number.isFinite(rate) && rate >= 1 && rate <= 30)
assert.ok(Number.isFinite(settleMs) && settleMs >= 1000 && settleMs <= 30000)
const repetitions = Math.floor((holdMs * rate) / 1000)
assert.ok(repetitions <= 900)
const addons = Object.fromEntries(
  values.addons
    .split(',')
    .filter(Boolean)
    .map((id) => [id, true]),
)
addons['discord-presence'] = false
addons['input-paint-probe'] = true
const sourceBytes = values.file ? await readFile(resolve(values.file)) : null,
  fileText = sourceBytes?.toString('utf8'),
  sourceFile = sourceBytes
    ? {
        path: resolve(values.file),
        bytes: sourceBytes.length,
        chars: fileText.length,
        sha256: createHash('sha256').update(sourceBytes).digest('hex'),
      }
    : null
if (sourceBytes)
  assert.ok(
    Buffer.from(fileText, 'utf8').equals(sourceBytes),
    '--file must contain valid UTF-8 text.',
  )
await access(resolve('out/main/index.js'))
const output = values.out
  ? resolve(values.out)
  : await mkdtemp(join(tmpdir(), 'hibi-input-paint-'))
if (values.out) await mkdir(output)
const summary = {
  output,
  options: values,
  addons,
  sourceFile,
  runtime: process.version,
  platform: process.platform,
  arch: process.arch,
  environment: {
    cpu: cpus()[0]?.model,
    os: release(),
    memoryBytes: totalmem(),
  },
  commit: execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim(),
  builtMainSha256: createHash('sha256')
    .update(await readFile(resolve('out/main/index.js')))
    .digest('hex'),
  harnessSha256: createHash('sha256')
    .update(await readFile(new URL(import.meta.url)))
    .digest('hex'),
  cases: [],
  limitations: [
    'CDP injects browser input, not a physical keyboard or OS autorepeat. Cadence is independent of command acknowledgments and renderer paint.',
    'Generated epoch timestamps, renderer event timestamps, and handler times expose queue delay; cross-process clock conversion is a proxy and is reported separately.',
    'A matching glyph DOM range in the viewport at rAF, followed by another rAF, is a presentation opportunity, not physical scanout. Coalesced edits may share a frame.',
    'Tracing and benchmark-only addon callbacks add overhead. Screenshots are captured after measured settlement; optional trace screenshots add further overhead.',
    'Source and visual updates may include synchronous DOM work. No artificial debounce, input-rate throttling based on paint, or reduced correctness checks are applied.',
  ],
}
console.log(output)
const sleep = (ms) => new Promise((done) => setTimeout(done, Math.max(0, ms)))
async function deadline(promise, ms, label) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} exceeded ${ms} ms`)),
          ms,
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
function documentText(size, shape) {
  const words = [
    'alpha',
    'beta',
    'gamma',
    'delta',
    'epsilon',
    'zeta',
    'eta',
    'theta',
    'iota',
    'kappa',
  ]
  if (size === 'words')
    return Array.from(
      { length: 100000 },
      (_, index) =>
        `${index ? (shape === 'paragraphs' && index % 20 === 0 ? '\n\n' : ' ') : ''}${words[index % words.length]}`,
    ).join('')
  const unit = words.join(' ') + (shape === 'paragraphs' ? '\n\n' : ' ')
  let text = unit.repeat(Math.ceil(100000 / unit.length)).slice(0, 100000)
  if (text.endsWith('\n')) text = `${text.slice(0, -1)}z`
  return text
}
async function installProbe(profile) {
  const addon = join(profile, 'installed-addons', 'input-paint-probe')
  await mkdir(addon, { recursive: true })
  await writeFile(
    join(addon, 'hibi-addon.json'),
    JSON.stringify({
      id: 'input-paint-probe',
      name: 'Input paint probe',
      description: 'Benchmark-only input timing callbacks',
      kind: 'extension',
      apiVersion: 2,
      version: '1.0.0',
      authors: [{ displayName: 'Benchmark' }],
      capabilities: ['source', 'rich'],
      entry: 'index.js',
    }),
  )
  await writeFile(
    join(addon, '.hibi-install.json'),
    JSON.stringify({
      hash: 'a'.repeat(64),
      files: ['hibi-addon.json', 'index.js'],
      source: 'local',
    }),
  )
  await writeFile(
    join(addon, 'index.js'),
    `export default sdk => ({start(context) {
    window.__inputPaintSdk = sdk; window.__inputPaintContext = context;
    context.editor.registerSource({id:'observe', create() { return sdk.codeMirror.view.EditorView.updateListener.of(update => window.__inputPaint?.model('source', update)); }});
    context.editor.registerRich({id:'observe', attach(editor) { window.__inputPaintRich = editor; window.__inputPaint?.attachRich(editor); const update = ({transaction}) => window.__inputPaint?.model('visual', {view:editor.view, docChanged:transaction.docChanged, selectionSet:transaction.selectionSet}); editor.on('transaction', update); return () => editor.off('transaction', update); }});
  }});`,
  )
  await writeFile(join(profile, 'addons.json'), JSON.stringify(addons))
}
function instrument({ target, offset, fileVisual, requestedPosition }) {
  const sourceElement = document.querySelector('.cm-content'),
    sourceView = sourceElement
      ? window.__inputPaintSdk.codeMirror.view.EditorView.findFromDOM(
          sourceElement,
        )
      : null,
    rich = document.querySelector('.tiptap')?.editor,
    view = target === 'source' ? sourceView : rich.view,
    element = target === 'source' ? sourceView.contentDOM : rich.view.dom
  const measurement = {
    phase: 'setup',
    target,
    records: [],
    scroll: [],
    spans: [],
    methods: [],
    version: 0,
    pending: [],
    latest: null,
    frame: 0,
    timeOrigin: performance.timeOrigin,
    events: { keydown: 0, beforeinput: 0, input: 0, changes: 0 },
  }
  const mark = (name) =>
    performance.mark(`input-paint:${measurement.phase}:${name}`)
  const timed = (object, method, label) => {
    const original = object?.[method]
    if (typeof original !== 'function') return
    measurement.methods.push(label)
    const wrapped = function (...args) {
      const started = performance.now(),
        phase = measurement.phase,
        keyId = measurement.latest?.id
      try {
        return original.apply(this, args)
      } finally {
        const ended = performance.now()
        if (measurement.spans.length < 20000) {
          const id = measurement.spans.length + 1
          measurement.spans.push({
            id,
            label,
            phase,
            keyId,
            started,
            duration: ended - started,
            inputChars:
              typeof args[0] === 'string' ? args[0].length : undefined,
          })
          performance.measure(`input-paint:${phase}:span:${label}:${id}`, {
            start: started,
            end: ended,
          })
        }
      }
    }
    object[method] = wrapped
  }
  const attached = new WeakSet()
  measurement.attachRich = (editor) => {
    if (attached.has(editor)) return
    attached.add(editor)
    timed(editor.markdown, 'parse', 'rich.markdown.parse')
    timed(editor, 'getMarkdown', 'rich.getMarkdown')
    timed(editor.view, 'updateState', 'rich.view.updateState')
    const holder = { dispatch: editor.view.props.dispatchTransaction }
    timed(holder, 'dispatch', 'rich.dispatchTransaction')
    if (holder.dispatch)
      editor.view.setProps({ dispatchTransaction: holder.dispatch })
  }
  if (window.__inputPaintRich && !window.__inputPaintRich.isDestroyed)
    measurement.attachRich(window.__inputPaintRich)
  const selectionHead = () =>
    target === 'source'
      ? view.state.selection.main.head
      : view.state.selection.head
  const visible = () => {
    const head = selectionHead(),
      from = head - 1
    if (from < (target === 'source' ? 0 : 1)) return null
    const expected =
      target === 'source'
        ? view.state.doc.sliceString(from, head)
        : view.state.doc.textBetween(from, head)
    const start = view.domAtPos(from),
      end = view.domAtPos(head),
      range = document.createRange()
    range.setStart(start.node, start.offset)
    range.setEnd(end.node, end.offset)
    if (!expected || range.toString() !== expected) return null
    const pane =
        element.closest(target === 'source' ? '.source-pane' : '.rich-pane') ??
        element,
      clip = pane.getBoundingClientRect(),
      rect = range.getBoundingClientRect()
    if (
      !rect.width ||
      !rect.height ||
      rect.bottom <= Math.max(0, clip.top) ||
      rect.top >= Math.min(innerHeight, clip.bottom) ||
      rect.right <= Math.max(0, clip.left) ||
      rect.left >= Math.min(innerWidth, clip.right)
    )
      return null
    return {
      head,
      text: expected,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    }
  }
  const frame = () => {
    measurement.frame = 0
    let glyph
    try {
      glyph = visible()
    } catch {}
    if (glyph) {
      const now = performance.now(),
        batch = measurement.pending.splice(0)
      for (const record of batch) {
        record.visibleFrameAt = now
        record.visible = glyph
        mark(`visible:${record.id}`)
      }
      requestAnimationFrame(() => {
        for (const record of batch) {
          record.nextFrameAt = performance.now()
          mark(`next-frame:${record.id}`)
        }
      })
    }
    if (measurement.pending.length)
      measurement.frame = requestAnimationFrame(frame)
  }
  element.addEventListener(
    'keydown',
    (event) => {
      if (
        !['x', 's', 'Backspace', 'ArrowRight', 'ArrowLeft'].includes(event.key)
      )
        return
      const record = {
        id: measurement.records.length + 1,
        phase: measurement.phase,
        key: event.key,
        repeat: event.repeat,
        eventTime: event.timeStamp,
        keydownAt: performance.now(),
        eventEpoch: performance.timeOrigin + event.timeStamp,
      }
      measurement.records.push(record)
      measurement.latest = record
      measurement.events.keydown++
      mark(`keydown:${record.id}`)
      queueMicrotask(() => {
        record.keydownMicrotaskAt = performance.now()
      })
    },
    true,
  )
  window.addEventListener('keydown', (event) => {
    const record = measurement.latest
    if (record?.eventTime !== event.timeStamp) return
    record.keydownBubbleEndAt = performance.now()
    mark(`keydown-end:${record.id}`)
  })
  window.addEventListener('beforeinput', () => {
    const record = measurement.latest
    if (!record) return
    record.beforeinputBubbleEndAt = performance.now()
    mark(`beforeinput-end:${record.id}`)
  })
  element.addEventListener(
    'beforeinput',
    (event) => {
      measurement.events.beforeinput++
      if (measurement.latest) {
        measurement.latest.beforeinputAt = performance.now()
        measurement.latest.inputType = event.inputType
        mark(`beforeinput:${measurement.latest.id}`)
      }
    },
    true,
  )
  element.addEventListener(
    'input',
    () => {
      measurement.events.input++
      if (measurement.latest) measurement.latest.inputAt = performance.now()
    },
    true,
  )
  measurement.model = (surface, update) => {
    if (surface !== target || (!update.docChanged && !update.selectionSet))
      return
    const record = measurement.latest
    if (!record || record.modelAt !== undefined) return
    if (!update.docChanged && !record.key.startsWith('Arrow')) return
    if (update.docChanged) measurement.events.changes++
    record.modelAt = performance.now()
    record.docChanged = update.docChanged
    record.version = ++measurement.version
    record.head = selectionHead()
    mark(`model:${record.id}`)
    measurement.pending.push(record)
    if (!measurement.frame) measurement.frame = requestAnimationFrame(frame)
  }
  window.addEventListener(
    'scroll',
    (event) => {
      if (measurement.phase !== 'scroll') return
      const record = {
        at: performance.now(),
        top: event.target.scrollTop ?? scrollY,
      }
      measurement.scroll.push(record)
      requestAnimationFrame(() => {
        record.frameAt = performance.now()
      })
    },
    true,
  )
  measurement.dump = () => ({
    target,
    phase: measurement.phase,
    timeOrigin: measurement.timeOrigin,
    events: measurement.events,
    records: measurement.records,
    scroll: measurement.scroll,
    spans: measurement.spans,
    methods: measurement.methods,
    pending: measurement.pending.length,
    focused: document.hasFocus(),
    finalVisibleRanges: target === 'source' ? view.visibleRanges : null,
    finalRenderedElements: element.querySelectorAll('*').length,
  })
  window.__inputPaint = measurement
  if (target === 'source') {
    view.dispatch({
      selection: { anchor: offset },
      effects: window.__inputPaintSdk.codeMirror.view.EditorView.scrollIntoView(
        offset,
        { y: 'center' },
      ),
    })
    view.focus()
  } else {
    let raw = 0,
      position = null
    let blockIndex = null,
      blockCount = null
    if (fileVisual) {
      const blocks = []
      rich.state.doc.descendants((node, pos) => {
        if (!node.isTextblock || node.isAtom) return
        blocks.push({ node, pos })
        return false
      })
      if (!blocks.length)
        throw new Error('The document has no editable textblock.')
      blockCount = blocks.length
      blockIndex =
        requestedPosition === 'start'
          ? 0
          : requestedPosition === 'end'
            ? blocks.length - 1
            : Math.floor(blocks.length / 2)
      const block = blocks[blockIndex]
      let within =
        requestedPosition === 'start'
          ? 0
          : requestedPosition === 'end'
            ? block.node.content.size
            : Math.floor(block.node.content.size / 2)
      const seam = block.node.textBetween(
        Math.max(0, within - 1),
        Math.min(block.node.content.size, within + 1),
      )
      if (/^[\uD800-\uDBFF][\uDC00-\uDFFF]$/.test(seam)) within++
      position = block.pos + 1 + within
    } else
      rich.state.doc.forEach((node, pos) => {
        if (
          position === null &&
          offset >= raw &&
          offset <= raw + node.textContent.length
        )
          position = pos + 1 + offset - raw
        raw += node.textContent.length + 2
      })
    if (position === null)
      throw new Error('Could not map plain fixture offset into visual editor')
    rich.chain().setTextSelection(position).focus().scrollIntoView().run()
    return {
      basis: fileVisual ? 'visual-textblock' : 'plain-source-offset',
      richPosition: position,
      blockIndex,
      blockCount,
      textOffset: rich.state.doc.textBetween(0, position, '').length,
      baselineText: fileVisual ? rich.state.doc.textContent : null,
    }
  }
  return { basis: 'normalized-source-offset', editorOffset: offset }
}
async function streamTrace(session, path) {
  const complete = new Promise((done) =>
    session.once('Tracing.tracingComplete', done),
  )
  await deadline(session.send('Tracing.end'), 5000, 'trace end command')
  const { stream } = await deadline(complete, 15000, 'trace completion')
  assert.ok(stream, 'Trace stream was not returned')
  const file = await open(path, 'wx')
  try {
    for (;;) {
      const chunk = await deadline(
        session.send('IO.read', { handle: stream, size: 65536 }),
        5000,
        'trace stream read',
      )
      await file.write(
        chunk.base64Encoded ? Buffer.from(chunk.data, 'base64') : chunk.data,
      )
      if (chunk.eof) break
    }
  } finally {
    await file.close()
    await deadline(
      session.send('IO.close', { handle: stream }),
      5000,
      'trace stream close',
    )
  }
}
async function writeProfile(path, profile) {
  const file = await open(path, 'wx')
  try {
    await file.write('{')
    let separator = ''
    for (const [key, value] of Object.entries(profile)) {
      await file.write(`${separator}${JSON.stringify(key)}:`)
      if (Array.isArray(value)) {
        await file.write('[')
        for (let from = 0; from < value.length; from += 4096)
          await file.write(
            `${from ? ',' : ''}${value
              .slice(from, from + 4096)
              .map((item) => JSON.stringify(item))
              .join(',')}`,
          )
        await file.write(']')
      } else await file.write(JSON.stringify(value))
      separator = ','
    }
    await file.write('}')
  } finally {
    await file.close()
  }
}
async function runCase(config) {
  const name = [
      config.mode,
      config.target,
      config.size,
      config.shape,
      config.position,
    ].join('-'),
    directory = join(output, name),
    profile = join(directory, 'profile'),
    file = join(directory, 'fixture.md'),
    source = fileText ?? documentText(config.size, config.shape),
    fileVisual = sourceFile !== null && config.target === 'visual'
  await mkdir(directory)
  await installProbe(profile)
  await writeFile(file, source)
  let offset =
    config.position === 'start'
      ? 0
      : config.position === 'end'
        ? source.length
        : Math.floor(source.length / 2)
  while (source[offset] === '\n') offset++
  if (
    /^[\uD800-\uDBFF][\uDC00-\uDFFF]$/.test(
      source.slice(offset - 1, offset + 1),
    )
  )
    offset++
  const editorOffset = source.slice(0, offset).replace(/\r\n/g, '\n').length
  const result = {
    ...config,
    name,
    directory,
    addons,
    sourceFile,
    chars: source.length,
    words: source.match(/\S+/g)?.length ?? 0,
    offset: fileVisual ? null : offset,
    holdMs,
    idleMs: 2000,
    rate,
    repetitions,
    dispatched: [],
    saves: [],
    status: 'running',
  }
  summary.cases.push(result)
  const app = await launchBenchmarkApp(profile)
  let page,
    session,
    placement,
    tracing = false,
    profiling = false
  const watchdog = setTimeout(
    () => app.process().kill('SIGKILL'),
    holdMs * 2 + 180000,
  )
  try {
    result.nativeRuntime = await app.evaluate(() => process.versions)
    page = await app.firstWindow()
    page.setDefaultTimeout(30000)
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      win.setFocusable(true)
      win.show()
      win.focus()
    })
    await waitForEditor(page)
    await page.waitForFunction(() => !!window.__inputPaintContext)
    if (config.mode === 'source') await switchToSource(app, page)
    if (config.mode === 'split')
      await pressShortcut(
        app,
        `${process.platform === 'darwin' ? 'Meta' : 'Control'}+Shift+\\`,
      )
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      })
    }, file)
    await clickMenu(app, 'Open…')
    await page.waitForFunction(
      (text) =>
        window.__inputPaintContext.editor.getDocument()?.markdown === text,
      source,
      { timeout: 60000 },
    )
    const readiness = await page.waitForFunction((target) => {
      const element = document.querySelector(
        target === 'source' ? '.cm-content' : '.tiptap',
      )
      const notice =
        target === 'visual'
          ? document.querySelector(
              '.rich-editor-host .source-notice .document-notice',
            )
          : null
      if (
        notice &&
        !notice.closest('[hidden], [inert], [aria-hidden="true"]') &&
        notice.getBoundingClientRect().width > 0 &&
        getComputedStyle(notice).visibility === 'visible'
      )
        return { status: 'unavailable', notice: notice.textContent.trim() }
      if (
        document.hasFocus() &&
        element?.isContentEditable &&
        !element.closest('[inert]') &&
        element.getBoundingClientRect().width > 0 &&
        document.querySelector('.app-shell')?.getAttribute('aria-busy') !==
          'true'
      )
        return { status: 'ready' }
      return false
    }, config.target)
    const ready = await readiness.jsonValue()
    await readiness.dispose()
    if (ready.status === 'unavailable') {
      const screenshot = join(directory, 'preservation-notice.png')
      result.unavailable = {
        reason: 'source-preservation',
        notice: ready.notice,
        screenshot,
      }
      await page.screenshot({ path: screenshot, timeout: 5000 })
      if (!fileVisual)
        throw new Error(
          `Generated visual fixture is unexpectedly protected: ${ready.notice}`,
        )
      assert.equal(
        await page.evaluate(
          () => window.__inputPaintContext.editor.getDocument().markdown,
        ),
        source,
        'Protected document source changed before input',
      )
      assert.equal(
        await readFile(file, 'utf8'),
        source,
        'Protected fixture bytes changed before input',
      )
      result.preservation = { canonicalUnchanged: true, diskUnchanged: true }
      result.status = 'unavailable'
      process.exitCode = 1
      return
    }
    placement = await page.evaluate(instrument, {
      target: config.target,
      offset: config.target === 'source' ? editorOffset : offset,
      fileVisual,
      requestedPosition: config.position,
    })
    result.selectedPosition = { ...placement }
    delete result.selectedPosition.baselineText
    const clockBefore = performance.timeOrigin + performance.now(),
      rendererEpoch = await page.evaluate(
        () => performance.timeOrigin + performance.now(),
      ),
      clockAfter = performance.timeOrigin + performance.now()
    result.clockCalibration = {
      hostBeforeEpoch: clockBefore,
      rendererEpoch,
      hostAfterEpoch: clockAfter,
    }
    session = await page.context().newCDPSession(page)
    await session.send('Tracing.start', {
      transferMode: 'ReturnAsStream',
      streamFormat: 'json',
      categories: [
        'input',
        'latencyInfo',
        'devtools.timeline',
        'disabled-by-default-devtools.timeline.frame',
        'blink.user_timing',
        'v8',
        'cc',
        'viz',
        ...(values['trace-screenshots']
          ? ['disabled-by-default-devtools.screenshot']
          : []),
      ].join(','),
      screenshotMaxSize: 800,
      screenshotMaxCount: 24,
    })
    tracing = true
    const key = (character) =>
      character === 'Backspace'
        ? { key: character, code: character, windowsVirtualKeyCode: 8 }
        : character.startsWith('Arrow')
          ? {
              key: character,
              code: character,
              windowsVirtualKeyCode: character === 'ArrowRight' ? 39 : 37,
              modifiers: 8,
            }
          : {
              key: character,
              code: `Key${character.toUpperCase()}`,
              windowsVirtualKeyCode: character.toUpperCase().charCodeAt(0),
              text: character,
              unmodifiedText: character,
            }
    async function dispatch(phase, character, count, duration) {
      await page.evaluate((phase) => {
        window.__inputPaint.phase = phase
        window.__inputPaint.latest = null
        performance.mark(`input-paint:${phase}:start`)
      }, phase)
      const start = performance.now(),
        flights = []
      for (let index = 0; index < count; index++) {
        const scheduled = start + (duration ? (index * duration) / count : 0)
        if (duration) await sleep(scheduled - performance.now())
        const sent = performance.now(),
          generatedEpoch = performance.timeOrigin + sent,
          record = {
            phase,
            index,
            character,
            scheduledEpoch: performance.timeOrigin + scheduled,
            generatedEpoch,
          }
        result.dispatched.push(record)
        flights.push(
          session
            .send('Input.dispatchKeyEvent', {
              type: 'keyDown',
              ...key(character),
              autoRepeat: index > 0,
              timestamp: generatedEpoch / 1000,
            })
            .then(
              () => {
                record.ackEpoch = performance.timeOrigin + performance.now()
              },
              (error) => {
                record.error = error.message
              },
            ),
        )
      }
      // Keyup follows every queued repeat; waiting for paint never controls cadence.
      if (duration) await sleep(start + duration - performance.now())
      flights.push(
        session.send('Input.dispatchKeyEvent', {
          type: 'keyUp',
          ...key(character),
          text: '',
          unmodifiedText: '',
        }),
      )
      await deadline(Promise.all(flights), settleMs, `${phase} dispatch queue`)
      assert.equal(
        result.dispatched.filter((row) => row.phase === phase && row.error)
          .length,
        0,
        `${phase}: input dispatch failed`,
      )
    }
    let acceptedSource = source
    async function save(expected, stage, expectedRichText) {
      const startedEpoch = performance.timeOrigin + performance.now()
      await page.evaluate(
        (stage) => performance.mark(`input-paint:save:${stage}:start`),
        stage,
      )
      if (expectedRichText !== undefined) {
        const accepted = await deadline(
          page.evaluate(() => ({
            text: document.querySelector('.tiptap').editor.state.doc
              .textContent,
            source: window.__inputPaintContext.editor.getDocument().markdown,
          })),
          settleMs,
          `${stage} rich input validation`,
        )
        assert.equal(
          accepted.text,
          expectedRichText,
          `${stage}: rich document omitted or changed accepted input`,
        )
        assert.notEqual(
          accepted.source,
          acceptedSource,
          `${stage}: rich input was not committed to canonical source`,
        )
        expected = accepted.source
      }
      const saved = await deadline(
        page.evaluate(() => window.hibi.saveDocument(false)),
        settleMs,
        `${stage} save`,
      )
      assert.equal(
        saved.markdown,
        expected,
        `${stage}: native save omitted or changed input`,
      )
      assert.equal(
        await readFile(file, 'utf8'),
        expected,
        `${stage}: disk differs from accepted input`,
      )
      assert.equal(
        await page.evaluate(
          () => window.__inputPaintContext.editor.getDocument().markdown,
        ),
        expected,
        `${stage}: renderer differs from accepted input`,
      )
      result.saves.push({
        stage,
        chars: expected.length,
        verified: true,
        startedEpoch,
        finishedEpoch: performance.timeOrigin + performance.now(),
      })
      acceptedSource = expected
      return expected
    }
    async function settle(phase, count) {
      await page.waitForFunction(
        ({ phase, count }) => {
          const records = window.__inputPaint.records.filter(
            (row) => row.phase === phase,
          )
          return (
            records.length === count &&
            records.every(
              (row) =>
                row.modelAt !== undefined && row.nextFrameAt !== undefined,
            )
          )
        },
        { phase, count },
        { timeout: settleMs },
      )
    }
    const rawFirst = `${source.slice(0, offset)}x${source.slice(offset)}`,
      richFirst = fileVisual
        ? `${placement.baselineText.slice(0, placement.textOffset)}x${placement.baselineText.slice(placement.textOffset)}`
        : undefined
    await sleep(2000)
    if (values['cpu-profile']) {
      await deadline(
        session.send('Profiler.enable'),
        5000,
        'CPU profiler enable',
      )
      await deadline(
        session.send('Profiler.setSamplingInterval', { interval: 1000 }),
        5000,
        'CPU profiler interval',
      )
      await deadline(session.send('Profiler.start'), 5000, 'CPU profiler start')
      profiling = true
    }
    await dispatch('first-after-idle', 'x', 1, 0)
    await settle('first-after-idle', 1)
    const first = await save(rawFirst, 'first-after-visible', richFirst)
    let final = first
    await page.screenshot({ path: join(directory, 'first-key.png') })
    if (repetitions) {
      await dispatch('hold-s', 's', repetitions, holdMs)
      await save(
        `${source.slice(0, offset)}x${'s'.repeat(repetitions)}${source.slice(offset)}`,
        'hold-immediate',
        fileVisual
          ? `${placement.baselineText.slice(0, placement.textOffset)}x${'s'.repeat(repetitions)}${placement.baselineText.slice(placement.textOffset)}`
          : undefined,
      )
      await settle('hold-s', repetitions)
      await dispatch('hold-backspace', 'Backspace', repetitions, holdMs)
      final = await save(first, 'backspace-immediate', richFirst)
      await settle('hold-backspace', repetitions)
    }
    await dispatch(
      'selection',
      (fileVisual ? config.position === 'end' : offset === source.length)
        ? 'ArrowLeft'
        : 'ArrowRight',
      20,
      500,
    )
    await page.waitForFunction(
      () => !window.getSelection()?.isCollapsed,
      undefined,
      { timeout: settleMs },
    )
    await settle('selection', 20)
    assert.equal(
      await page.evaluate(
        () => window.__inputPaintContext.editor.getDocument().markdown,
      ),
      final,
    )
    const scroll = await page.evaluate(() => {
      const state = window.__inputPaint
      state.phase = 'scroll'
      let element = document.querySelector(
        state.target === 'source' ? '.cm-scroller' : '.tiptap',
      )
      while (element && element.scrollHeight <= element.clientHeight + 5)
        element = element.parentElement
      if (!element) throw new Error('Fixture has no scrollable editor')
      const rect = element.getBoundingClientRect()
      return {
        x: Math.max(1, Math.min(innerWidth - 1, rect.x + rect.width / 2)),
        y: Math.max(1, Math.min(innerHeight - 1, rect.y + rect.height / 2)),
        delta:
          element.scrollTop + element.clientHeight >= element.scrollHeight - 2
            ? -500
            : 500,
      }
    })
    await page.mouse.move(scroll.x, scroll.y)
    await page.mouse.wheel(0, scroll.delta)
    await page.waitForFunction(
      () => window.__inputPaint.scroll.some((row) => row.frameAt !== undefined),
      undefined,
      { timeout: settleMs },
    )
    result.renderer = await page.evaluate(() => window.__inputPaint.dump())
    await deadline(
      streamTrace(session, join(directory, 'trace.json')),
      30000,
      'trace drain',
    )
    tracing = false
    const history = await deadline(
      page.evaluate(
        async ({ source, final, target, initialRichText, finalRichText }) => {
          const context = window.__inputPaintContext,
            sdk = window.__inputPaintSdk,
            rich = document.querySelector('.tiptap')?.editor,
            view =
              target === 'source'
                ? sdk.codeMirror.view.EditorView.findFromDOM(
                    document.querySelector('.cm-content'),
                  )
                : null
          window.__inputPaint.phase = 'validation'
          window.__inputPaint.latest = null
          let undos = 0
          while (
            context.editor.getDocument().markdown !== source &&
            undos < 128
          ) {
            const done =
              target === 'source'
                ? sdk.codeMirror.commands.undo(view)
                : rich.commands.undo()
            if (!done)
              throw new Error(
                'Undo ended before the original fixture was restored',
              )
            undos++
          }
          if (context.editor.getDocument().markdown !== source)
            throw new Error('Undo did not restore original source exactly')
          if (
            initialRichText !== undefined &&
            rich.state.doc.textContent !== initialRichText
          )
            throw new Error(
              'Undo did not restore original rich document text exactly',
            )
          for (let index = 0; index < undos; index++) {
            const done =
              target === 'source'
                ? sdk.codeMirror.commands.redo(view)
                : rich.commands.redo()
            if (!done)
              throw new Error(
                'Redo ended before all accepted input was restored',
              )
          }
          if (context.editor.getDocument().markdown !== final)
            throw new Error('Redo did not restore all accepted input exactly')
          if (
            finalRichText !== undefined &&
            rich.state.doc.textContent !== finalRichText
          )
            throw new Error(
              'Redo did not restore accepted rich document text exactly',
            )
          return { undos, restoredOriginal: true, restoredFinal: true }
        },
        {
          source,
          final,
          target: config.target,
          initialRichText: fileVisual ? placement.baselineText : undefined,
          finalRichText: richFirst,
        },
      ),
      settleMs,
      'undo/redo validation',
    )
    result.history = history
    await save(final, 'redo')
    result.status = 'passed'
  } catch (error) {
    result.status = 'failed'
    result.error = error.stack ?? String(error)
    if (page)
      result.renderer = await deadline(
        page.evaluate(() => window.__inputPaint?.dump()),
        2000,
        'partial measurement',
      ).catch(() => null)
    throw error
  } finally {
    if (profiling) {
      try {
        const { profile } = await deadline(
          session.send('Profiler.stop'),
          5000,
          'CPU profiler stop',
        )
        result.cpuProfile = join(directory, 'CPUprofile.json')
        await deadline(
          writeProfile(result.cpuProfile, profile),
          10000,
          'CPU profile write',
        )
      } catch (error) {
        result.cpuProfileError = error.message
        result.status = 'failed'
        process.exitCode = 1
      }
    }
    if (tracing)
      await deadline(
        streamTrace(session, join(directory, 'trace.json')),
        20000,
        'partial trace',
      ).catch((error) => {
        result.traceError = error.message
      })
    await writeFile(
      join(directory, 'result.json'),
      JSON.stringify(result, null, 2),
    )
    await deadline(app.close(), 5000, 'benchmark app close').catch((error) => {
      result.closeError = error.message
      app.process().kill('SIGKILL')
    })
    clearTimeout(watchdog)
    await writeFile(
      join(directory, 'result.json'),
      JSON.stringify(result, null, 2),
    )
  }
}
try {
  for (const mode of modes)
    for (const size of sizes)
      for (const shape of shapes)
        for (const position of positions) {
          const targets =
            mode === 'split'
              ? values.target === 'both'
                ? ['source', 'visual']
                : [values.target]
              : [mode]
          for (const target of targets) {
            try {
              await runCase({ mode, target, size, shape, position })
            } catch (error) {
              if (!values['continue-on-error']) throw error
              process.exitCode = 1
              console.error(
                `${mode}/${target}/${size}/${shape}/${position}: ${error.message}`,
              )
            }
            await writeFile(
              join(output, 'summary.json'),
              JSON.stringify(summary, null, 2),
            )
          }
        }
} catch (error) {
  process.exitCode = 1
  console.error(error.message)
} finally {
  await writeFile(
    join(output, 'summary.json'),
    JSON.stringify(summary, null, 2),
  )
}
