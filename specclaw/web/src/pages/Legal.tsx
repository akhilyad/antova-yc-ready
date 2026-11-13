import { Fragment } from 'react'
import { copy } from '../content/copy'
import impressum from '../content/impressum.md?raw'
import privacy from '../content/privacy.md?raw'
import { useDocumentTitle } from '../lib/useDocumentTitle'

export type LegalPage = 'impressum' | 'privacy'

export type LegalProps = {
  page: LegalPage
}

const PAGES: Record<LegalPage, { title: string; source: string }> = {
  impressum: { title: copy.legal.impressum, source: impressum },
  privacy: { title: copy.legal.privacy, source: privacy },
}

type Block = { kind: 'h1' | 'h2' | 'h3' | 'p'; lines: string[] }

/**
 * The little markdown the founder's legal text needs (ruling R6): `#`, `##` and `###`
 * headings, and paragraphs split by blank lines whose line breaks are kept (addresses).
 * Everything else is plain text; React escapes it, so nothing in the file becomes markup.
 */
function blocks(markdown: string): Block[] {
  const out: Block[] = []
  let paragraph: string[] = []
  const flush = () => {
    if (paragraph.length > 0) out.push({ kind: 'p', lines: paragraph })
    paragraph = []
  }
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim()
    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    if (heading?.[1] && heading[2]) {
      flush()
      out.push({ kind: `h${heading[1].length}` as Block['kind'], lines: [heading[2]] })
    } else if (line === '') {
      flush()
    } else {
      paragraph.push(line)
    }
  }
  flush()
  return out
}

/** /impressum and /privacy: founder-supplied text from src/content/*.md (spec §13). */
export default function Legal({ page }: LegalProps) {
  const { title, source } = PAGES[page]
  useDocumentTitle(copy.meta.title(title))
  return (
    <div className="page">
      {blocks(source).map(({ kind: Tag, lines }, i) => (
        <Tag key={i}>
          {lines.map((line, j) => (
            <Fragment key={j}>
              {j > 0 ? <br /> : null}
              {line}
            </Fragment>
          ))}
        </Tag>
      ))}
    </div>
  )
}
