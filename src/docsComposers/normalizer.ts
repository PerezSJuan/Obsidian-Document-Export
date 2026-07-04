import { type NormalizedNote, type NoteMapEntry } from '../types.js'

export interface NormalizeOptions {
  wikilinkMode: string
  tagMode: string
  noteNameMode: string
}

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|bmp|svg|webp)$/i

export function resolveEmbeds(
  content: string,
  noteMap: Map<string, NoteMapEntry>,
  wikilinkMode: string,
  notePath?: string,
  seen?: Set<string>,
): string {
  if (wikilinkMode === 'raw') return content

  const { protected: blocks, result: blocked } = protectCodeBlocks(content)

  const NON_IMAGE_EXT_RE = /\.(mp3|mp4|webm|ogg|mov|avi|wav|flac|m4a|pdf|epub|mobi)$/i

  const resolved = blocked.replace(
    /!\[\[([^|[\]]+)(?:\|([^[\]]+))?\]\]/g,
    (match, target: string, alt?: string) => {
      const cleanTarget = target.trim()
      const altText = alt ?? cleanTarget

      if (wikilinkMode === 'strip') return ''

      if (IMAGE_EXT_RE.test(cleanTarget)) {
        let href = cleanTarget
        if (notePath) {
          const noteDir = notePath.includes('/') ? notePath.slice(0, notePath.lastIndexOf('/')) : ''
          if (noteDir) {
            href = resolveRelativePath(href, noteDir)
          }
        }
        return `![${altText}](${href.replace(/ /g, '%20')})`
      }

      if (/\.pdf$/i.test(cleanTarget)) {
        let href = cleanTarget
        if (notePath) {
          const noteDir = notePath.includes('/') ? notePath.slice(0, notePath.lastIndexOf('/')) : ''
          if (noteDir) {
            href = resolveRelativePath(href, noteDir)
          }
        }
        return `![[${href}]]`
      }

      if (NON_IMAGE_EXT_RE.test(cleanTarget)) {
        return `[${altText}](${cleanTarget.replace(/ /g, '%20')})`
      }

      const hashIdx = cleanTarget.indexOf('#')
      const baseName = hashIdx >= 0 ? cleanTarget.slice(0, hashIdx) : cleanTarget
      const fragment = hashIdx >= 0 ? cleanTarget.slice(hashIdx + 1) : ''
      const entry = noteMap.get(baseName) ?? noteMap.get(cleanTarget)
      if (entry) {
        if (seen?.has(baseName)) return ''
        const nextSeen = new Set(seen)
        nextSeen.add(baseName)

        if (fragment) {
          if (fragment.startsWith('^')) {
            const blockId = fragment.slice(1)
            const blockContent = extractBlockContent(entry.rawContent, blockId)
            if (blockContent) {
              return `<footnote id="${blockId}">${blockContent}</footnote>`
            }
            return match
          }
          const sectionContent = extractHeadingSection(entry.content, fragment)
          return sectionContent || match
        }

        return resolveEmbeds(entry.content, noteMap, wikilinkMode, entry.path, nextSeen)
      }

      // Note not in export - remove the embed entirely
      return ''
    },
  )

  return restoreCodeBlocks(resolved, blocks)
}

function extractHeadingSection(content: string, headingName: string): string {
  const lines = content.split('\n')
  let startIdx = -1
  let headingLevel = 0

  const targetLower = headingName.toLowerCase()

  const headingsFound: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const headingMatch = lines[i]!.match(/^(#{1,6})\s+(.+)/)
    if (headingMatch) {
      const rawText = headingMatch[2]!.trim()
      const text = rawText
        .replace(/\s*\{:[^}]+\}\s*$/, '')
        .replace(/\s*<!--[\s\S]*?-->\s*$/, '')
      headingsFound.push(`[${headingMatch[1]!.length}] "${rawText}" → "${text}"`)
      if (text.toLowerCase() === targetLower) {
        startIdx = i
        headingLevel = headingMatch[1]!.length
        break
      }
    }
  }

  if (startIdx === -1) return ''

  for (let i = startIdx + 1; i < lines.length; i++) {
    const headingMatch = lines[i]!.match(/^(#{1,6})\s+/)
    if (headingMatch && headingMatch[1]!.length <= headingLevel) {
      return lines.slice(startIdx, i).join('\n').trimEnd()
    }
  }

  return lines.slice(startIdx).join('\n').trimEnd()
}

function extractBlockContent(rawContent: string, blockId: string): string {
  const lines = rawContent.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i]!.match(/^(.*?)\s+\^([\w-]+)\s*$/)
    if (match && match[2] === blockId) {
      return match[1]!
    }
  }
  return ''
}

export function normalizeNote(
  rawContent: string,
  path: string,
  options?: NormalizeOptions,
): NormalizedNote {
  const { frontmatter, body } = parseFrontmatter(rawContent)
  const title = resolveTitle(frontmatter, path)
  let content = body

  const { protected: protectedBlocks, result: blockedContent } = protectCodeBlocks(content)
  content = blockedContent
  content = removeObsidianComments(content)
  content = convertHighlights(content)

  const { protected: mathBlocks, result: mathProtected } = protectMathBlocks(content)
  content = mathProtected
  content = convertBlockRefs(content)
  content = convertSubscript(content)
  content = convertSuperscript(content)
  content = restoreMathBlocks(content, mathBlocks)
  content = convertWikilinks(content, options?.wikilinkMode)
  content = convertTags(content, options?.tagMode)
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
    (acc, { placeholder, original }) => acc.replace(placeholder, () => original),
    content,
  )
}

