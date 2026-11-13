import draftJson from './draft-brief.json'

/**
 * The draft fixture as it stood before the founder's resolution of VoltSwitch's warranty:
 * no override on the brief, one open item (Deltaport PARAM-05 unpriced). The exported draft
 * fixture now carries that override so the verified fixture can be derived from it; the
 * review-page tests are about a draft the founder has not touched yet, so they start here.
 * Adder figures are left as exported: no test reads the overridden cell's amount.
 */
export function draftWithoutOverrides(): typeof draftJson {
  const brief = structuredClone(draftJson)
  brief.overrides = []
  for (const f of brief.financials) {
    for (const item of f.itemized_breakdown) {
      item.is_overridden = false
      ;(item as { override_note: string | null }).override_note = null
    }
  }
  return brief
}
