import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const round = (value) => Math.round(value * 1000) / 1000
const finite = (value) => typeof value === 'number' && Number.isFinite(value)
const percentile = (values, p) =>
  values[Math.max(0, Math.ceil(values.length * p) - 1)] ?? null
export function distribution(values) {
  const sorted = values.filter(finite).sort((a, b) => a - b)
  return {
    count: sorted.length,
    medianMs: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
    maxMs: sorted.at(-1) ?? null,
  }
}
const thread = (event) => `${event.pid}:${event.tid}`
const elapsed = (event) => round(event.dur / 1000)
const isTiming = (event) => event.cat?.includes('user_timing')
const category = (name) => {
  if (
    /garbage|scavenge|mark.?compact|minor.?gc|major.?gc|\(garbage collector\)/i.test(
      name,
    )
  )
    return 'gc'
  if (/parse|lex|tokeniz|setContent/i.test(name)) return 'parse'
  if (/serializ|renderNodeToMarkdown|getMarkdown/i.test(name))
    return 'serialize'
  if (
    /react|renderWithHooks|commitRoot|perform.*Root|beginWork|completeWork|reconcileChildren/i.test(
      name,
    )
  )
    return 'react'
  if (/layout|recalculate|updateStyle|styleRecalc/i.test(name)) return 'layout'
  if (/paint|drawFrame|raster|composit/i.test(name)) return 'paint'
  return null
}

function completeEvents(events) {
  const complete = [],
    stacks = new Map(),
    async = new Map()
  let unmatchedEnds = 0
  for (const event of events
    .filter((event) => finite(event.ts))
    .sort((a, b) => a.ts - b.ts)) {
    if (event.ph === 'X' && finite(event.dur) && event.dur >= 0)
      complete.push(event)
    else if (event.ph === 'B') {
      const key = thread(event),
        stack = stacks.get(key) ?? []
      stack.push(event)
      stacks.set(key, stack)
    } else if (event.ph === 'E') {
      const start = stacks.get(thread(event))?.pop()
      if (start && event.ts >= start.ts)
        complete.push({ ...start, ph: 'X', dur: event.ts - start.ts })
      else unmatchedEnds++
    } else if (['b', 'e', 'S', 'F'].includes(event.ph)) {
      const identity =
        event.id2?.global !== undefined
          ? `global:${event.id2.global}`
          : `${event.pid}:${event.id2?.local ?? event.id}`
      const key = `${identity}:${event.cat}:${event.name}`
      const stack = async.get(key) ?? []
      if (event.ph === 'b' || event.ph === 'S') stack.push(event)
      else {
        const start = stack.pop()
        if (start)
          complete.push({ ...start, ph: 'X', dur: event.ts - start.ts })
        else unmatchedEnds++
      }
      async.set(key, stack)
    }
  }
  return {
    complete,
    unmatchedEnds,
    unmatchedStarts: [...stacks.values(), ...async.values()].reduce(
      (sum, stack) => sum + stack.length,
      0,
    ),
  }
}

function summarizeEvents(events) {
  const groups = new Map()
  for (const event of events) {
    const key = `${thread(event)} ${event.name}`
    const current = groups.get(key) ?? {
      name: event.name,
      thread: thread(event),
      category: category(event.name),
      count: 0,
      totalMs: 0,
      maxMs: 0,
    }
    current.count++
    current.totalMs += event.dur / 1000
    current.maxMs = Math.max(current.maxMs, event.dur / 1000)
    groups.set(key, current)
  }
  return [...groups.values()]
    .map((entry) => ({
      ...entry,
      totalMs: round(entry.totalMs),
      maxMs: round(entry.maxMs),
    }))
    .sort((a, b) => b.totalMs - a.totalMs)
}

function profilesFromTrace(events) {
  const profiles = new Map()
  for (const event of events) {
    const data = event.args?.data
    if (
      !data ||
      !['Profile', 'ProfileChunk', 'CpuProfile'].includes(event.name)
    )
      continue
    const key = `${event.pid}:${event.id ?? event.tid}`
    const profile = profiles.get(key) ?? {
      nodes: new Map(),
      samples: [],
      timeDeltas: [],
    }
    if (finite(data.startTime)) profile.startTime = data.startTime
    if (finite(data.endTime)) profile.endTime = data.endTime
    if (data.cpuProfile) {
      for (const node of data.cpuProfile.nodes ?? []) {
        const old = profile.nodes.get(node.id)
        profile.nodes.set(node.id, {
          ...old,
          ...node,
          children: [
            ...new Set([...(old?.children ?? []), ...(node.children ?? [])]),
          ],
        })
      }
      profile.samples.push(...(data.cpuProfile.samples ?? []))
      profile.timeDeltas.push(
        ...(data.timeDeltas ?? data.cpuProfile.timeDeltas ?? []),
      )
      if (finite(data.cpuProfile.startTime))
        profile.startTime = data.cpuProfile.startTime
      if (finite(data.cpuProfile.endTime))
        profile.endTime = data.cpuProfile.endTime
    }
    profiles.set(key, profile)
  }
  return [...profiles.values()].map((profile) => ({
    ...profile,
    nodes: [...profile.nodes.values()],
  }))
}

