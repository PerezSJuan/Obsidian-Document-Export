import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ObsidianAssetResolver } from '../../src/infra/obsidianAssetResolver.js'

vi.mock('obsidian', () => ({
  requestUrl: vi.fn(),
}))

import { requestUrl } from 'obsidian'

describe('ObsidianAssetResolver', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('times out remote reads', async () => {
    vi.useFakeTimers()
    const pending = new Promise(() => {}) as unknown as ReturnType<typeof requestUrl>
    vi.mocked(requestUrl).mockImplementation(() => pending)

    const resolver = new ObsidianAssetResolver({
      getAbstractFileByPath: vi.fn(),
      readBinary: vi.fn(),
    } as never)

    const promise = resolver.read('https://example.com/image.png')
    const assertion = expect(promise).rejects.toThrow('Remote image read timed out')
    await vi.advanceTimersByTimeAsync(10000)
    await assertion
  })
})
