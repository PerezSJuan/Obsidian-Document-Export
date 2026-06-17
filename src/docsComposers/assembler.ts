import { type NormalizedNote, type ExportConfig } from '../types.js'

export function assemble(
  notes: NormalizedNote[],
  config: ExportConfig,
): string {
  const frontmatter = buildFrontmatter(config)
  const body = buildBody(notes, config)
  return `---\n${frontmatter}---\n\n${body}`
}

function buildFrontmatter(config: ExportConfig): string {
  const lines: string[] = []

  if (config.cover.title) {
    lines.push(`title: ${formatYamlValue(config.cover.title)}`)
  }
  if (config.cover.subtitle) {
    lines.push(`subtitle: ${formatYamlValue(config.cover.subtitle)}`)
  }
  if (config.cover.author) {
    lines.push(`author: ${formatYamlValue(config.cover.author)}`)
  }
  if (config.cover.coverImage) {
    lines.push(`cover-image: ${formatYamlValue(config.cover.coverImage)}`)
  }
  if (config.toc.depth > 0) {
    lines.push(`toc: true`)
    lines.push(`toc-depth: ${config.toc.depth}`)
    if (config.toc.title) {
      lines.push(`toc-title: ${formatYamlValue(config.toc.title)}`)
    }
  }

  lines.push('')
  return lines.join('\n')
}

function buildBody(
  notes: NormalizedNote[],
  config: ExportConfig,
): string {
  const offset = computeHeadingOffset(config.headingRoles)
  const parts: string[] = []

  for (const note of notes) {
    let content = note.content.trim()
    if (!content) continue
    if (offset !== 0) {
      content = shiftHeadings(content, offset)
    }
    parts.push(content)
  }

  return parts.join('\n\n')
}

function computeHeadingOffset(
  headingRoles: Record<string, string>,
): number {
  const levels = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']
  for (let i = 0; i < levels.length; i++) {
    const role = headingRoles[levels[i]!]
    if (role && role !== 'paragraph' && role !== 'bold' && role !== 'italic') {
      return i
    }
  }
  return 0
}

function shiftHeadings(content: string, offset: number): string {
  if (offset === 0) return content
  return content.replace(/^(#+)/gm, (_match, hashes: string) => {
    const newLevel = Math.min(hashes.length + offset, 6)
    return '#'.repeat(newLevel)
  })
}

function formatYamlValue(value: string): string {
  if (/^[\w\s.-]+$/.test(value) && !/^[0-9]/.test(value) &&
      !/^(true|false|yes|no)$/i.test(value)) {
    return value
  }
  const escaped = value.replace(/"/g, '\\"')
  return `"${escaped}"`
}
