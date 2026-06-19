import { type NormalizedNote, type ExportConfig } from '../types.js'

export function assemble(
  notes: NormalizedNote[],
  config: ExportConfig,
): string {
  const frontmatter = buildFrontmatter(config)
  const body = buildBody(notes)
  return `---\n${frontmatter}---\n\n${body}`
}

function buildFrontmatter(config: ExportConfig): string {
  const lines: string[] = []

  if (config.source.metadata.title) {
    lines.push(`title: ${formatYamlValue(config.source.metadata.title)}`)
  }
  if (config.source.metadata.subtitle) {
    lines.push(`subtitle: ${formatYamlValue(config.source.metadata.subtitle)}`)
  }
  if (config.source.metadata.author) {
    lines.push(`author: ${formatYamlValue(config.source.metadata.author)}`)
  }
  if (config.frontMatter.coverImagePath) {
    lines.push(`cover-image: ${formatYamlValue(config.frontMatter.coverImagePath)}`)
  }
  if (config.frontMatter.toc.enabled) {
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
): string {
  const parts: string[] = []

  for (const note of notes) {
    const content = note.content.trim()
    if (!content) continue
    parts.push(content)
  }

  return parts.join('\n\n')
}

function formatYamlValue(value: string): string {
  if (/^[\w\s.-]+$/.test(value) && !/^[0-9]/.test(value) &&
      !/^(true|false|yes|no)$/i.test(value)) {
    return value
  }
  const escaped = value.replace(/"/g, '\\"')
  return `"${escaped}"`
}
