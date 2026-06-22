export interface HighlightToken {
  text: string
  type: 'keyword' | 'string' | 'comment' | 'number' | 'builtin' | 'plain'
}

const KEYWORDS = new Set([
  'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
  'default', 'delete', 'do', 'else', 'enum', 'export', 'extends', 'false', 'finally',
  'for', 'function', 'if', 'import', 'in', 'instanceof', 'let', 'new', 'null',
  'of', 'return', 'static', 'super', 'switch', 'this', 'throw', 'true', 'try',
  'typeof', 'undefined', 'var', 'void', 'while', 'with', 'yield',
  'def', 'return', 'class', 'if', 'elif', 'else', 'for', 'while', 'try', 'except',
  'finally', 'with', 'as', 'import', 'from', 'pass', 'break', 'continue', 'and',
  'or', 'not', 'is', 'in', 'lambda', 'raise', 'global', 'nonlocal', 'assert',
  'del', 'yield', 'async', 'await',
  'int', 'float', 'str', 'bool', 'list', 'dict', 'set', 'tuple', 'None', 'True', 'False',
  'namespace', 'using', 'struct', 'interface', 'override', 'virtual', 'public',
  'private', 'protected', 'internal', 'readonly', 'sealed', 'abstract',
  'package', 'include', 'define', 'typedef', 'template', 'typename',
  'pub', 'fn', 'let', 'mut', 'impl', 'trait', 'self', 'super',
  'go', 'package', 'func', 'chan', 'select', 'defer', 'goroutine', 'map',
])

const COMMON_BUILTINS = new Set([
  'console', 'document', 'window', 'Math', 'JSON', 'Array', 'Object', 'String',
  'Number', 'Boolean', 'Date', 'RegExp', 'Map', 'Set', 'Promise', 'Error',
  'process', 'require', 'module', 'exports', '__dirname', '__filename',
  'print', 'range', 'len', 'append', 'make', 'new', 'cap', 'copy', 'close',
  'printf', 'println', 'fmt', 'len', 'string',
])

export function highlightCode(code: string, lang?: string): HighlightToken[] {
  const tokens: HighlightToken[] = []
  let i = 0

  while (i < code.length) {
    if (code[i] === '\n') {
      tokens.push({ text: '\n', type: 'plain' })
      i++
      continue
    }

    const nextLine = code.indexOf('\n', i)
    const lineEnd = nextLine === -1 ? code.length : nextLine
    const ch = code[i]!

    if (ch === '/' && code[i + 1] === '/') {
      tokens.push({ text: code.slice(i, lineEnd), type: 'comment' })
      i = lineEnd
      continue
    }

    if (ch === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2)
      const sliceEnd = end === -1 ? code.length : end + 2
      tokens.push({ text: code.slice(i, sliceEnd), type: 'comment' })
      i = sliceEnd
      continue
    }

    if (ch === '#') {
      tokens.push({ text: code.slice(i, lineEnd), type: 'comment' })
      i = lineEnd
      continue
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch
      let end = i + 1
      while (end < code.length) {
        if (code[end] === '\\') { end += 2; continue }
        if (code[end] === quote) { end++; break }
        end++
      }
      tokens.push({ text: code.slice(i, end), type: 'string' })
      i = end
      continue
    }

    if (/\d/.test(ch)) {
      let end = i
      while (end < code.length && /[\d.]/.test(code[end]!)) end++
      if (end < code.length && /[xX]/.test(code[end]!) && end > i && code[end - 1] === '0') end++
      while (end < code.length && /[\da-fA-F]/.test(code[end]!)) end++
      tokens.push({ text: code.slice(i, end), type: 'number' })
      i = end
      continue
    }

    if (/[a-zA-Z_]/.test(ch)) {
      let end = i
      while (end < code.length && /\w/.test(code[end]!)) end++
      const word = code.slice(i, end)
      if (KEYWORDS.has(word)) {
        tokens.push({ text: word, type: 'keyword' })
      } else if (COMMON_BUILTINS.has(word)) {
        tokens.push({ text: word, type: 'builtin' })
      } else {
        tokens.push({ text: word, type: 'plain' })
      }
      i = end
      continue
    }

    tokens.push({ text: code[i]!, type: 'plain' })
    i++
  }

  return tokens
}