function summarizeProfiles(profiles) {
  const functions = new Map(),
    stacks = new Map(),
    groups = new Map()
  let samples = 0,
    missingDuration = 0,
    unknownNodes = 0,
    measuredUs = 0,
    weightedSamples = 0
  const timelines = []
  for (const [profileIndex, profile] of profiles.entries()) {
    const start = finite(profile.startTime) ? profile.startTime : 0,
      ordered = [],
      timeline = {
        profile: profileIndex,
        samples: profile.samples?.length ?? 0,
        deltas: profile.timeDeltas?.length ?? 0,
        negativeDeltas: 0,
        missingDeltas: 0,
        outOfBounds: 0,
        reorderedSamples: 0,
        duplicateTimestamps: 0,
      }
    let timestamp = start
    for (let index = 0; index < timeline.samples; index++) {
      const delta = profile.timeDeltas?.[index]
      samples++
      if (!finite(delta)) {
        timeline.missingDeltas++
        continue
      }
      if (delta < 0) timeline.negativeDeltas++
      timestamp += delta
      if (
        !finite(timestamp) ||
        timestamp < start ||
        (finite(profile.endTime) && timestamp > profile.endTime)
      )
        timeline.outOfBounds++
      ordered.push({ index, node: profile.samples[index], timestamp })
    }
    missingDuration += timeline.missingDeltas
    const unavailable =
      !timeline.samples ||
      timeline.missingDeltas > 0 ||
      timeline.outOfBounds > 0 ||
      profile.timeDeltas?.length !== timeline.samples
    timeline.weightStatus = unavailable ? 'unavailable' : 'estimated'
    timeline.phaseAttribution = 'unavailable'
    timeline.profileDurationMs =
      finite(profile.endTime) && finite(profile.startTime)
        ? round((profile.endTime - profile.startTime) / 1000)
        : null
    timelines.push(timeline)
    if (unavailable) continue
    // A negative delta moves the sample timestamp backwards; discarding just
    // that duration double-counts its overlap with later positive intervals.
    ordered.sort((a, b) => a.timestamp - b.timestamp || a.index - b.index)
    let previous = start
    for (let index = 0; index < ordered.length; index++) {
      const sample = ordered[index]
      if (sample.index !== index) timeline.reorderedSamples++
      if (index && sample.timestamp === ordered[index - 1].timestamp)
        timeline.duplicateTimestamps++
      sample.duration = sample.timestamp - previous
      previous = sample.timestamp
    }
    timeline.coveredMs = round((previous - start) / 1000)
    const nodes = new Map((profile.nodes ?? []).map((node) => [node.id, node]))
    const parents = new Map()
    for (const node of nodes.values())
      for (const child of node.children ?? []) parents.set(child, node.id)
    const label = (node) => {
      const frame = node.callFrame ?? {}
      return `${frame.functionName || '(anonymous)'} @ ${frame.url || '(native)'}:${(frame.lineNumber ?? -1) + 1}`
    }
    for (const sample of ordered) {
      const node = nodes.get(sample.node),
        duration = sample.duration
      if (!node) {
        unknownNodes++
        continue
      }
      weightedSamples++
      measuredUs += duration
      const callStack = [],
        visited = new Set()
      let current = node
      while (current && !visited.has(current.id)) {
        visited.add(current.id)
        callStack.push(label(current))
        current = nodes.get(parents.get(current.id))
      }
      const leaf = label(node),
        full = callStack.reverse().join(' → ')
      functions.set(leaf, (functions.get(leaf) ?? 0) + duration)
      stacks.set(full, (stacks.get(full) ?? 0) + duration)
      // Leaf names only: an ancestor named "parse" does not make every child parser CPU.
      const group = category(node.callFrame?.functionName ?? '')
      if (group) groups.set(group, (groups.get(group) ?? 0) + duration)
    }
  }
  const top = (map) =>
    [...map]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([name, duration]) => ({ name, sampledMs: round(duration / 1000) }))
  return {
    profiles: profiles.length,
    samples,
    missingDuration,
    unknownNodes,
    weightedSamples,
    sampledMs: weightedSamples ? round(measuredUs / 1000) : null,
    timelines,
    topFunctions: top(functions),
    topStacks: top(stacks),
    leafNameGroups: top(groups),
    note: 'global sample-weight estimates from signed cumulative timestamps, stably sorted when samples arrive out of order. malformed or out-of-bounds timelines have unavailable weights. per-phase CPU attribution is unavailable; nonmonotonic timing cannot establish it. name groups are search aids, not causal attribution or exact function timings.',
  }
}

