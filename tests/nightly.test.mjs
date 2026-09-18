import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { parse } from 'yaml'
import {
  classifyRelease,
  nightly,
  platforms,
  recommendedNightly,
  releaseNotes,
} from '../scripts/nightly.mjs'

test('nightlies build unchanged revisions daily and include real commits since the previous release', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'hibi-nightly-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const git = (...args) =>
    execFileSync('git', args, { cwd, stdio: 'pipe' }).toString().trim()
  git('init')
  git('config', 'user.name', 'Nightly test')
  git('config', 'user.email', 'nightly@example.invalid')
  writeFileSync(join(cwd, 'package.json'), '{"version":"0.1.0"}')
  git('add', 'package.json')
  git('commit', '-m', 'Initial app')
  const date = new Date('2026-09-17T18:00:00Z')
  const first = nightly(cwd, date)
  assert.equal(first.channel, 'nightly')
  assert.match(first.commits, /Initial app/)
  git('tag', first.tag)
  const tomorrow = nightly(cwd, new Date('2026-09-18T18:00:00Z'))
  assert.equal(tomorrow.sha, first.sha)
  assert.notEqual(tomorrow.tag, first.tag)
  assert.notEqual(
    nightly(cwd, date, '', '12.1').tag,
    nightly(cwd, date, '', '12.2').tag,
  )
  git('commit', '--allow-empty', '-m', 'Fix [editor] *cursor*')
  const next = nightly(cwd, date)
  assert.equal(next.previous, first.tag)
  assert.notEqual(next.tag, first.tag)
  assert.match(next.version, /^0\.1\.0-nightly\.20260917\.g[0-9a-f]{7}$/)
  const names = [
    'win-x64.exe',
    'mac-x64.dmg',
    'mac-arm64.dmg',
    'mac-x64.zip',
    'mac-arm64.zip',
    'linux-x86_64.AppImage',
  ].map((suffix) => `hibi-${next.version}-${suffix}`)
  const checksums = names
    .map((name, index) => `${String(index).repeat(64)}  ./${name}`)
    .join('\n')
  const reports = platforms.map((platform) => ({
    platform,
    sha: next.sha,
    build: 'success',
    package: 'success',
    checks: 'success',
  }))
  const green = classifyRelease(next, reports)
  const notes = releaseNotes(green, 'hibigarden/hibi', checksums)
  assert.match(notes, /\*\*nightly-green\*\*/)
  assert.equal(recommendedNightly(green, 'hibigarden/hibi').tag, next.tag)
  const failed = reports.map((report, index) => ({
    ...report,
    checks: index === 0 ? 'failure' : 'success',
  }))
  const broken = classifyRelease(next, failed)
  assert.match(broken.tag, /^nightly-broken-/)
  assert.match(
    releaseNotes(broken, 'hibigarden/hibi', checksums),
    /Required checks failed/,
  )
  assert.throws(
    () => recommendedNightly(broken, 'hibigarden/hibi'),
    /Only fully checked/,
  )
  git('tag', 'nightly-green')
  assert.equal(
    nightly(cwd, date).previous,
    first.tag,
    'rolling pointer is not a changelog baseline',
  )
  git('tag', 'v0.1.0')
  const stable = nightly(cwd, date, 'v0.1.0')
  assert.equal(stable.version, '0.1.0')
  assert.equal(stable.channel, 'stable')
  assert.equal(stable.previous, undefined)
  assert.equal(classifyRelease(stable, reports).status, 'stable')
  assert.throws(
    () => classifyRelease(stable, failed),
    /Stable releases require/,
  )
  assert.throws(() => nightly(cwd, date, 'v0.2.0'), /Stable tags must match/)
  assert.ok(
    notes.startsWith(
      `this nightly was built from sha \`${next.sha.slice(0, 7)}\`.`,
    ),
  )
  assert.ok(
    notes.includes('**:warning: always back up before using a nightly!**'),
  )
  assert.match(
    notes,
    /\[windows\].+ • \[macOS \(intel\)\].+ • \[linux \(appImage\)\]/,
  )
  for (const [index, name] of names.entries()) {
    assert.ok(notes.includes(`/releases/download/${next.tag}/${name}`))
    assert.ok(notes.includes(`\`${String(index).repeat(64)}\``))
  }
  assert.equal(notes.match(/^SHA256 /gm).length, names.length)
  assert.ok(notes.includes('\n## changes\n'))
  assert.throws(
    () => releaseNotes(next, 'hibigarden/hibi', 'bad checksum'),
    /Invalid nightly checksum/,
  )
  assert.throws(
    () =>
      releaseNotes(
        next,
        'hibigarden/hibi',
        checksums.split('\n').slice(1).join('\n'),
      ),
    /Missing nightly download: windows/,
  )
  assert.match(notes, /Fix \\\[editor\\\] \\\*cursor\\\*/)
  assert.ok(notes.includes(`/commit/${next.sha}`))
  assert.ok(notes.includes(`/compare/${first.tag}...${next.sha}`))
  assert.ok(!notes.includes('Initial app'))

  // Exercise the artifact handoff and preserve the pointer after a failed run.
  const output = join(cwd, 'github-output')
  const cli = (command) =>
    execFileSync(process.execPath, [resolve('scripts/nightly.mjs'), command], {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe',
      env: {
        ...process.env,
        GITHUB_OUTPUT: output,
        GITHUB_REPOSITORY: 'hibigarden/hibi',
        GITHUB_RUN_NUMBER: '99',
        GITHUB_RUN_ATTEMPT: '1',
        STABLE_TAG: '',
      },
    })
  cli('prepare')
  const prepared = JSON.parse(readFileSync(join(cwd, 'release.json'), 'utf8'))
  assert.equal(prepared.sha, next.sha)
  assert.match(readFileSync(output, 'utf8'), /channel=nightly/)
  mkdirSync(join(cwd, 'installers'))
  for (const report of reports)
    writeFileSync(
      join(cwd, `installers/checks-${report.platform}.json`),
      JSON.stringify(report),
    )
  writeFileSync(
    join(cwd, 'installers/SHA256SUMS.txt'),
    checksums.replaceAll(next.version, prepared.version),
  )
  cli('classify')
  assert.match(cli('notes'), /\*\*nightly-green\*\*/)
  cli('recommend')
  const pointer = readFileSync(join(cwd, 'recommended-nightly.json'), 'utf8')
  assert.equal(JSON.parse(pointer).tag, prepared.tag)
  writeFileSync(join(cwd, 'release.json'), JSON.stringify(prepared))
  writeFileSync(
    join(cwd, `installers/checks-${failed[0].platform}.json`),
    JSON.stringify(failed[0]),
  )
  cli('classify')
  assert.match(cli('notes'), /Required checks failed/)
  assert.throws(() => cli('recommend'), /Only fully checked/)
  assert.equal(
    readFileSync(join(cwd, 'recommended-nightly.json'), 'utf8'),
    pointer,
  )
})

