import { describe, it, expect } from 'vitest'
import { normalizeNote, resolveEmbeds } from '../../src/docsComposers/normalizer.js'

describe('normalizeNote', () => {
  it('returns title from frontmatter when present', () => {
    const result = normalizeNote(
      '---\ntitle: Mi Capítulo\n---\n\nContenido.',
      'folder/nota.md',
    )
    expect(result.title).toBe('Mi Capítulo')
  })

  it('falls back to filename when no frontmatter title', () => {
    const result = normalizeNote('Contenido.', 'folder/mi-nota.md')
    expect(result.title).toBe('mi-nota')
  })

  it('falls back to filename when frontmatter has no title', () => {
    const result = normalizeNote(
      '---\ndate: 2024-01-01\n---\n\nBody',
      'sin-titulo.md',
    )
    expect(result.title).toBe('sin-titulo')
  })

  it('resolves title from path without .md extension', () => {
    const result = normalizeNote('', 'notas/mi-documento')
    expect(result.title).toBe('mi-documento')
  })

  it('resolves title from path with multiple extensions', () => {
    const result = normalizeNote('', 'data.tar.gz.md')
    expect(result.title).toBe('data.tar.gz')
  })

  it('extracts frontmatter fields', () => {
    const result = normalizeNote(
      '---\ntitle: Test\nauthor: Juan\npublished: true\n---\n\nBody',
      'test.md',
    )
    expect(result.frontmatter).toEqual({
      title: 'Test',
      author: 'Juan',
      published: true,
    })
  })

  it('strips frontmatter from content', () => {
    const result = normalizeNote(
      '---\ntitle: X\n---\n\n# Real Content\n\nHello.',
      'x.md',
    )
    expect(result.content).not.toContain('---')
    expect(result.content).toContain('# Real Content')
    expect(result.content).toContain('Hello.')
  })

  it('preserves body when no frontmatter', () => {
    const result = normalizeNote('# Hello\n\nWorld.', 'hello.md')
    expect(result.content).toBe('# Hello\n\nWorld.')
    expect(result.frontmatter).toEqual({})
  })

  it('handles empty frontmatter (just --- delimiters)', () => {
    const result = normalizeNote('---\n---\n\nBody', 'empty.md')
    expect(result.frontmatter).toEqual({})
    expect(result.content).toBe('Body')
  })

  it('returns body as-is when --- is not closed', () => {
    const result = normalizeNote('---\ntitle: X\n\nBody', 'broken.md')
    expect(result.frontmatter).toEqual({})
    expect(result.content).toBe('---\ntitle: X\n\nBody')
  })

  it('returns empty frontmatter for empty content', () => {
    const result = normalizeNote('', 'empty.md')
    expect(result.frontmatter).toEqual({})
    expect(result.content).toBe('')
  })

  it('handles content with only whitespace', () => {
    const result = normalizeNote('   \n  \n  ', 'whitespace.md')
    expect(result.content).toBe('   \n  \n  ')
  })

  it('stores the path unchanged', () => {
    const result = normalizeNote('Hi', 'a/b/c.md')
    expect(result.path).toBe('a/b/c.md')
  })

  it('parses numeric frontmatter values', () => {
    const result = normalizeNote(
      '---\norder: 1\nchapter: 42\n---\n\nBody',
      'nums.md',
    )
    expect(result.frontmatter.order).toBe(1)
    expect(result.frontmatter.chapter).toBe(42)
  })

  it('parses boolean frontmatter values', () => {
    const result = normalizeNote(
      '---\ndraft: false\nfeatured: true\n---\n\nBody',
      'bools.md',
    )
    expect(result.frontmatter.draft).toBe(false)
    expect(result.frontmatter.featured).toBe(true)
  })

  it('strips quotes from frontmatter string values', () => {
    const result = normalizeNote(
      "---\ntitle: 'Single'\nsub: \"Double\"\n---\n\nBody",
      'quotes.md',
    )
    expect(result.frontmatter.title).toBe('Single')
    expect(result.frontmatter.sub).toBe('Double')
  })

  it('skips comment lines in frontmatter', () => {
    const result = normalizeNote(
      '---\n# this is a comment\ntitle: Real\n---\n\nBody',
      'comments.md',
    )
    expect(result.frontmatter).not.toHaveProperty('# this is a comment')
    expect(result.frontmatter.title).toBe('Real')
  })

  it('ignores frontmatter dashes inside content that start the file', () => {
    const result = normalizeNote(
      '---\ntitle: X\n---\n\nSome --- dashes ---.',
      'dashes.md',
    )
    expect(result.content).toBe('Some --- dashes ---.')
  })
})