function metricDistributions(metrics) {
  const buckets = new Map(),
    context = []
  const visit = (value, path) => {
    if (!value || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      const next = `${path}${path ? '.' : ''}${key}`
      if (
        /context|dom|visibleRanges|visibleLine|rendered|environment|summary|endpoints/i.test(
          key,
        )
      ) {
        if (/context|dom|visibleRanges|visibleLine|rendered/i.test(key))
          context.push({ path: next, value: child })
        continue
      }
      if (key.endsWith('Ms') && finite(child)) {
        const normalized = next.replace(/\.\d+(?=\.|$)/g, '[]')
        const values = buckets.get(normalized) ?? []
        values.push(child)
        buckets.set(normalized, values)
      } else if (
        Array.isArray(child) &&
        child.every(finite) &&
        key.endsWith('Ms')
      ) {
        const values = buckets.get(next) ?? []
        values.push(...child)
        buckets.set(next, values)
      } else visit(child, next)
    }
  }
  visit(metrics, '')
  return {
    distributions: metrics?.renderer?.records
      ? {}
      : Object.fromEntries(
          [...buckets].map(([key, values]) => [key, distribution(values)]),
        ),
    outsideTimedContext: context,
  }
}

function inputMetrics(metrics) {
  const renderer = metrics?.renderer,
    records = renderer?.records ?? []
  const endpoints = {
    queueMs: ['keydownAt', 'eventTime'],
    keydownListenersMs: ['keydownBubbleEndAt', 'keydownAt'],
    keydownToMicrotaskMs: ['keydownMicrotaskAt', 'keydownAt'],
    keydownToBeforeinputMs: ['beforeinputAt', 'keydownAt'],
    beforeinputListenersMs: ['beforeinputBubbleEndAt', 'beforeinputAt'],
    editMs: ['modelAt', 'beforeinputAt'],
    subscriberMs: ['subscriberAt', 'modelAt'],
    modelToVisibleFrameMs: ['visibleFrameAt', 'modelAt'],
    eventToVisibleFrameMs: ['visibleFrameAt', 'eventTime'],
    eventToNextFrameMs: ['nextFrameAt', 'eventTime'],
  }
  const grouped = new Map()
  for (const record of records) {
    const group = grouped.get(record.phase) ?? []
    group.push(record)
    grouped.set(record.phase, group)
  }
  const phases = [...grouped].map(([phase, entries]) => ({
    phase,
    keys: entries.length,
    documentChanges: entries.filter((entry) => entry.docChanged === true)
      .length,
    missingModel: entries.filter((entry) => !finite(entry.modelAt)).length,
    missingFrame: entries.filter((entry) => !finite(entry.visibleFrameAt))
      .length,
    endpoints: Object.fromEntries(
      Object.entries(endpoints).map(([name, [end, begin]]) => {
        const values = entries
          .filter((entry) => finite(entry[end]) && finite(entry[begin]))
          .map((entry) => entry[end] - entry[begin])
        return [
          name,
          {
            ...distribution(values.filter((value) => value >= 0)),
            negative: values.filter((value) => value < 0).length,
          },
        ]
      }),
    ),
  }))
  return {
    case: metrics
      ? Object.fromEntries(
          [
            'mode',
            'target',
            'size',
            'shape',
            'position',
            'chars',
            'words',
            'holdMs',
            'rate',
            'repetitions',
            'status',
            'error',
          ]
            .filter((key) => metrics[key] !== undefined)
            .map((key) => [key, metrics[key]]),
        )
      : null,
    phases,
    dispatch: {
      count: metrics?.dispatched?.length ?? 0,
      errors: metrics?.dispatched?.filter((entry) => entry.error).length ?? 0,
      schedulingLatenessMs: distribution(
        (metrics?.dispatched ?? [])
          .filter(
            (entry) =>
              finite(entry.generatedEpoch) && finite(entry.scheduledEpoch),
          )
          .map((entry) => entry.generatedEpoch - entry.scheduledEpoch),
      ),
      commandAcknowledgmentMs: distribution(
        (metrics?.dispatched ?? [])
          .filter(
            (entry) => finite(entry.ackEpoch) && finite(entry.generatedEpoch),
          )
          .map((entry) => entry.ackEpoch - entry.generatedEpoch),
      ),
    },
    scrollToFrameMs: distribution(
      (renderer?.scroll ?? [])
        .filter((entry) => finite(entry.frameAt) && finite(entry.at))
        .map((entry) => entry.frameAt - entry.at),
    ),
    pending: renderer?.pending ?? null,
    focused: renderer?.focused ?? null,
    saves: metrics?.saves ?? [],
    history: metrics?.history ?? null,
    wrappedMethods: renderer?.methods ?? [],
    methodSpans: [
      ...Map.groupBy(
        renderer?.spans ?? [],
        (span) => `${span.phase}:${span.label}`,
      ),
    ].map(([name, spans]) => ({
      name,
      ...distribution(spans.map((span) => span.duration)),
    })),
    endpointNotes: {
      queueMs:
        'DOM event timestamp to renderer keydown listener; excludes time before the supplied event timestamp.',
      editMs:
        'beforeinput listener to harness model observer; includes whatever work precedes that observer, not necessarily every subscriber.',
      subscriberMs:
        'requires an explicit subscriberAt marker; absent in a capture means unavailable.',
      visibleFrame:
        'DOM glyph/rectangle observation in an animation-frame callback; pending keys may share latest glyph, so this is not per-key glyph presentation.',
      commandAcknowledgmentMs:
        'host dispatch call to CDP acknowledgment, not model completion or paint.',
    },
  }
}

