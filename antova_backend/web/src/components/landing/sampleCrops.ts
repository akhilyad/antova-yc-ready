// `.ts` paths to leaf modules: scripts/snapshot-sample.ts imports this file and is type
// checked as Node ESM (tsconfig.node.json), which needs them.
import type { Brief } from '../../api/schemas.ts'
import { contradictionCell } from '../../domain/contradiction.ts'

/** One page crop, named the way the API's evidence route names it. */
export type CropRef = { paramId: string; source: string; which: 'primary' | 'secondary' }

/**
 * The page crops the landing shows: both quotes of the sample's one contradiction, the
 * governing one (primary) and the one it supersedes (secondary). Empty when the brief has no
 * contradiction with both quotes on record. `npm run snapshot:sample` saves each crop as a
 * static file at `sampleCropPath`, so the landing still makes no API request.
 */
export function landingCrops(brief: Brief): CropRef[] {
  const cell = contradictionCell(brief.tender)
  const param = cell && brief.tender.parameters.find((p) => p.id === cell.paramId)
  const extraction =
    cell && param && Object.hasOwn(param.vendors, cell.vendorId)
      ? param.vendors[cell.vendorId]
      : undefined
  if (!cell || !extraction?.citation || !extraction.secondary_citation) return []
  return (['primary', 'secondary'] as const).map((which) => ({
    paramId: cell.paramId,
    source: cell.vendorId,
    which,
  }))
}

/** Where a saved crop is served: the API's evidence path under /sample, as a static file. */
export function sampleCropPath({ paramId, source, which }: CropRef): string {
  return `/sample/evidence/${encodeURIComponent(paramId)}/${encodeURIComponent(source)}/${which}.png`
}
