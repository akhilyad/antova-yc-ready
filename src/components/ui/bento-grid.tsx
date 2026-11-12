import { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface BentoGridProps {
  children: ReactNode;
  className?: string;
}

const BentoGrid = ({ children, className }: BentoGridProps) => {
  return (
    <div
      className={cn(
        'grid w-full grid-cols-1 md:grid-cols-3 gap-5',
        className
      )}
    >
      {children}
    </div>
  );
};

export interface BentoGridItemProps {
  title: string;
  description: string;
  header?: ReactNode;
  icon?: ReactNode;
  kicker?: string;
  className?: string;
}

const BentoGridItem = ({
  title,
  description,
  header,
  icon,
  kicker,
  className,
}: BentoGridItemProps) => {
  return (
    <div
      className={cn(
        'group/bento relative flex flex-col justify-between overflow-hidden rounded-2xl border border-[#15120F]/10 bg-[#FDFBF7] p-6 shadow-2xs transition duration-200 hover:border-[#15120F]/25 hover:shadow-md motion-safe:hover:-translate-y-0.5',
        className
      )}
    >
      <div className="mb-5 w-full flex-1">{header}</div>
      <div className="z-10 flex flex-col gap-1.5 transition duration-200 motion-safe:group-hover/bento:translate-x-1">
        <div className="flex items-center justify-between gap-2">
          {kicker && (
            <span className="font-mono text-[11px] uppercase tracking-wider text-[#15120F]/60">
              {kicker}
            </span>
          )}
          {icon && <div className="text-[#15120F]/70">{icon}</div>}
        </div>
        <h3 className="font-serif text-2xl text-[#15120F] tracking-tight leading-snug">
          {title}
        </h3>
        <p className="font-sans text-sm text-[#15120F]/70 leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
};

export interface BentoCardProps {
  name: string;
  className?: string;
  background: ReactNode;
  Icon?: React.ComponentType<{ className?: string }>;
  description: string;
  href?: string;
  cta?: string;
  onCtaClick?: () => void;
}

const BentoCard = ({
  name,
  className,
  background,
  Icon,
  description,
  href = '#audit',
  cta,
  onCtaClick,
}: BentoCardProps) => (
  <div
    key={name}
    className={cn(
      'group relative col-span-3 flex flex-col justify-between overflow-hidden rounded-2xl border border-[#15120F]/10 bg-[#FDFBF7] p-6 shadow-2xs transition-all duration-300 hover:border-[#15120F]/25',
      className
    )}
  >
    <div className="mb-5 flex-1">{background}</div>
    <div className="z-10 flex transform-gpu flex-col gap-1.5 transition-all duration-300">
      {Icon && (
        <Icon className="h-6 w-6 origin-left transform-gpu text-[#15120F]/70 transition-all duration-300 ease-in-out" />
      )}
      <h3 className="font-serif text-2xl text-[#15120F] tracking-tight">
        {name}
      </h3>
      <p className="max-w-lg font-sans text-sm text-[#15120F]/70 leading-relaxed">
        {description}
      </p>
    </div>

    {cta && (
      <div className="mt-4 flex w-full flex-row items-center">
        <Button
          variant="ghost"
          asChild
          size="sm"
          className="px-0 text-[#15120F] hover:bg-transparent hover:underline"
        >
          <a
            href={href}
            onClick={(e) => {
              if (onCtaClick) {
                e.preventDefault();
                onCtaClick();
              }
            }}
          >
            {cta}
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </a>
        </Button>
      </div>
    )}
  </div>
);

export { BentoCard, BentoGrid, BentoGridItem };