function mergeIntervals(intervals) {
  const merged = []
  for (const [start, end] of intervals.sort((a, b) => a[0] - b[0])) {
    const last = merged.at(-1)
    if (last && start <= last[1]) last[1] = Math.max(last[1], end)
    else merged.push([start, end])
  }
  return merged
}

function intersectIntervals(first, second) {
  const result = []
  let a = 0,
    b = 0
  while (a < first.length && b < second.length) {
    const start = Math.max(first[a][0], second[b][0]),
      end = Math.min(first[a][1], second[b][1])
    if (end > start) result.push([start, end])
    if (first[a][1] < second[b][1]) a++
    else b++
  }
  return result
}

function intervalDuration(intervals, start, end) {
  let low = 0,
    high = intervals.length,
    duration = 0
  while (low < high) {
    const mid = (low + high) >> 1
    if (intervals[mid][1] <= start) low = mid + 1
    else high = mid
  }
  for (let i = low; i < intervals.length && intervals[i][0] < end; i++)
    duration += Math.max(
      0,
      Math.min(end, intervals[i][1]) - Math.max(start, intervals[i][0]),
    )
  return duration / 1000
}

function mainThreadWork(complete) {
  const groups = new Map()
  for (const event of complete) {
    const key = thread(event),
      group = groups.get(key) ?? {
        script: [],
        layout: [],
        paint: [],
        busy: [],
      },
      interval = [event.ts, event.ts + event.dur]
    let kind
    if (
      /^(FunctionCall|EvaluateScript|RunMicrotasks|V8\.Execute)$/.test(
        event.name,
      )
    )
      kind = 'script'
    else if (
      /^(Layout|UpdateLayoutTree|RecalculateStyles|UpdateStyleAndLayout)$/.test(
        event.name,
      )
    )
      kind = 'layout'
    else if (
      /^(PrePaint|Paint|PaintImage|Layerize|UpdateLayerTree|CompositeLayers)$/.test(
        event.name,
      )
    )
      kind = 'paint'
    if (kind) group[kind].push(interval)
    if (
      kind ||
      /(?:^|::)RunTask$|^Program$|^EventDispatch$|^FireAnimationFrame$/.test(
        event.name,
      )
    )
      group.busy.push(interval)
    groups.set(key, group)
  }
  for (const group of groups.values()) {
    for (const key of Object.keys(group))
      group[key] = mergeIntervals(group[key])
    group.render = mergeIntervals(
      [...group.layout, ...group.paint].map((range) => [...range]),
    )
    group.scriptRender = intersectIntervals(group.script, group.render)
    group.attributed = mergeIntervals(
      [...group.script, ...group.render].map((range) => [...range]),
    )
  }
  return (key, start, end) => {
    const group = groups.get(key)
    if (!group?.busy.length || !finite(end)) return null
    const duration = (name) => intervalDuration(group[name], start, end),
      windowMs = (end - start) / 1000,
      busyMs = duration('busy'),
      layoutMs = duration('layout')
    return Object.fromEntries(
      Object.entries({
        windowMs,
        scriptExcludingRenderingMs: Math.max(
          0,
          duration('script') - duration('scriptRender'),
        ),
        layoutStyleMs: layoutMs,
        paintExcludingLayoutMs: Math.max(0, duration('render') - layoutMs),
        otherObservedTaskMs: Math.max(0, busyMs - duration('attributed')),
        unattributedOrWaitingMs: Math.max(0, windowMs - busyMs),
      }).map(([name, value]) => [name, round(value)]),
    )
  }
}

function summarizeInputWork(inputs, property) {
  return [...Map.groupBy(inputs, (input) => input.phase)].map(
    ([phase, entries]) => ({
      phase,
      distributions: Object.fromEntries(
        Object.keys(
          entries.find((entry) => entry[property])?.[property] ?? {},
        ).map((name) => [
          name,
          distribution(entries.map((entry) => entry[property]?.[name])),
        ]),
      ),
    }),
  )
}

