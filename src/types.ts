export interface NormalizedNote {
  path: string
  title: string
  content: string
  frontmatter: Record<string, unknown>
}

export interface CoverConfig {
  title: string
  subtitle?: string
  author?: string
  coverImage?: string
}

export interface TocConfig {
  depth: number
  title: string
}

export type OutputFormat = 'pdf' | 'docx' | 'latex'

export interface ExportConfig {
  sourceOrder: string[]
  headingRoles: Record<string, string>
  cover: CoverConfig
  toc: TocConfig
  formats: OutputFormat[]
  outputPath: string
}
