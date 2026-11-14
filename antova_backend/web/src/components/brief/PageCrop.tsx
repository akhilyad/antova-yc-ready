import { useEffect, useState } from 'react'
import {
  evidenceUrl,
  fetchEvidenceObjectUrl,
  type EvidenceSource,
  type EvidenceWhich,
  type Scope,
} from '../../api/client'
import { copy } from '../../content/copy'
import styles from './PageCrop.module.css'

export type PageCropProps = {
  scope: Scope
  paramId: string
  /** "mr" for the buyer's requirement, else a vendor ID. */
  source: EvidenceSource
  which: EvidenceWhich
  /** The quote the crop shows (spec §11: the crop's alt text is the quote). */
  alt: string
}

/** A review crop's fetch result; `src` null when the fetch failed. */
type Fetched = { key: string; src: string | null }
/** What the <img> reported for a given src. */
type Loaded = { src: string; status: 'ready' | 'failed' }

/**
 * The cropped page image: skeleton → image → "Page image unavailable. The quote above is
 * exact." A public crop is a plain <img> URL. A review crop needs the token header, so it is
 * fetched and shown as an object URL, revoked when the crop changes or unmounts.
 */
export function PageCrop({ scope, paramId, source, which, alt }: PageCropProps) {
  const tenderId = scope.kind === 'review' ? scope.tenderId : undefined
  const token = scope.kind === 'review' ? scope.token : undefined
  const key = `${tenderId ?? ''}/${paramId}/${source}/${which}`

  const [fetched, setFetched] = useState<Fetched | null>(null)
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    if (tenderId === undefined || token === undefined) return
    const controller = new AbortController()
    let objectUrl: string | null = null
    let live = true
    fetchEvidenceObjectUrl(
      { kind: 'review', tenderId, token },
      paramId,
      source,
      which,
      controller.signal,
    ).then(
      (url) => {
        if (live) {
          objectUrl = url
          setFetched({ key, src: url })
        } else {
          URL.revokeObjectURL(url)
        }
      },
      () => {
        if (live) setFetched({ key, src: null })
      },
    )
    return () => {
      live = false
      controller.abort()
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl)
    }
  }, [key, tenderId, token, paramId, source, which])

  // Public: the URL is known now. Review: only a finished fetch for this crop counts.
  let src: string | null | undefined
  if (scope.kind === 'public') src = evidenceUrl(scope, paramId, source, which)
  else src = fetched?.key === key ? fetched.src : undefined

  let status: 'loading' | 'ready' | 'failed' = 'loading'
  if (src === null) status = 'failed'
  else if (src !== undefined && loaded?.src === src) status = loaded.status

  if (status === 'failed') {
    return <p className={styles.fallback}>{copy.errors.cropFailed}</p>
  }
  // Public crops have a real URL to open; a review crop is a blob: URL revoked on unmount, so
  // a new tab of it would break on reload (and iOS Safari opens such links poorly).
  const linked = status === 'ready' && Boolean(src) && scope.kind === 'public'
  const image = src ? (
    <img
      src={src}
      // Inside the link the label names it; the quote above already says what the crop shows.
      alt={linked ? '' : alt}
      className={status === 'ready' ? styles.image : styles.pending}
      decoding="async"
      onLoad={() => setLoaded({ src, status: 'ready' })}
      onError={() => setLoaded({ src, status: 'failed' })}
    />
  ) : null
  return (
    <div className={styles.crop}>
      {status === 'loading' ? (
        <div className={styles.skeleton}>
          <span className="visually-hidden">{copy.brief.cropLoading}</span>
        </div>
      ) : null}
      {linked && src ? (
        // The crop is scaled to the margin's width; the link shows it at its own size.
        <a href={src} target="_blank" rel="noopener noreferrer" className={styles.open}>
          {image}
          <span className={styles.openLabel}>
            {copy.brief.cropOpen}{' '}
            <span className="visually-hidden">{copy.brief.cropOpenSpoken}</span>
          </span>
        </a>
      ) : (
        image
      )}
    </div>
  )
}