function correlateInput(events, timing, tasks, work, metrics) {
  const keys = new Map(),
    spans = []
  const records = new Map(
    (metrics?.renderer?.records ?? []).map((record) => [
      `${record.phase}:${record.id}`,
      record,
    ]),
  )
  for (const event of events) {
    if (!isTiming(event) || !finite(event.ts)) continue
    const match =
      /^input-paint:([^:]+):(keydown|beforeinput|input|model|subscriber|visible|next-frame):(\d+)$/.exec(
        event.name,
      )
    if (!match) continue
    const [, phase, point, id] = match,
      key = `${phase}:${id}`
    const entry = keys.get(key) ?? {
      phase,
      id: Number(id),
      thread: thread(event),
      pid: event.pid,
      points: {},
    }
    entry.points[point] = event.ts
    keys.set(key, entry)
  }
  const paintEvents = events
    .filter(
      (event) =>
        ['Paint', 'DrawFrame'].includes(event.name) && finite(event.ts),
    )
    .sort((a, b) => a.ts - b.ts)
  const saves = events.filter(
    (event) => isTiming(event) && /^input-paint:save:/.test(event.name),
  )
  for (const key of keys.values()) {
    const start = key.points.keydown,
      model = key.points.model,
      end = key.points['next-frame'] ?? key.points.visible
    if (!finite(start)) continue
    const first = (name) =>
      finite(model)
        ? paintEvents.find(
            (event) =>
              event.name === name &&
              event.pid === key.pid &&
              event.ts >= model &&
              finite(end) &&
              event.ts <= end,
          )
        : null
    const paint = first('Paint'),
      draw = first('DrawFrame')
    const record = records.get(`${key.phase}:${key.id}`)
    const queueMs =
      finite(record?.keydownAt) && finite(record?.eventTime)
        ? record.keydownAt - record.eventTime
        : null
    spans.push({
      phase: key.phase,
      id: key.id,
      thread: key.thread,
      traceKeydownUs: start,
      observedMainThread: work(key.thread, start, end),
      queuedMainThread:
        finite(queueMs) && queueMs >= 0
          ? work(key.thread, start - queueMs * 1000, start)
          : null,
      milestonesMs: Object.fromEntries(
        Object.entries(key.points).map(([point, ts]) => [
          point,
          round((ts - start) / 1000),
        ]),
      ),
      firstPaintAfterModelMs: paint ? round((paint.ts - model) / 1000) : null,
      firstDrawFrameAfterModelMs: draw ? round((draw.ts - model) / 1000) : null,
      // Same-process paint is only a temporal match: the trace does not identify the edited glyph.
      paintThread: paint ? thread(paint) : null,
      drawFrameThread: draw ? thread(draw) : null,
      overlappingSaveMarkers: finite(end)
        ? saves
            .filter((event) => event.ts >= start && event.ts <= end)
            .map((event) => event.name)
        : [],
      overlappingTasks: finite(end)
        ? tasks
            .filter(
              (event) =>
                thread(event) === key.thread &&
                event.ts < end &&
                event.ts + event.dur > start,
            )
            .map((event) => ({ name: event.name, durationMs: elapsed(event) }))
            .slice(0, 8)
        : [],
      overlappingPhases: finite(end)
        ? timing
            .filter(
              (event) =>
                thread(event) === key.thread &&
                event.ts < end &&
                event.ts + event.dur > start,
            )
            .map((event) => ({ name: event.name, durationMs: elapsed(event) }))
            .slice(0, 15)
        : [],
    })
  }
  return spans
}

