import { cn } from '@/lib/utils';

interface DashedLineProps {
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

export const DashedLine = ({
  orientation = 'horizontal',
  className,
}: DashedLineProps) => {
  const isHorizontal = orientation === 'horizontal';

  return (
    <div
      aria-hidden="true"
      className={cn(
        'text-muted-foreground/50 relative pointer-events-none',
        isHorizontal ? 'h-px w-full' : 'h-full w-px',
        className
      )}
    >
      <div
        className={cn(
          isHorizontal
            ? [
                'h-px w-full',
                'bg-[repeating-linear-gradient(90deg,transparent,transparent_4px,currentColor_4px,currentColor_10px)]',
                '[mask-image:linear-gradient(90deg,transparent,black_20%,black_80%,transparent)]',
              ]
            : [
                'h-full w-px',
                'bg-[repeating-linear-gradient(180deg,transparent,transparent_4px,currentColor_4px,currentColor_10px)]',
                '[mask-image:linear-gradient(180deg,transparent,black_20%,black_80%,transparent)]',
              ]
        )}
      />
    </div>
  );
};