describe('wikilinks', () => {
  it('converts [[link]] to markdown link', () => {
    const result = normalizeNote('See [[otra-nota]] for details.', 'a.md')
    expect(result.content).toContain('[otra-nota](otra-nota)')
  })

  it('converts [[link|display]] to markdown link with alias', () => {
    const result = normalizeNote('See [[otra-nota|Other note]].', 'a.md')
    expect(result.content).toContain('[Other note](otra-nota)')
  })

  it('strips heading fragment from wikilink target', () => {
    const result = normalizeNote('See [[page#section]].', 'a.md')
    expect(result.content).toContain('[page#section](page)')
  })

  it('strips heading fragment with display text', () => {
    const result = normalizeNote('See [[page#section|the section]].', 'a.md')
    expect(result.content).toContain('[the section](page)')
  })

  it('strips block reference from wikilink target', () => {
    const result = normalizeNote('See [[page#^block-id]].', 'a.md')
    expect(result.content).toContain('[page#^block-id](page)')
  })

  it('converts multiple wikilinks on the same line', () => {
    const result = normalizeNote('[[a]] and [[b|B]].', 'a.md')
    expect(result.content).toBe('[a](a) and [B](b).')
  })

  it('handles wikilinks with spaces in the target', () => {
    const result = normalizeNote('[[mi página]]', 'a.md')
    expect(result.content).toBe('[mi página](mi%20página)')
  })

  it('handles wikilinks with special characters', () => {
    const result = normalizeNote('[[nota-1.2_3]]', 'a.md')
    expect(result.content).toBe('[nota-1.2_3](nota-1.2_3)')
  })

  it('ignores non-wiki brackets', () => {
    const result = normalizeNote('Normal [text] and [[link]].', 'a.md')
    expect(result.content).toContain('Normal [text] and')
    expect(result.content).toContain('[link](link)')
  })

  it('ignores single bracket without pair', () => {
    const result = normalizeNote('[text [[link]]', 'a.md')
    expect(result.content).toBe('[text [link](link)')
  })

  it('does not transform content inside code blocks', () => {
    const result = normalizeNote(
      'Text\n```\n[[not-a-link]]\n```\nEnd',
      'code.md',
    )
    expect(result.content).toContain('[[not-a-link]]')
  })

  it('does not transform content inside inline code', () => {
    const result = normalizeNote('Use `[[not-a-link]]` here.', 'code.md')
    expect(result.content).toContain('`[[not-a-link]]`')
  })
})