export function analyzeInputTrace(trace, metrics = null, cpuProfile = null) {
  const events = Array.isArray(trace)
    ? trace
    : (trace.traceEvents ?? trace.TraceEvents)
  if (!Array.isArray(events))
    throw new Error('Trace must contain a traceEvents array.')
  const { complete, unmatchedEnds, unmatchedStarts } = completeEvents(events)
  const threads = events
    .filter((event) => event.ph === 'M' && event.name === 'thread_name')
    .map((event) => ({ thread: thread(event), name: event.args?.name }))
  const tasks = complete.filter((event) =>
    /(?:^|::)RunTask$|^Program$/.test(event.name),
  )
  const timing = complete.filter(isTiming)
  const phases = new Map()
  for (const event of timing) {
    const name = event.name.replace(/(:span:.+):\d+$/, '$1')
    const values = phases.get(name) ?? []
    values.push(event.dur / 1000)
    phases.set(name, values)
  }
  const paints = events
    .filter(
      (event) => /^(?:Paint|DrawFrame)$/.test(event.name) && finite(event.ts),
    )
    .sort((a, b) => a.ts - b.ts)
  const start = events.reduce(
    (earliest, event) =>
      finite(event.ts) ? Math.min(earliest, event.ts) : earliest,
    Infinity,
  )
  const longestTasks = [...tasks]
    .sort((a, b) => b.dur - a.dur)
    .slice(0, 15)
    .map((task) => ({
      name: task.name,
      thread: thread(task),
      startMs: round((task.ts - start) / 1000),
      durationMs: elapsed(task),
      overlappingPhases: timing
        .filter(
          (event) =>
            thread(event) === thread(task) &&
            event.ts < task.ts + task.dur &&
            event.ts + event.dur > task.ts,
        )
        .map((event) => ({ name: event.name, durationMs: elapsed(event) }))
        .slice(0, 20),
    }))
  const profiles = profilesFromTrace(events)
  if (cpuProfile) profiles.push(cpuProfile.profile ?? cpuProfile)
  const inputs = correlateInput(
    events,
    timing,
    tasks,
    mainThreadWork(complete),
    metrics,
  )
  return {
    units:
      'milliseconds; trace timestamps and CPU timeDeltas converted from microseconds',
    evidenceLimits: [
      'trace event inclusive durations overlap; never sum them as exclusive CPU time.',
      'Paint and DrawFrame are trace milestones, not proof of pixel presentation or the edited glyph being visible.',
      'frame callbacks are scheduling proxies. missing phases and samples mean unavailable evidence, not zero work.',
      'benchmark DOM and visible-range context is collected outside timed input and is not a latency metric.',
      'main-thread work uses merged trace intervals from keydown through the next-frame proxy. nested rendering is subtracted from scripting; unattributed time may contain unrecorded native work as well as scheduling waits. per-key windows can overlap.',
      'queued-input work aligns the renderer event-to-keydown interval to its trace keydown marker. it excludes work before the supplied event timestamp and does not identify physical keyboard or browser-process latency.',
    ],
    trace: {
      events: events.length,
      completeEvents: complete.length,
      unmatchedEnds,
      unmatchedStarts,
      threads,
    },
    benchmark: { ...metricDistributions(metrics), ...inputMetrics(metrics) },
    inputs,
    observedMainThread: summarizeInputWork(inputs, 'observedMainThread'),
    queuedMainThread: summarizeInputWork(inputs, 'queuedMainThread'),
    userTiming: Object.fromEntries(
      [...phases].map(([name, values]) => [name, distribution(values)]),
    ),
    tasks: {
      distribution: distribution(tasks.map((task) => task.dur / 1000)),
      over50Ms: tasks.filter((task) => task.dur >= 50000).length,
      longest: longestTasks,
    },
    namedEvents: summarizeEvents(
      complete.filter((event) => category(event.name)),
    ).slice(0, 30),
    longestFunctions: complete
      .filter((event) => event.name === 'FunctionCall')
      .sort((a, b) => b.dur - a.dur)
      .slice(0, 15)
      .map((event) => ({
        thread: thread(event),
        startMs: round((event.ts - start) / 1000),
        durationMs: elapsed(event),
        functionName: event.args?.data?.functionName ?? null,
        url: event.args?.data?.url ?? null,
        lineNumber: event.args?.data?.lineNumber ?? null,
        columnNumber: event.args?.data?.columnNumber ?? null,
        locationNote:
          'raw trace coordinates; function names and generated locations alone do not establish the original source or cause.',
      })),
    paintEvents: {
      Paint: paints.filter((event) => event.name === 'Paint').length,
      DrawFrame: paints.filter((event) => event.name === 'DrawFrame').length,
    },
    cpu: summarizeProfiles(profiles),
  }
}

function report(summary) {
  const lines = [
    '# input trace analysis',
    '',
    ...summary.evidenceLimits.map((note) => `- ${note}`),
    '',
    '## measured distributions',
    '',
  ]
  for (const phase of summary.benchmark.phases) {
    lines.push(
      `### ${phase.phase}`,
      '',
      `${phase.keys} keys; ${phase.missingModel} missing model observations; ${phase.missingFrame} missing frame observations.`,
      '',
    )
    for (const [name, value] of Object.entries(phase.endpoints))
      lines.push(
        `- ${name}: n=${value.count}, p50=${value.medianMs === null ? 'unavailable' : round(value.medianMs)}, p95=${value.p95Ms === null ? 'unavailable' : round(value.p95Ms)}, p99=${value.p99Ms === null ? 'unavailable' : round(value.p99Ms)}, max=${value.maxMs === null ? 'unavailable' : round(value.maxMs)} ms`,
      )
    lines.push('')
  }
  for (const [name, value] of Object.entries({
    ...summary.benchmark.distributions,
    ...summary.userTiming,
  }))
    lines.push(
      `- ${name}: n=${value.count}, p50=${value.medianMs}, p95=${value.p95Ms}, p99=${value.p99Ms}, max=${value.maxMs} ms`,
    )
  for (const [title, phases] of [
    ['main-thread work after keydown', summary.observedMainThread],
    ['main-thread work while input is queued', summary.queuedMainThread],
  ]) {
    lines.push('', `## ${title}`, '')
    for (const phase of phases) {
      lines.push(`### ${phase.phase}`, '')
      for (const [name, value] of Object.entries(phase.distributions))
        lines.push(
          `- ${name}: n=${value.count}, p50=${value.medianMs}, p95=${value.p95Ms}, p99=${value.p99Ms}, max=${value.maxMs} ms`,
        )
      lines.push('')
    }
  }
  lines.push('', '## longest trace tasks', '')
  for (const task of summary.tasks.longest.slice(0, 8))
    lines.push(
      `- ${task.durationMs} ms at +${task.startMs} ms, thread ${task.thread}; phases: ${task.overlappingPhases.map((phase) => phase.name).join(', ') || 'none captured'}`,
    )
  lines.push('', '## sampled leaf functions', '')
  if (!summary.cpu.samples) lines.push('no CPU samples available.')
  for (const timeline of summary.cpu.timelines) {
    if (timeline.negativeDeltas)
      lines.push(
        `profile ${timeline.profile}: ${timeline.negativeDeltas} negative deltas; signed timestamps reordered before weighting. per-phase CPU attribution unavailable.`,
      )
    if (timeline.weightStatus === 'unavailable')
      lines.push(
        `profile ${timeline.profile}: sample weights unavailable (${timeline.samples} samples, ${timeline.deltas} deltas, ${timeline.missingDeltas} missing deltas, ${timeline.outOfBounds} out-of-bounds timestamps).`,
      )
  }
  for (const entry of summary.cpu.topFunctions.slice(0, 8))
    lines.push(`- ${entry.sampledMs} ms: ${entry.name}`)
  lines.push('', '## longest traced function calls', '')
  for (const entry of summary.longestFunctions.slice(0, 8))
    lines.push(
      `- ${entry.durationMs} ms: ${entry.functionName ?? '(unnamed)'} at ${entry.url ?? '(no URL)'}:${entry.lineNumber ?? '?'}:${entry.columnNumber ?? '?'}, thread ${entry.thread}`,
    )
  lines.push(
    '',
    summary.cpu.note,
    '',
    'outside-timed DOM context and complete summaries are in companion JSON.',
    '',
  )
  return lines.join('\n')
}

