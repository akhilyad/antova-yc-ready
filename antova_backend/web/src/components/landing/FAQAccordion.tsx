import React, { useState, useId } from 'react'
import { copy, type FaqItem } from '../../content/copy'
import styles from './FAQAccordion.module.css'

export type { FaqItem as FAQItem }

export interface FAQAccordionProps {
  items?: readonly FaqItem[]
  allowMultiple?: boolean
  className?: string
}

export const FAQAccordion: React.FC<FAQAccordionProps> = ({
  items = copy.landing.faq,
  allowMultiple = false,
  className = '',
}) => {
  const baseId = useId()
  // Keep first question open by default for immediate preview
  const [openIds, setOpenIds] = useState<string[]>(items[0]?.id ? [items[0].id] : ['save-money'])

  const toggleItem = (id: string) => {
    if (allowMultiple) {
      setOpenIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
    } else {
      setOpenIds((prev) => (prev.includes(id) ? [] : [id]))
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent, id: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggleItem(id)
    }
  }

  return (
    <section aria-labelledby={`${baseId}-heading`} className={`${styles.container} ${className}`}>
      <div className={styles.header}>
        <div className={styles.sectionBadge} aria-hidden="true">
          <span>● FREQUENTLY ASKED QUESTIONS</span>
        </div>
        <h2 id={`${baseId}-heading`} className={styles.title}>
          {copy.landing.faqHeading}
        </h2>
        <p className={styles.subheading}>
          Simple answers about how Antova checks vendor bids and saves you money.
        </p>
      </div>

      <div className={styles.accordionCard}>
        {items.map((item, index) => {
          const itemId = item.id || `faq-${index}`
          const isOpen = openIds.includes(itemId)
          const buttonId = `${baseId}-btn-${itemId}`
          const panelId = `${baseId}-panel-${itemId}`

          return (
            <div key={itemId} className={styles.itemWrapper}>
              <h3 className={styles.itemHeading}>
                <button
                  id={buttonId}
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => toggleItem(itemId)}
                  onKeyDown={(e) => handleKeyDown(e, itemId)}
                  className={styles.triggerButton}
                >
                  <span className={styles.questionText}>{item.question}</span>
                  <span className={`${styles.chevronWrapper} ${isOpen ? styles.chevronOpen : ''}`}>
                    <svg
                      aria-hidden="true"
                      className={`${styles.chevronIcon} ${isOpen ? styles.rotateIcon : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </span>
                </button>
              </h3>

              <div
                id={panelId}
                role="region"
                aria-labelledby={buttonId}
                className={`${styles.faqAnswer} faq-answer`}
                data-open={isOpen ? 'true' : 'false'}
              >
                <div className={styles.answerInner}>
                  <p className={styles.answerText}>{item.answer}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default FAQAccordion
