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
        'mx-auto grid w-full grid-cols-1 gap-4 md:auto-rows-[minmax(22rem,auto)] md:grid-cols-3',
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
        'group/bento row-span-1 relative flex flex-col justify-between space-y-4 overflow-hidden rounded-xl border border-[#FFFFFF]/10 bg-[#0B0B0B] p-4 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.06)] transition duration-200 hover:shadow-xl hover:shadow-[#FFFFFF]/10',
        className
      )}
    >
      <div className="flex min-h-[6rem] w-full flex-1">
        <div className="w-full">{header}</div>
      </div>
      <div className="z-10 flex flex-col gap-1.5 px-1 pb-1 transition duration-200 motion-safe:group-hover/bento:translate-x-2">
        <div className="flex items-center justify-between gap-2">
          {kicker && (
            <span className="font-mono text-[11px] uppercase tracking-wider text-[#FFFFFF]/60">
              {kicker}
            </span>
          )}
          {icon && <div className="text-[#FFFFFF]/70">{icon}</div>}
        </div>
        <h3 className="font-serif text-2xl text-[#FFFFFF] tracking-tight leading-snug">
          {title}
        </h3>
        <p className="font-sans text-sm text-[#FFFFFF]/70 leading-relaxed">
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
      'group relative col-span-3 flex flex-col justify-between overflow-hidden rounded-2xl border border-[#FFFFFF]/10 bg-[#0B0B0B] p-6 shadow-2xs transition-all duration-300 hover:border-[#FFFFFF]/25',
      className
    )}
  >
    <div className="mb-5 flex-1">{background}</div>
    <div className="z-10 flex transform-gpu flex-col gap-1.5 transition-all duration-300">
      {Icon && (
        <Icon className="h-6 w-6 origin-left transform-gpu text-[#FFFFFF]/70 transition-all duration-300 ease-in-out" />
      )}
      <h3 className="font-serif text-2xl text-[#FFFFFF] tracking-tight">
        {name}
      </h3>
      <p className="max-w-lg font-sans text-sm text-[#FFFFFF]/70 leading-relaxed">
        {description}
      </p>
    </div>

    {cta && (
      <div className="mt-4 flex w-full flex-row items-center">
        <Button
          variant="ghost"
          asChild
          size="sm"
          className="px-0 text-[#FFFFFF] hover:bg-transparent hover:underline"
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
