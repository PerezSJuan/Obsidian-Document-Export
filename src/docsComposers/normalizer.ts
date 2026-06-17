import { type NormalizedNote } from '../types.js'

export function normalizeNote(
  rawContent: string,
  path: string,
): NormalizedNote {
  const { frontmatter, body } = parseFrontmatter(rawContent)
  const title = resolveTitle(frontmatter, path)
  let content = body

  const { protected: protectedBlocks, result: blockedContent } = protectCodeBlocks(content)
  content = blockedContent
  content = removeObsidianComments(content)
  content = convertHighlights(content)
  content = convertWikilinks(content)
  content = convertImageEmbeds(content)
  content = simplifyCallouts(content)
  content = restoreCodeBlocks(content, protectedBlocks)

  return { path, title, content, frontmatter }
}

interface ProtectedBlock {
  placeholder: string
  original: string
}

function protectCodeBlocks(content: string): { protected: ProtectedBlock[]; result: string } {
  const protectedBlocks: ProtectedBlock[] = []
  let counter = 0

  const result = content.replace(
    /(`{3,})[\s\S]*?\1/g,
    (match) => {
      const placeholder = `\x00CODEBLOCK${counter}\x00`
      protectedBlocks.push({ placeholder, original: match })
      counter++
      return placeholder
    },
  ).replace(
    /`[^`]*`/g,
    (match) => {
      const placeholder = `\x00CODEBLOCK${counter}\x00`
      protectedBlocks.push({ placeholder, original: match })
      counter++
      return placeholder
    },
  )

  return { protected: protectedBlocks, result }
}

function restoreCodeBlocks(content: string, blocks: ProtectedBlock[]): string {
  return blocks.reduce(
    (acc, { placeholder, original }) => acc.replace(placeholder, original),
    content,
  )
}

function parseFrontmatter(
  raw: string,
): { frontmatter: Record<string, unknown>; body: string } {
  if (!raw.startsWith('---')) {
    return { frontmatter: {}, body: raw }
  }

  const endIndex = raw.indexOf('---', 3)
  if (endIndex === -1) {
    return { frontmatter: {}, body: raw }
  }

  const yamlBlock = raw.slice(3, endIndex).trim()
  const body = raw.slice(endIndex + 3).trimStart()
  const frontmatter = parseYaml(yamlBlock)

  return { frontmatter, body }
}

function parseYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const line of yaml.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const sepIndex = trimmed.indexOf(':')
    if (sepIndex === -1) continue

    const key = trimmed.slice(0, sepIndex).trim()
    let value: unknown = trimmed.slice(sepIndex + 1).trim()

    if (typeof value === 'string') {
      if (value === 'true') value = true
      else if (value === 'false') value = false
      else if (/^\d+$/.test(value)) value = Number(value)
      else if (
        value.startsWith("'") && value.endsWith("'") ||
        value.startsWith('"') && value.endsWith('"')
      ) {
        value = value.slice(1, -1)
      }
    }

    result[key] = value
  }

  return result
}

function resolveTitle(
  frontmatter: Record<string, unknown>,
  path: string,
): string {
  const title = frontmatter['title']
  if (typeof title === 'string' && title.length > 0) return title

  const segments = path.replace(/\\/g, '/').split('/').filter(Boolean)
  const last = segments[segments.length - 1]
  if (!last) return path
  return last.replace(/\.md$/i, '')
}

function removeObsidianComments(content: string): string {
  content = content.replace(/\n?%%[\s\S]*?%%(\n|$)/g, (match) => {
    if (match.startsWith('\n')) return '\n'
    return ''
  })
  content = content.replace(/%%[^%]*?%%/g, '')
  return content
}

function convertHighlights(content: string): string {
  return content.replace(/==([^=]+)==/g, '<mark>$1</mark>')
}

function convertWikilinks(content: string): string {
  return content.replace(
    /\[\[([^|[\]]+)(?:\|([^[\]]+))?\]\]/g,
    (_match, link: string, display?: string) => {
      const href = link.includes('#') ? link.split('#')[0]! : link
      const text = display ?? link
      return `[${text}](${href})`
    },
  )
}

function convertImageEmbeds(content: string): string {
  return content.replace(
    /!\[\[([^|[\]]+)(?:\|([^[\]]+))?\]\]/g,
    (_match, file: string, alt?: string) => {
      const altText = alt ?? file
      return `![${altText}](${file})`
    },
  )
}

function simplifyCallouts(content: string): string {
  return content.replace(/^>\s*\[!(\w+)\][ \t]*(.*)$/gm, (_match, _type: string, rest: string) => {
    const prefix = rest.trim() ? `**${rest.trim()}** ` : ''
    return `> ${prefix}`
  })
}
