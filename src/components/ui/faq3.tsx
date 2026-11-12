import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { FAQ_ITEMS, FAQ_SECTION_COPY, type FaqItem } from '@/constants';

export interface Faq3Props {
  eyebrow?: string;
  heading?: string;
  description?: string;
  items?: FaqItem[];
}

export const Faq3 = ({
  eyebrow = FAQ_SECTION_COPY.eyebrow,
  heading = FAQ_SECTION_COPY.heading,
  description = FAQ_SECTION_COPY.description,
  items = FAQ_ITEMS,
}: Faq3Props) => {
  return (
    <section
      id="faq"
      className="scroll-mt-24 w-full border-t border-[#15120F]/10 bg-[#F6F2EA] px-4 py-20 sm:px-6 sm:py-24"
    >
      <div className="mx-auto max-w-6xl space-y-12">
        <div className="mx-auto flex max-w-3xl flex-col text-left md:text-center">
          <p className="font-mono text-xs uppercase tracking-wider text-[#15120F]/60 mb-3">
            {eyebrow}
          </p>
          <h2
            className="font-serif text-3xl sm:text-5xl text-[#15120F] tracking-tight"
            style={{ textWrap: 'balance' }}
          >
            {heading}
          </h2>
          {description && (
            <p className="font-sans text-base text-[#15120F]/70 mt-3 max-w-2xl mx-auto">
              {description}
            </p>
          )}
        </div>

        <div className="mx-auto w-full max-w-3xl rounded-2xl border border-[#15120F]/15 bg-[#FDFBF7] px-6 py-2 sm:px-8 sm:py-4 shadow-2xs">
          <Accordion type="single" collapsible className="w-full">
            {items.map((item) => (
              <AccordionItem
                key={item.id}
                value={item.id}
                className="border-b border-[#15120F]/15 last:border-b-0"
              >
                <AccordionTrigger className="transition-opacity duration-200 hover:no-underline hover:opacity-70">
                  <span className="font-sans font-medium text-[#15120F] text-base sm:py-1 lg:text-lg">
                    {item.question}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="sm:mb-1">
                  <p className="font-sans text-sm sm:text-base text-[#15120F]/70 leading-relaxed">
                    {item.answer}
                  </p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
};

export default Faq3;