describe('image embeds', () => {
  const emptyMap = new Map<string, { content: string; path: string }>()

  it('converts ![[img.png]] to markdown image', () => {
    const result = resolveEmbeds('![[photo.png]]', emptyMap, 'resolve')
    expect(result).toContain('![photo.png](photo.png)')
  })

  it('converts ![[img.png|alt text]]', () => {
    const result = resolveEmbeds('![[photo.png|My photo]]', emptyMap, 'resolve')
    expect(result).toContain('![My photo](photo.png)')
  })

  it('handles image embeds with relative path', () => {
    const result = resolveEmbeds('![[assets/img/photo.png]]', emptyMap, 'resolve')
    expect(result).toBe('![assets/img/photo.png](assets/img/photo.png)')
  })

  it('resolves image embed path relative to note directory', () => {
    const result = resolveEmbeds('![[photo.png]]', emptyMap, 'resolve', 'subfolder/note.md')
    expect(result).toBe('![photo.png](subfolder/photo.png)')
  })

  it('resolves image embed with nested relative path', () => {
    const result = resolveEmbeds('![[assets/photo.png]]', emptyMap, 'resolve', 'subfolder/note.md')
    expect(result).toBe('![assets/photo.png](subfolder/assets/photo.png)')
  })

  it('does not confuse ![[ with plain text', () => {
    const result = resolveEmbeds('Not an embed: ![[ just text', emptyMap, 'resolve')
    expect(result).toBe('Not an embed: ![[ just text')
  })

  it('embeds note content when target is a note', () => {
    const noteMap = new Map([['other', { content: 'Content of other note', path: 'other.md' }]])
    const result = resolveEmbeds('![[other]]', noteMap, 'resolve')
    expect(result).toBe('Content of other note')
  })

  it('resolves image embeds inside transcluded note', () => {
    const noteMap = new Map([['other', { content: '![[photo.png]]', path: 'subfolder/other.md' }]])
    const result = resolveEmbeds('![[other]]', noteMap, 'resolve', 'parent/note.md')
    expect(result).toBe('![photo.png](subfolder/photo.png)')
  })

  it('resolves nested embeds recursively', () => {
    const noteMap = new Map([['a', { content: '![[b]]', path: 'a.md' }], ['b', { content: 'B content', path: 'b.md' }]])
    const result = resolveEmbeds('![[a]]', noteMap, 'resolve')
    expect(result).toBe('B content')
  })

  it('prevents infinite loops on circular embeds', () => {
    const noteMap = new Map([['a', { content: '![[b]]', path: 'a.md' }], ['b', { content: '![[a]]', path: 'b.md' }]])
    const result = resolveEmbeds('![[a]]', noteMap, 'resolve')
    expect(result).toBe('')
  })

  it('leaves embeds as-is in raw mode', () => {
    const result = resolveEmbeds('![[photo.png]]', emptyMap, 'raw')
    expect(result).toBe('![[photo.png]]')
  })

  it('strips embeds in strip mode', () => {
    const result = resolveEmbeds('![[photo.png]]', emptyMap, 'strip')
    expect(result).toBe('')
  })
})

describe('highlights', () => {
  it('converts ==text== to <mark>', () => {
    const result = normalizeNote('This is ==important== text.', 'a.md')
    expect(result.content).toContain('<mark>important</mark>')
  })

  it('handles multiple highlights', () => {
    const result = normalizeNote('==A== and ==B==.', 'a.md')
    expect(result.content).toBe('<mark>A</mark> and <mark>B</mark>.')
  })

  it('handles highlight with spaces inside', () => {
    const result = normalizeNote('==muy importante==.', 'a.md')
    expect(result.content).toBe('<mark>muy importante</mark>.')
  })

  it('ignores single == without closing', () => {
    const result = normalizeNote('Esto es ==importante.', 'a.md')
    expect(result.content).toBe('Esto es ==importante.')
  })

  it('ignores empty == ==', () => {
    const result = normalizeNote('Esto es ====.', 'a.md')
    expect(result.content).toBe('Esto es ====.')
  })
})