async function main() {
  const args = process.argv.slice(2),
    options = {}
  if (args.length === 1 && args[0] === '--self-test') {
    const { default: assert } = await import('node:assert/strict')
    const event = (name, ts, extra = {}) => ({
      name,
      ts,
      pid: 1,
      tid: 2,
      ph: 'R',
      cat: 'blink.user_timing',
      ...extra,
    })
    const trace = {
      traceEvents: [
        event('RunTask', 1000, { ph: 'B', cat: 'toplevel' }),
        event('input-paint:first-after-idle:keydown:1', 2000),
        event('input-paint:first-after-idle:span:rich.markdown.parse:1', 2500, {
          ph: 'b',
          id: 5,
        }),
        event('input-paint:first-after-idle:model:1', 6000),
        event('input-paint:first-after-idle:span:rich.markdown.parse:1', 6500, {
          ph: 'e',
          id: 5,
        }),
        event('RunTask', 9000, { ph: 'E', cat: 'toplevel' }),
        event('Paint', 10000, { ph: 'X', dur: 100, cat: 'devtools.timeline' }),
        event('input-paint:first-after-idle:visible:1', 11000),
        event('DrawFrame', 12000, {
          tid: 3,
          ph: 'I',
          cat: 'devtools.timeline',
        }),
        event('input-paint:first-after-idle:next-frame:1', 13000),
      ],
    }
    const metrics = {
      renderer: {
        records: [
          {
            id: 1,
            phase: 'first-after-idle',
            eventTime: 1,
            keydownAt: 2,
            beforeinputAt: 3,
            modelAt: 6,
            visibleFrameAt: 11,
            nextFrameAt: 13,
            docChanged: true,
          },
        ],
        finalRenderedElements: 10,
      },
    }
    const profile = {
      nodes: [
        { id: 1, callFrame: { functionName: '(root)' }, children: [2] },
        { id: 2, callFrame: { functionName: 'parse' } },
      ],
      samples: [2, 2],
      timeDeltas: [1000, 2000],
    }
    const result = analyzeInputTrace(trace, metrics, profile)
    assert.equal(result.tasks.distribution.maxMs, 8)
    assert.equal(
      result.userTiming['input-paint:first-after-idle:span:rich.markdown.parse']
        .maxMs,
      4,
    )
    assert.equal(result.inputs[0].firstPaintAfterModelMs, 4)
    assert.equal(result.inputs[0].firstDrawFrameAfterModelMs, 6)
    assert.equal(result.benchmark.phases[0].endpoints.queueMs.medianMs, 1)
    assert.equal(result.benchmark.phases[0].endpoints.editMs.medianMs, 3)
    assert.equal(result.benchmark.phases[0].endpoints.subscriberMs.count, 0)
    assert.equal(result.benchmark.outsideTimedContext[0].value, 10)
    assert.equal(result.cpu.topFunctions[0].sampledMs, 3)
    const timingOnly = analyzeInputTrace(
      {
        traceEvents: trace.traceEvents.filter((entry) => isTiming(entry)),
      },
      metrics,
    )
    assert.equal(timingOnly.inputs[0].observedMainThread, null)
    assert.equal(timingOnly.inputs[0].queuedMainThread, null)
    assert.deepEqual(timingOnly.observedMainThread[0].distributions, {})
    const attributed = analyzeInputTrace(
      {
        traceEvents: [
          ...trace.traceEvents,
          event('FunctionCall', 2500, {
            ph: 'X',
            dur: 5000,
            cat: 'devtools.timeline',
          }),
          event('FunctionCall', 3000, {
            ph: 'X',
            dur: 1000,
            cat: 'devtools.timeline',
          }),
          event('Layout', 3500, {
            ph: 'X',
            dur: 1000,
            cat: 'devtools.timeline',
          }),
          event('Layout', 2000, {
            ph: 'X',
            dur: 9000,
            tid: 9,
            cat: 'devtools.timeline',
          }),
        ],
      },
      metrics,
    )
    assert.deepEqual(attributed.inputs[0].observedMainThread, {
      windowMs: 11,
      scriptExcludingRenderingMs: 4,
      layoutStyleMs: 1,
      paintExcludingLayoutMs: 0.1,
      otherObservedTaskMs: 2,
      unattributedOrWaitingMs: 3.9,
    })
    assert.deepEqual(attributed.inputs[0].queuedMainThread, {
      windowMs: 1,
      scriptExcludingRenderingMs: 0,
      layoutStyleMs: 0,
      paintExcludingLayoutMs: 0,
      otherObservedTaskMs: 1,
      unattributedOrWaitingMs: 0,
    })
    assert.equal(analyzeInputTrace(trace).inputs[0].queuedMainThread, null)
    const invalidClock = structuredClone(metrics)
    invalidClock.renderer.records[0].eventTime = 3
    assert.equal(
      analyzeInputTrace(trace, invalidClock).inputs[0].queuedMainThread,
      null,
    )
    assert.equal(
      attributed.observedMainThread[0].distributions.layoutStyleMs.p99Ms,
      1,
    )
    assert.equal(
      distribution(Array.from({ length: 100 }, (_, i) => i + 1)).p99Ms,
      99,
    )
    const reordered = analyzeInputTrace({ traceEvents: [] }, null, {
      ...profile,
      startTime: 10000,
      endTime: 14000,
      nodes: [
        { ...profile.nodes[0], children: [2, 3] },
        profile.nodes[1],
        { id: 3, callFrame: { functionName: 'render' } },
      ],
      samples: [2, 3, 2, 3],
      timeDeltas: [1000, 2000, -1000, 1000],
    }).cpu
    assert.equal(reordered.sampledMs, 3)
    assert.deepEqual(
      reordered.topFunctions.map((entry) => [
        entry.name.split(' @ ')[0],
        entry.sampledMs,
      ]),
      [
        ['parse', 2],
        ['render', 1],
      ],
    )
    assert.equal(reordered.timelines[0].negativeDeltas, 1)
    assert.equal(reordered.timelines[0].reorderedSamples, 2)
    assert.equal(reordered.timelines[0].duplicateTimestamps, 1)
    assert.equal(reordered.timelines[0].phaseAttribution, 'unavailable')
    for (const deltas of [[-1000, 2000], [1000], [1000, Number.NaN]]) {
      const invalid = analyzeInputTrace({ traceEvents: [] }, null, {
        ...profile,
        startTime: 10000,
        endTime: 14000,
        timeDeltas: deltas,
      }).cpu
      assert.equal(invalid.sampledMs, null)
      assert.equal(invalid.timelines[0].weightStatus, 'unavailable')
    }
    assert.equal(result.trace.unmatchedEnds, 0)
    assert.equal(result.trace.unmatchedStarts, 0)
    assert.equal(
      analyzeInputTrace({ traceEvents: [] }).tasks.distribution.maxMs,
      null,
    )
    assert.throws(() => analyzeInputTrace({}), /traceEvents/)
    console.log(
      'input trace analyzer: synthetic timing, phase pairing, missing evidence, paint correlation and CPU weights passed',
    )
    return
  }
  for (let index = 0; index < args.length; index += 2) {
    if (
      !['--trace', '--metrics', '--profile', '--out'].includes(args[index]) ||
      !args[index + 1]
    )
      throw new Error(
        'Usage: node scripts/analyze-input-trace.mjs --trace trace.json [--metrics result.json] [--profile file.cpuprofile] --out report-prefix',
      )
    options[args[index].slice(2)] = args[index + 1]
  }
  if (!options.trace || !options.out)
    throw new Error('--trace and --out are required.')
  const load = async (path) =>
    path ? JSON.parse(await readFile(path, 'utf8')) : null
  const summary = analyzeInputTrace(
    await load(options.trace),
    await load(options.metrics),
    await load(options.profile),
  )
  summary.files = {
    trace: resolve(options.trace),
    metrics: options.metrics ? resolve(options.metrics) : null,
    profile: options.profile ? resolve(options.profile) : null,
  }
  await writeFile(
    `${options.out}.json`,
    `${JSON.stringify(summary, null, 2)}\n`,
  )
  await writeFile(`${options.out}.md`, report(summary))
  console.log(
    `${options.out}.md — compact evidence report\n${options.out}.json — distributions, task overlaps, CPU samples and outside-timed context`,
  )
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main()
