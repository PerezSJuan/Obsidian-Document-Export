export interface AssetResolver {
  resolve(src: string, noteDir: string): string
  read(filePath: string): Promise<ArrayBuffer>
}
