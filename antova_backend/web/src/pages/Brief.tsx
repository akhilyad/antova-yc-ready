import { useParams } from 'react-router'
import { ApiError, type Scope } from '../api/client'
import { useBrief } from '../api/queries'
import { BriefView } from '../components/brief/BriefView'
import { Banner } from '../components/ui/Banner'
import { Button } from '../components/ui/Button'
import { copy } from '../content/copy'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { useNoIndex } from '../lib/useNoIndex'

/** A failure that may pass on a retry; anything else reads as "not available". */
function retryable(error: unknown): boolean {
  return error instanceof ApiError && (error.kind === 'network' || error.kind === 'server')
}

/**
 * The public verified brief at /b/:shareId. An unknown or unshared link gets the same
 * "not available" page either way; an unreachable API gets a banner with a retry, over the
 * last loaded brief when there is one.
 */
export default function Brief() {
  const { shareId = '' } = useParams()
  const query = useBrief(shareId)
  const { data, error } = query
  const unavailable = data === undefined && error !== null && !retryable(error)

  useNoIndex()
  useDocumentTitle(
    copy.meta.title(
      data
        ? copy.brief.kicker(data.tender.id)
        : unavailable
          ? copy.brief.titleUnavailable
          : copy.brief.titleLoading,
    ),
  )

  if (unavailable) {
    return (
      <div className="page">
        <h1>{copy.brief.unavailableTitle}</h1>
        <p>{copy.brief.unavailableBody}</p>
      </div>
    )
  }

  const banner =
    error !== null ? (
      <Banner
        variant="error"
        actions={
          <Button variant="secondary" onClick={() => void query.refetch()}>
            {copy.errors.apiUnreachableAction}
          </Button>
        }
      >
        {copy.errors.apiUnreachable}
      </Banner>
    ) : null

  if (data === undefined) {
    return <div className="page">{banner ?? <p aria-busy="true">{copy.brief.loading}</p>}</div>
  }

  const scope: Scope = { kind: 'public', shareId }
  return (
    <>
      {banner}
      <BriefView brief={data} scope={scope} />
    </>
  )
}
