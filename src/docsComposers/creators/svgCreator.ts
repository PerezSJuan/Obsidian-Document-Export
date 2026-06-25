import type { ExportConfig } from '../../types.js'
import type { AssetResolver } from './assetResolver.js'
import type { Creator, RenderResult } from './creator.js'
import { sanitizeFilename } from './creator.js'
import { MathExporter } from '../../MathExporter.js'

export class SvgCreator implements Creator {
  private exporter: MathExporter

  public constructor(exporter?: MathExporter) {
    this.exporter = exporter ?? new MathExporter()
  }

  async render(markdown: string, config: ExportConfig, assets: AssetResolver): Promise<RenderResult> {
    const title = config.source.metadata.title || 'equation'
    const id = title.replace(/[^A-Za-z0-9_-]/g, '_').toLowerCase()

    // Nota: este creador usa el DOM actual para exportar KaTeX SVG.
    // Si se integra en un flujo server-side, necesita adaptarse.
    const element = document.querySelector('.katex-display') as HTMLElement | null
    if (!element) {
      throw new Error('No KaTeX element found in the current document to export.')
    }

    const result = await this.exporter.exportToSvg(element, id)
    return {
      data: result.svg,
      fileName: sanitizeFilename(config.source.metadata.title || 'equation', '.svg'),
    }
  }
}
