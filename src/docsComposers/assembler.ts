import { type NormalizedNote, type ExportConfig, type HeadingMapping } from '../types.js'

const headingLevels = ['lvl1', 'lvl2', 'lvl3', 'lvl4', 'lvl5', 'lvl6']

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
  const meta = config.source.metadata

  if (meta.title) {
    lines.push(`title: ${formatYamlValue(meta.title)}`)
  }
  if (meta.subtitle) {
    lines.push(`subtitle: ${formatYamlValue(meta.subtitle)}`)
  }
  if (meta.author) {
    lines.push(`author: ${formatYamlValue(meta.author)}`)
  }
  if (config.frontMatter.coverImagePath) {
    lines.push(`cover-image: ${formatYamlValue(config.frontMatter.coverImagePath)}`)
  }
  if (config.frontMatter.toc.enabled && config.frontMatter.toc.depth > 0) {
    lines.push(`toc: true`)
    lines.push(`toc-depth: ${config.frontMatter.toc.depth}`)
    if (config.frontMatter.toc.title) {
      lines.push(`toc-title: ${formatYamlValue(config.frontMatter.toc.title)}`)
    }
  }

  lines.push('')
  return lines.join('\n')
}

function buildBody(
  notes: NormalizedNote[],
  config: ExportConfig,
): string {
  const offset = computeHeadingOffset(config.structure.headingMapping)
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
  headingMapping: Record<string, HeadingMapping>,
): number {
  for (let i = 0; i < headingLevels.length; i++) {
    const role = headingMapping[headingLevels[i]!]
    if (role && !isInlineRole(role)) {
      return i
    }
  }
  return 0
}

function isInlineRole(role: HeadingMapping): boolean {
  return role === 'paragraph' || role === 'bold' || role === 'italic' || role === 'inline'
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

export { computeHeadingOffset, shiftHeadings }