export function parseFrontmatter(
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

export function resolveTitle(
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

function protectMathBlocks(content: string): { protected: ProtectedBlock[]; result: string } {
  const blocks: ProtectedBlock[] = []
  let counter = 0
  const result = content
    .replace(/\$\$[\s\S]*?\$\$/g, (match) => {
      const placeholder = `\x00MATHBLOCK${counter}\x00`
      blocks.push({ placeholder, original: match })
      counter++
      return placeholder
    })
    .replace(/(?<!\$)\$(?!\$)[^\n]*?\$(?!\$)/g, (match) => {
      const placeholder = `\x00MATHBLOCK${counter}\x00`
      blocks.push({ placeholder, original: match })
      counter++
      return placeholder
    })
  return { protected: blocks, result }
}

function restoreMathBlocks(content: string, blocks: ProtectedBlock[]): string {
  return blocks.reduce(
    (acc, { placeholder, original }) => acc.replace(placeholder, () => original),
    content,
  )
}

function convertSubscript(content: string): string {
  return content.replace(/(?<![~])~([^~\n]+)~(?!~)/g, '<sub>$1</sub>')
}

function convertSuperscript(content: string): string {
  return content.replace(/\^([^^\n]+)\^/g, '<sup>$1</sup>')
}

function convertBlockRefs(content: string): string {
  const blockMap = new Map<string, string>()

  const lines = content.split('\n')
  const result: string[] = []

  for (const line of lines) {
    const anchorMatch = line.match(/^(.*?)\s+\^([\w-]+)\s*$/)
    if (anchorMatch) {
      blockMap.set(anchorMatch[2]!, anchorMatch[1]!)
      result.push(`<blocklabel id="${anchorMatch[2]!}"></blocklabel>${anchorMatch[1]!}`)
    } else {
      const standaloneMatch = line.match(/^\s*\^([\w-]+)\s*$/)
      if (standaloneMatch) {
        blockMap.set(standaloneMatch[1]!, '')
      } else {
        result.push(line)
      }
    }
  }

  content = result.join('\n')

  content = content.replace(
    /\[\[#\^([\w-]+)(?:\|([^[\]]+))?\]\]/g,
    (_match: string, id: string, display?: string): string => {
      const block = blockMap.get(id)
      if (block !== undefined) {
        return `<footnote id="${id}">${block}</footnote>`
      }
      return display ?? `#^${id}`
    },
  )

  return content
}

function convertWikilinks(content: string, mode = 'resolve'): string {
  if (mode === 'strip') {
    return content.replace(/(?<!!)\[\[([^|[\]]+)(?:\|([^[\]]+))?\]\]/g, '')
  }
  if (mode === 'raw') {
    return content
  }
  return content.replace(
    /(?<!!)\[\[([^|[\]]+)(?:\|([^[\]]+))?\]\]/g,
    (_match, link: string, display?: string) => {
      const href = link.includes('#') ? link.split('#')[0]! : link
      const text = display ?? link
      return `[${text}](${href.replace(/ /g, '%20')})`
    },
  )
}

export function convertTags(content: string, mode = 'text'): string {
  const links: Array<{ placeholder: string; original: string }> = []
  let counter = 0
  content = content.replace(/\[[^\]]*\]\([^)]*\)/g, (match) => {
    const ph = `\x00LINK${counter}\x00`
    links.push({ placeholder: ph, original: match })
    counter++
    return ph
  })
  content = content.replace(/!\[\[[^\]]+\]\]/g, (match) => {
    const ph = `\x00EMBED${counter}\x00`
    links.push({ placeholder: ph, original: match })
    counter++
    return ph
  })
  content = content.replace(/\[\[[^\]]+\]\]/g, (match) => {
    const ph = `\x00WIKI${counter}\x00`
    links.push({ placeholder: ph, original: match })
    counter++
    return ph
  })

  if (mode === 'strip') {
    content = content.replace(/#[\w/:-]+/g, '')
  } else if (mode === 'bold') {
    content = content.replace(/#[\w/:-]+/g, (match) => `**${match.slice(1)}**`)
  } else {
    content = content.replace(/#[\w/:-]+/g, (match) => match.slice(1))
  }

  for (const { placeholder, original } of links) {
    content = content.replace(placeholder, () => original)
  }
  return content
}

function resolveRelativePath(relativePath: string, noteDir: string): string {
  let path = relativePath
  if (path.startsWith('./')) path = path.slice(2)
  let dir = noteDir
  while (path.startsWith('../')) {
    path = path.slice(3)
    const idx = dir.lastIndexOf('/', dir.length - 2)
    dir = idx >= 0 ? dir.slice(0, idx) : ''
  }
  return dir ? `${dir}/${path}` : path
}

function isAbsoluteOrUrl(url: string): boolean {
  return /^(https?|virtual|data):/i.test(url) || url.startsWith('/')
}

export function resolveImagePaths(content: string, notePath: string): string {
  const { protected: blocks, result: blocked } = protectCodeBlocks(content)

  const noteDir = notePath.includes('/') ? notePath.slice(0, notePath.lastIndexOf('/')) : ''

  const resolved = blocked.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (_match, alt: string, url: string) => {
      const cleanUrl = url.split(/\s+/)[0]!
      if (isAbsoluteOrUrl(cleanUrl)) return _match
      const resolvedPath = resolveRelativePath(cleanUrl, noteDir)
      return `![${alt}](${resolvedPath})`
    },
  )

  return restoreCodeBlocks(resolved, blocks)
}


