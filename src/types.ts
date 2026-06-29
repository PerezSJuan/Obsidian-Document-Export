export interface NormalizedNote {
  path: string
  title: string
  content: string
  frontmatter: Record<string, unknown>
}

export type PanelId = 'source' | 'structure' | 'front' | 'output';
export type ContentMode = 'manifest' | 'manual';
export type HeadingMapping = 'part' | 'chapter' | 'section' | 'subsection' | 'inline' | 'paragraph' | 'bold' | 'italic';

export interface HeadingMappingOption {
  value: HeadingMapping;
  label: string;
}

export type FontFamily =
  | 'times-new-roman'
  | 'arial'
  | 'calibri'
  | 'georgia'
  | 'garamond'
  | 'verdana'
  | 'courier-new'
  | 'consolas';

export type PageNumberPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export interface FormattingConfig {
  font: FontFamily;
  baseFontSize: number;
  pageNumbers: {
    enabled: boolean;
    position: PageNumberPosition;
  };
}

export interface ExportConfig {
  source: {
    mode: ContentMode;
    indexNotePath: string;
    selectedNotes: string[];
    metadata: {
      title: string;
      subtitle: string;
      author: string;
    };
  };
  structure: {
    newChapterPerNote: boolean;
    headingMapping: Record<string, HeadingMapping>;
    wikilinkMode: string;
    tagMode: string;
    noteNameMode: string;
  };
  frontMatter: {
    enableCoverPage: boolean;
    useBookMetadata: boolean;
    coverImagePath: string;
    toc: {
      enabled: boolean;
      depth: number;
      title: string;
    };
  };
  output: {
    formats: {
      pdf: boolean;
      docx: boolean;
      latex: boolean;
    };
    savePath: string;
  };
  formatting: FormattingConfig;
}
