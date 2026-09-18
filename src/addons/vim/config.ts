import { type Expression, parse } from 'luaparse'

export type VimMapping = {
  mode: 'normal' | 'insert' | 'visual' | 'operatorPending'
  lhs: string
  rhs: string
  recursive: boolean
}
export type VimConfig = {
  path: string | null
  mappings: VimMapping[]
  skipped: { line: number; reason: string }[]
}

const modes = {
  n: ['normal'],
  i: ['insert'],
  v: ['visual'],
  x: ['visual'],
  o: ['operatorPending'],
  '': ['normal', 'visual', 'operatorPending'],
} as const
const specialKeys: Record<string, string> = {
  esc: 'Esc',
  escape: 'Esc',
  cr: 'CR',
  return: 'CR',
  enter: 'CR',
  space: 'Space',
  tab: 'Tab',
  bs: 'BS',
  backspace: 'BS',
  del: 'Del',
  delete: 'Del',
  insert: 'Ins',
  ins: 'Ins',
  left: 'Left',
  right: 'Right',
  up: 'Up',
  down: 'Down',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
}

// Decode string literals only. Config code is never evaluated.
function literal(raw: string) {
  const long = raw.match(/^\[(=*)\[([\s\S]*)\]\1\]$/)
  if (long) return long[2]?.replace(/^\r?\n/, '')
  if (!/^(['"])[\s\S]*\1$/.test(raw)) return undefined
  let valid = true
  const escapes: Record<string, string> = {
    a: '\x07',
    b: '\b',
    f: '\f',
    n: '\n',
    r: '\r',
    t: '\t',
    v: '\v',
    '\\': '\\',
    '"': '"',
    "'": "'",
    '\n': '\n',
  }
  const value = raw
    .slice(1, -1)
    .replace(
      /\\(z\s*|x[\da-fA-F]{2}|\d{1,3}|\r?\n|.)/g,
      (_, sequence: string) => {
        if (sequence.startsWith('z')) return ''
        if (/^(x[\da-fA-F]{2}|\d{1,3})$/.test(sequence)) {
          const code = sequence.startsWith('x')
            ? Number.parseInt(sequence.slice(1), 16)
            : Number(sequence)
          if (code < 128) return String.fromCharCode(code)
        } else if (sequence in escapes) return escapes[sequence] ?? ''
        valid = false
        return ''
      },
    )
  return valid ? value : undefined
}

export function parseVimConfig(
  source: string,
  lua: boolean,
): Omit<VimConfig, 'path'> {
  const result: Omit<VimConfig, 'path'> = { mappings: [], skipped: [] }
  let leader: string | undefined = '\\'
  let localLeader: string | undefined = '\\'
  const skip = (line: number, reason: string) => {
    if (
      !result.skipped.some(
        (entry) => entry.line === line && entry.reason === reason,
      )
    )
      result.skipped.push({ line, reason })
  }
  const keys = (value: string) => {
    if (
      (/<leader>/i.test(value) && leader === undefined) ||
      (/<localleader>/i.test(value) && localLeader === undefined)
    )
      return undefined
    return value
      .replace(/<leader>/gi, () => leader ?? '')
      .replace(/<localleader>/gi, () => localLeader ?? '')
      .replace(/ /g, '<Space>')
      .replaceAll('\x1b', '<Esc>')
      .replace(/\r?\n/g, '<CR>')
      .replace(/\t/g, '<Tab>')
      .replace(/<([^<>]+)>/g, (token, key: string) => {
        if (key.toLowerCase() === 'lt') return '<'
        if (key.toLowerCase() === 'bar') return '|'
        if (key.toLowerCase() === 'bslash') return '\\'
        const canonical = Object.hasOwn(specialKeys, key.toLowerCase())
          ? specialKeys[key.toLowerCase()]
          : undefined
        if (canonical) return `<${canonical}>`
        if (/^f\d+$/i.test(key)) return `<${key.toUpperCase()}>`
        const modified = key.match(/^((?:[csam]-)+)(.+)$/i)
        if (!modified) return token
        const suffix = modified[2] ?? ''
        const special = Object.hasOwn(specialKeys, suffix.toLowerCase())
          ? specialKeys[suffix.toLowerCase()]
          : undefined
        return `<${modified[1]?.toUpperCase()}${special ?? (suffix.length === 1 ? suffix.toLowerCase() : suffix)}>`
      })
  }
  const add = (
    mode: string,
    lhs: string,
    rhs: string,
    recursive: boolean,
    line: number,
  ) => {
    const contexts = Object.hasOwn(modes, mode)
      ? modes[mode as keyof typeof modes]
      : undefined
    const left = keys(lhs)
    let right = keys(rhs)
    if (
      !contexts ||
      !left ||
      right === undefined ||
      left.length > 100 ||
      right.length > 4000 ||
      /<(?:plug|sid|snr|expr)>/i.test(lhs + rhs) ||
      (left.startsWith(':') && left !== ':')
    ) {
      skip(line, 'Unsupported mode or key sequence.')
      return
    }
    if (/<cmd>/i.test(right)) {
      if (mode !== 'n') {
        skip(line, 'Command mappings are supported in normal mode.')
        return
      }
      right = right.replace(/<cmd>/gi, ':')
    }
    if (
      /:(?:lua|call|exec\w*|source|!|terminal|termopen)\b/i.test(right) ||
      /<C-r>=/i.test(right)
    ) {
      skip(line, 'This mapping needs Vimscript, Lua, or an external command.')
      return
    }
    // Plugin Ex commands cannot be supplied by importing a key binding.
    const command = right
      .replace(/<Space>/g, ' ')
      .match(/^(?:<Esc>)?:(?:<C-u>)?[\s%'<>,.$\d+-]*([a-zA-Z]+)/)?.[1]
    if (
      command &&
      ![
        'write',
        'quit',
        'wq',
        'writequit',
        'xit',
        'edit',
        'enew',
        'substitute',
        'nohlsearch',
        'sort',
        'undo',
        'redo',
        'delete',
        'yank',
        'move',
        'copy',
        'join',
      ].some((name) => name.startsWith(command))
    ) {
      skip(line, 'This command is not available in Hibi.')
      return
    }
    for (const context of contexts) {
      const previous = result.mappings.findIndex(
        (mapping) => mapping.mode === context && mapping.lhs === left,
      )
      if (previous >= 0) result.mappings.splice(previous, 1)
      result.mappings.push({
        mode: context,
        lhs: left,
        rhs: /^<nop>$/i.test(right) ? '' : right,
        recursive,
      })
    }
  }
  if (!lua) {
    let block = 0
    let heredoc: string | undefined
    const lines = source.replace(/^\uFEFF/, '').split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i]!.trimStart().replace(/^:/, '')
      if (heredoc) {
        if (line.trim() === heredoc) heredoc = undefined
        continue
      }
      const marker = line.match(
        /^(?:lua|python3?|perl|ruby)\s*<<\s*(\w+)\s*$/,
      )?.[1]
      if (marker) {
        heredoc = marker
        continue
      }
      while (/^\s*\\/.test(lines[i + 1] ?? ''))
        line += lines[++i]!.replace(/^\s*\\/, '')
      if (
        /^(?:endif|endfor|endwhile|endf\w*|endtry|augroup\s+END)\b/i.test(line)
      ) {
        block = Math.max(0, block - 1)
        continue
      }
      if (/^(?:if|for|while|fu\w*!?|try|augroup)(?:\s|$)/i.test(line)) {
        block++
        continue
      }
      const mapping = line.match(/^([a-z]?)(noremap|map)(!?)\s+(.+)$/)
      const assignment = line.match(
        /^let\s+(?:g:)?(mapleader|maplocalleader)\s*=\s*(.*)$/,
      )
      if (block) {
        if (mapping)
          skip(i + 1, 'Conditional and function-local mappings are skipped.')
        continue
      }
      if (assignment) {
        const raw = assignment[2]!
        const quoted = raw.match(/^("(?:\\.|[^"\\])*")\s*(?:".*)?$/)?.[1]
        const value = raw.startsWith("'")
          ? raw
              .match(/^'((?:''|[^'])*)'\s*(?:".*)?$/)?.[1]
              ?.replaceAll("''", "'")
          : quoted
            ? literal(quoted.replace(/\\</g, '<'))
            : undefined
        if (assignment[1] === 'mapleader') leader = value
        else localLeader = value
      }
      if (!mapping) continue
      let body = mapping[4]!
      let unsupported = !!mapping[3]
      body = body.replace(
        /^(?:<(?:buffer|silent|nowait|unique|special|script|expr)>[ \t]+)+/i,
        (flags) => {
          if (/<(?!silent>|nowait>|unique>|special>)\w+>/i.test(flags))
            unsupported = true
          return ''
        },
      )
      const parts = body.match(/^(\S+)[ \t]+([\s\S]*)$/)
      if (!parts || unsupported || /(^|[^\\])\|/.test(body)) {
        skip(i + 1, 'Unsupported mapping options or command chain.')
        continue
      }
      add(
        mapping[1]!,
        parts[1]!,
        parts[2]!.replace(/\\ /g, '<Space>').replace(/\\\|/g, '|'),
        mapping[2] === 'map',
        i + 1,
      )
    }
    return result
  }

  const ast = parse(source, {
    luaVersion: 'LuaJIT',
    locations: true,
    comments: false,
  })
  const values = new Map<string, Expression>()
  const name = (node: Expression): string =>
    node.type === 'Identifier'
      ? node.name
      : node.type === 'MemberExpression' && node.indexer === '.'
        ? `${name(node.base)}.${node.identifier.name}`
        : ''
  const resolve = (node: Expression | undefined): Expression | undefined =>
    node?.type === 'Identifier' ? (values.get(node.name) ?? node) : node
  const string = (node: Expression | undefined) => {
    const value = resolve(node)
    return value?.type === 'StringLiteral' ? literal(value.raw) : undefined
  }
  for (const statement of ast.body) {
    const line = statement.loc?.start.line ?? 1
    if (
      statement.type === 'LocalStatement' ||
      statement.type === 'AssignmentStatement'
    ) {
      statement.variables.forEach((variable, index) => {
        const value = resolve(statement.init[index])
        const key = name(variable)
        if (key === 'vim.g.mapleader') leader = string(value)
        else if (key === 'vim.g.maplocalleader') localLeader = string(value)
        else if (variable.type === 'Identifier') {
          if (value) values.set(key, value)
          else values.delete(key)
        } else {
          let base: Expression = variable
          while (
            base.type === 'MemberExpression' ||
            base.type === 'IndexExpression'
          )
            base = base.base
          const root = name(base)
          const previous = values.get(root)
          for (const [alias, entry] of values)
            if (alias === root || entry === previous) values.delete(alias)
        }
      })
      continue
    }
    if (
      statement.type !== 'CallStatement' ||
      statement.expression.type !== 'CallExpression'
    ) {
      if (statement.type !== 'ReturnStatement')
        skip(line, 'Mappings inside control flow or functions are skipped.')
      continue
    }
    const call = statement.expression
    const method = name(resolve(call.base)!)
    if (!['vim.keymap.set', 'vim.api.nvim_set_keymap'].includes(method))
      continue
    const [modeNode, lhsNode, rhsNode, optionsNode] = call.arguments
    const modeValue = resolve(modeNode)
    const modeNames =
      modeValue?.type === 'TableConstructorExpression'
        ? modeValue.fields.map((field) =>
            field.type === 'TableValue' ? string(field.value) : undefined,
          )
        : [string(modeNode)]
    const lhs = string(lhsNode),
      rhs = string(rhsNode)
    const options = resolve(optionsNode)
    let recursive = method === 'vim.api.nvim_set_keymap'
    let unsupported =
      call.arguments.length > 4 ||
      (!!optionsNode && options?.type !== 'TableConstructorExpression')
    if (options?.type === 'TableConstructorExpression')
      for (const field of options.fields) {
        if (field.type !== 'TableKeyString') {
          unsupported = true
          continue
        }
        const key = field.key.name
        const value = resolve(field.value)
        if (
          ['silent', 'nowait', 'unique', 'desc', 'replace_keycodes'].includes(
            key,
          )
        )
          continue
        if (
          ['remap', 'noremap'].includes(key) &&
          value?.type === 'BooleanLiteral'
        )
          recursive = key === 'remap' ? value.value : !value.value
        else if (
          ['expr', 'buffer'].includes(key) &&
          value?.type === 'BooleanLiteral' &&
          !value.value
        )
          continue
        else unsupported = true
      }
    if (
      unsupported ||
      lhs === undefined ||
      rhs === undefined ||
      modeNames.some((mode) => mode === undefined)
    ) {
      skip(
        line,
        'Only literal key mappings without expressions, buffers, or callbacks are supported.',
      )
      continue
    }
    for (const mode of modeNames) add(mode!, lhs, rhs, recursive, line)
  }
  return result
}
