import { Link } from 'react-router'
import { copy } from '../content/copy'
import { useDocumentTitle } from '../lib/useDocumentTitle'

export default function NotFound() {
  useDocumentTitle(copy.meta.title(copy.notFound.title))
  return (
    <div className="page">
      <h1>{copy.notFound.heading}</h1>
      <p>
        <Link to="/">{copy.notFound.homeLink}</Link>
      </p>
    </div>
  )
}