test('publication fails closed for missing packages, checks and mismatched revisions', () => {
  const release = {
    channel: 'nightly',
    sha: 'a'.repeat(40),
    tag: 'nightly-2026-09-19-aaaaaaa',
    version: '0.1.0-nightly.20260919.aaaaaaa',
  }
  const reports = platforms.map((platform) => ({
    platform,
    sha: release.sha,
    build: 'success',
    package: 'success',
    checks: 'success',
  }))
  for (const outcome of ['failure', 'cancelled', 'skipped', undefined]) {
    for (const stage of ['build', 'package'])
      assert.throws(
        () =>
          classifyRelease(
            release,
            reports.map((report, index) =>
              index ? report : { ...report, [stage]: outcome },
            ),
          ),
        /Cannot publish/,
      )
    const incomplete = reports.map((report, index) =>
      index ? report : { ...report, checks: outcome },
    )
    assert.equal(classifyRelease(release, incomplete).status, 'nightly-broken')
    assert.throws(
      () => classifyRelease({ ...release, channel: 'stable' }, incomplete),
      /Stable releases require/,
    )
    assert.throws(
      () =>
        recommendedNightly(
          { ...release, status: 'nightly-green', reports: incomplete },
          'owner/repo',
        ),
      /Only fully checked/,
    )
  }
  assert.throws(
    () => classifyRelease(release, reports.slice(1)),
    /Every release platform/,
  )
  assert.throws(
    () => classifyRelease(release, [reports[0], ...reports.slice(0, 3)]),
    /Every release platform/,
  )
  assert.throws(
    () =>
      classifyRelease(
        release,
        reports.map((report) => ({ ...report, sha: 'b'.repeat(40) })),
      ),
    /mismatched packages/,
  )
})

test('release workflow always builds nightlies and gates stable publication on the full suite', () => {
  const workflow = parse(readFileSync('.github/workflows/nightly.yml', 'utf8'))
  assert.deepEqual(workflow.on.push.tags, ['v*'])
  assert.ok(workflow.on.schedule.length)
  assert.equal(
    workflow.jobs.build.if,
    undefined,
    'unchanged revisions still build',
  )
  assert.deepEqual(workflow.jobs.publish.needs, ['prepare', 'build'])
  assert.equal(
    workflow.jobs.publish.if,
    undefined,
    'failed package jobs block all publication',
  )
  const steps = workflow.jobs.build.steps
  assert.deepEqual(
    workflow.jobs.build.strategy.matrix.include
      .map((item) => item.platform)
      .sort(),
    [...platforms].sort(),
  )
  const checks = steps.find((step) => step.id === 'checks')
  assert.equal(
    checks['continue-on-error'],
    `\${{ needs.prepare.outputs.channel == 'nightly' }}`,
  )
  assert.match(
    checks.run,
    /node --test --test-concurrency=1 tests\/\*\.test\.mjs/,
  )
  for (const command of ['lint', 'docs:check', 'copy:check'])
    assert.ok(checks.run.includes(`npm run ${command}`))
  assert.equal(steps.find((step) => step.id === 'compile').run, 'npm run build')
  assert.equal(
    steps.find((step) => step.id === 'package').if,
    undefined,
    'stable checks must succeed before packaging',
  )
  const promotion = workflow.jobs.publish.steps.find(
    (step) => step.name === 'Update recommended nightly pointer',
  )
  assert.equal(promotion.if, "steps.classify.outputs.status == 'nightly-green'")
  assert.match(promotion.run, /node scripts\/nightly.mjs recommend/)
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  assert.match(pkg.scripts.dist, /^npm run check && /)
})
