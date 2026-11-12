import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  FAQ_ITEMS,
  FAQ_SECTION_COPY,
  TEAM_FOUNDER_DATA,
  type FaqItem,
} from '@/constants';

export interface Faq3Props {
  eyebrow?: string;
  heading?: string;
  description?: string;
  items?: FaqItem[];
  supportHeading?: string;
  supportDescription?: string;
  supportButtonText?: string;
  supportButtonUrl?: string;
  onSupportClick?: () => void;
}

/**
 * FAQ (shadcnblocks Faq3 layout, as shipped in the 21st.dev "faq-pro" block):
 * centred header, open accordion list, then a "still have questions" card.
 */
export const Faq3 = ({
  eyebrow = FAQ_SECTION_COPY.eyebrow,
  heading = FAQ_SECTION_COPY.heading,
  description = FAQ_SECTION_COPY.description,
  items = FAQ_ITEMS,
  supportHeading = FAQ_SECTION_COPY.supportHeading,
  supportDescription = FAQ_SECTION_COPY.supportDescription,
  supportButtonText = FAQ_SECTION_COPY.supportButtonText,
  supportButtonUrl = TEAM_FOUNDER_DATA.socials.linkedin,
  onSupportClick,
}: Faq3Props) => {
  const initials = TEAM_FOUNDER_DATA.name
    .split(' ')
    .map((part) => part[0])
    .join('');

  return (
    <section
      id="faq"
      className="scroll-mt-12 w-full border-t border-[#15120F]/10 bg-[#F6F2EA] px-4 py-20 sm:px-6 sm:py-24"
    >
      <div className="mx-auto max-w-6xl space-y-16">
        <div className="mx-auto flex max-w-3xl flex-col text-left md:text-center">
          <p className="mb-3 font-mono text-xs uppercase tracking-wider text-[#15120F]/60">
            {eyebrow}
          </p>
          <h2
            className="mb-3 font-serif text-3xl tracking-tight text-[#15120F] md:mb-4 lg:mb-6 lg:text-5xl"
            style={{ textWrap: 'balance' }}
          >
            {heading}
          </h2>
          {description && (
            <p className="font-sans text-[#15120F]/70 lg:text-lg">
              {description}
            </p>
          )}
        </div>

        <Accordion
          type="single"
          collapsible
          className="mx-auto w-full lg:max-w-3xl"
        >
          {items.map((item) => (
            <AccordionItem key={item.id} value={item.id}>
              <AccordionTrigger className="transition-opacity duration-200 hover:no-underline hover:opacity-60">
                <span className="font-sans font-medium text-[#15120F] sm:py-1 lg:py-2 lg:text-lg">
                  {item.question}
                </span>
              </AccordionTrigger>
              <AccordionContent className="sm:mb-1 lg:mb-2">
                <span className="font-sans text-[#15120F]/70 lg:text-lg">
                  {item.answer}
                </span>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <div className="mx-auto flex max-w-4xl flex-col items-center rounded-lg border border-[#15120F]/10 bg-[#EDE8DE] p-4 text-center md:rounded-xl md:p-6 lg:p-8">
          <Avatar className="mb-4 size-16 border-2 border-[#FDFBF7] shadow-sm md:mb-5">
            <AvatarImage
              src={TEAM_FOUNDER_DATA.image}
              alt={TEAM_FOUNDER_DATA.name}
            />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <h3 className="mb-2 max-w-3xl font-serif text-2xl text-[#15120F] lg:text-3xl">
            {supportHeading}
          </h3>
          <p className="mb-8 max-w-3xl font-sans text-[#15120F]/70 lg:text-lg">
            {supportDescription}
          </p>
          <div className="flex w-full flex-col justify-center gap-2 sm:flex-row">
            <Button className="w-full sm:w-auto" asChild>
              <a href={supportButtonUrl} target="_blank" rel="noopener noreferrer">
                {supportButtonText}
              </a>
            </Button>
            {onSupportClick && (
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={onSupportClick}
              >
                Send a tender instead
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Faq3;
