import { open } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'

async function deadline(work, milliseconds, label) {
  let timer
  try {
    return await Promise.race([
      work,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out`)),
          milliseconds,
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

/** End once, then persist the returned CDP stream without buffering the trace. */
export function createTraceFinalizer(
  session,
  path,
  {
    completionMs = 45000,
    drainMs = 90000,
    cleanupMs = 5000,
    openFile = open,
    now = () => performance.now(),
  } = {},
) {
  let result
  const collect = async () => {
    const started = now()
    let stream, file, failure, completeAt, drainAt
    let bytes = 0,
      reads = 0
    let resolveComplete
    const complete = new Promise((resolve) => {
      resolveComplete = resolve
    })
    const completed = (event) => {
      stream ??= event.stream
      resolveComplete(event)
    }
    session.on('Tracing.tracingComplete', completed)
    try {
      const [, event] = await deadline(
        Promise.all([session.send('Tracing.end'), complete]),
        completionMs,
        'trace completion',
      )
      completeAt = now()
      if (!event.stream) throw new Error('Trace stream was not returned')
      const drain = (work) => {
        const remaining = drainMs - (now() - completeAt)
        if (remaining <= 0) throw new Error('trace drain timed out')
        return deadline(work(), remaining, 'trace drain')
      }
      let abandonedOpen = false
      try {
        await drain(() =>
          Promise.resolve()
            .then(() => openFile(path, 'wx'))
            .then((opened) => {
              if (!abandonedOpen) file = opened
              else {
                // The deadline has already been reported. A late handle still
                // needs closing, without replacing that error or writing data.
                void deadline(
                  Promise.resolve().then(() => opened.close()),
                  cleanupMs,
                  'late trace file close',
                ).catch(() => {})
              }
            }),
        )
      } catch (error) {
        abandonedOpen = true
        throw error
      }
      for (;;) {
        const chunk = await drain(() =>
          session.send('IO.read', {
            handle: stream,
            size: 1024 * 1024,
          }),
        )
        reads++
        const data = Buffer.from(
          chunk.data,
          chunk.base64Encoded ? 'base64' : 'utf8',
        )
        if (data.length) await drain(() => file.writeFile(data))
        bytes += data.length
        if (chunk.eof) break
      }
      drainAt = now()
    } catch (error) {
      failure = error
    }
    // Remove even an unresolved completion listener. The caller's CDP/app
    // teardown abandons browser-side work if no stream arrived before timeout.
    session.off('Tracing.tracingComplete', completed)
    const cleanupAt = now()
    const cleanup = await Promise.allSettled([
      ...(file
        ? [
            deadline(
              Promise.resolve().then(() => file.close()),
              cleanupMs,
              'trace file close',
            ),
          ]
        : []),
      ...(stream
        ? [
            deadline(
              Promise.resolve().then(() =>
                session.send('IO.close', { handle: stream }),
              ),
              cleanupMs,
              'trace stream close',
            ),
          ]
        : []),
    ])
    for (const entry of cleanup)
      if (entry.status === 'rejected') failure ??= entry.reason
    if (failure) throw failure
    return {
      bytes,
      reads,
      completionMs: completeAt - started,
      drainMs: drainAt - completeAt,
      cleanupMs: now() - cleanupAt,
      totalMs: now() - started,
    }
  }
  return function finish() {
    result ??= Promise.resolve().then(collect)
    return result
  }
}
