export type ContentMode = 'manifest' | 'manual'

export type HeadingMapping =
  | 'part' | 'chapter' | 'section' | 'subsection'
  | 'inline' | 'paragraph' | 'bold' | 'italic'

export interface NormalizedNote {
  path: string
  title: string
  content: string
  frontmatter: Record<string, unknown>
}

export interface ExportConfig {
  source: {
    mode: ContentMode
    indexNotePath: string
    selectedNotes: string[]
    metadata: {
      title: string
      subtitle: string
      author: string
    }
  }
  structure: {
    newChapterPerNote: boolean
    headingMapping: Record<string, HeadingMapping>
    wikilinkMode: 'resolve' | 'raw' | 'strip'
    tagMode: 'keep' | 'bold' | 'strip'
    noteNameMode: 'none' | HeadingMapping
  }
  frontMatter: {
    enableCoverPage: boolean
    useBookMetadata: boolean
    coverImagePath: string
    toc: {
      enabled: boolean
      depth: number
      title: string
    }
  }
  output: {
    formats: { pdf: boolean; docx: boolean; latex: boolean }
    savePath: string
  }
}

export interface RenderResult {
  data: Buffer | string
  fileName: string
  extraFiles?: { name: string; data: ArrayBuffer }[]
}