describe('comments', () => {
  it('removes inline %% comments', () => {
    const result = normalizeNote('Hello %%world%% there.', 'a.md')
    expect(result.content).toBe('Hello  there.')
  })

  it('removes multiline %% comments without leaving blank line', () => {
    const result = normalizeNote('Before\n%%\ncomment\n%%\nAfter', 'a.md')
    expect(result.content).toBe('Before\nAfter')
  })

  it('removes comment at start of content', () => {
    const result = normalizeNote('%%comment%%\nBody', 'a.md')
    expect(result.content).toBe('Body')
  })

  it('removes comment at end of content', () => {
    const result = normalizeNote('Body\n%%comment%%', 'a.md')
    expect(result.content).toBe('Body\n')
  })

  it('removes consecutive %% comments', () => {
    const result = normalizeNote('a %%one%% b %%two%% c', 'a.md')
    expect(result.content).toBe('a  b  c')
  })

  it('ignores unclosed %%', () => {
    const result = normalizeNote('Texto %% sin cerrar', 'a.md')
    expect(result.content).toBe('Texto %% sin cerrar')
  })

  it('ignores single % without doubling', () => {
    const result = normalizeNote('Texto % not a comment%', 'a.md')
    expect(result.content).toBe('Texto % not a comment%')
  })
})

describe('callouts', () => {
  it('simplifies callout to a plain blockquote', () => {
    const result = normalizeNote('> [!info] Note\n> content', 'a.md')
    expect(result.content).toContain('> **Note**')
  })

  it('handles callout without title', () => {
    const result = normalizeNote('> [!warning]\n> be careful', 'a.md')
    expect(result.content).toContain('> ')
  })

  it('handles callout with multiline body', () => {
    const result = normalizeNote(
      '> [!tip] Tip Title\n> line 1\n> line 2',
      'a.md',
    )
    expect(result.content).toContain('> **Tip Title**')
    expect(result.content).toContain('> line 1')
    expect(result.content).toContain('> line 2')
  })

  it('handles different callout types', () => {
    const types = ['note', 'warning', 'danger', 'tip', 'info', 'question']
    for (const t of types) {
      const result = normalizeNote(`> [!${t}] Title`, 'a.md')
      expect(result.content).toContain('> **Title**')
    }
  })

  it('ignores regular blockquotes without callout syntax', () => {
    const result = normalizeNote('> plain quote\n> more', 'a.md')
    expect(result.content).toBe('> plain quote\n> more')
  })
})

describe('subscript', () => {
  it('converts ~text~ to <sub>', () => {
    const result = normalizeNote('H~2~O', 'a.md')
    expect(result.content).toContain('<sub>2</sub>')
  })

  it('handles multiple subscripts', () => {
    const result = normalizeNote('C~6~H~12~O~6~', 'a.md')
    expect(result.content).toBe('C<sub>6</sub>H<sub>12</sub>O<sub>6</sub>')
  })

  it('ignores ~~double tilde~~ strikethrough syntax', () => {
    const result = normalizeNote('~~text~~', 'a.md')
    expect(result.content).toBe('~~text~~')
  })

  it('ignores single ~ without closing', () => {
    const result = normalizeNote('H~2O', 'a.md')
    expect(result.content).toBe('H~2O')
  })

  it('ignores empty ~~', () => {
    const result = normalizeNote('text ~~', 'a.md')
    expect(result.content).toBe('text ~~')
  })
})

describe('superscript', () => {
  it('converts ^text^ to <sup>', () => {
    const result = normalizeNote('x^2^ + y^2^', 'a.md')
    expect(result.content).toContain('<sup>2</sup>')
  })

  it('handles multiple superscripts', () => {
    const result = normalizeNote('a^b^c^d^', 'a.md')
    expect(result.content).toBe('a<sup>b</sup>c<sup>d</sup>')
  })

  it('ignores single ^ without closing', () => {
    const result = normalizeNote('x^2 + 1', 'a.md')
    expect(result.content).toBe('x^2 + 1')
  })
})

describe('transformation order', () => {
  it('removes comments before processing wikilinks inside them', () => {
    const result = normalizeNote(
      'See %% hidden [[link]] %% end.',
      'order.md',
    )
    expect(result.content).not.toContain('[link]')
    expect(result.content).toContain('end.')
  })
})
