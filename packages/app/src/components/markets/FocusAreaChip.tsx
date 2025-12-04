import * as React from 'react';
import { motion } from 'framer-motion';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/sdk/ui/components/ui/tooltip';

interface FocusAreaChipProps {
  label: string;
  color: string;
  selected: boolean;
  onClick: () => void;
  IconComponent?: React.ComponentType<{
    className?: string;
    style?: React.CSSProperties;
  }>;
  className?: string;
  iconSize?: 'sm' | 'md';
  selectedVariant?: 'default' | 'muted';
}

const CHIP_BASE =
  'group relative shrink-0 inline-flex text-left rounded-full items-center gap-2 transition-all duration-200 ease-out text-sm whitespace-nowrap px-3 py-1.5 md:py-0.5';

const FocusAreaChip: React.FC<FocusAreaChipProps> = ({
  label,
  color,
  selected,
  onClick,
  IconComponent,
  className,
  iconSize = 'md',
  selectedVariant = 'default',
}) => {
  const withAlpha = React.useCallback((c: string, alpha: number) => {
    // Hex color (#RRGGBB or #RGB) -> append alpha as 2-digit hex
    const hexMatch = /^#(?:[0-9a-fA-F]{3}){1,2}$/;
    if (hexMatch.test(c)) {
      const a = Math.max(0, Math.min(1, alpha));
      const aHex = Math.round(a * 255)
        .toString(16)
        .padStart(2, '0');
      return `${c}${aHex}`;
    }

    // hsl(...) or rgb(...) support modern slash alpha syntax
    const toSlashAlpha = (fn: 'hsl' | 'rgb', inside: string) =>
      `${fn}(${inside} / ${alpha})`;

    if (c.startsWith('hsl(')) {
      const inside = c.slice(4, -1);
      return toSlashAlpha('hsl', inside);
    }
    if (c.startsWith('rgb(')) {
      const inside = c.slice(4, -1);
      return toSlashAlpha('rgb', inside);
    }

    // Generic var(...) like hsl(var(--primary)) should be handled above via hsl( ... ),
    // but if not matched, fallback to original color (no alpha)
    return c;
  }, []);

  const labelRef = React.useRef<HTMLSpanElement>(null);
  const [, setLabelWidth] = React.useState<number>(0);

  React.useLayoutEffect(() => {
    const el = labelRef.current;
    if (!el) return;

    const updateWidth = () => {
      setLabelWidth(el.offsetWidth);
    };

    updateWidth();

    const resizeObserver = new ResizeObserver(() => {
      updateWidth();
    });

    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, [label, iconSize]);
  // Desktop behavior: when unselected, show icon-only circular chip; when selected, show icon + text pill
  const isMutedSelected = selected && selectedVariant === 'muted';

  const selectedStyles = selected
    ? {
        className: `${CHIP_BASE} bg-[var(--chip-bg-strong)] border border-transparent ring-1 ring-[var(--chip-ring)]`,
        style: {
          ['--chip-bg-strong' as any]: withAlpha(
            color,
            isMutedSelected ? 0.14 : 0.2
          ),
          ['--chip-ring' as any]: withAlpha(
            color,
            isMutedSelected ? 0.24 : 0.4
          ),
        } as React.CSSProperties,
      }
    : {
        className: `${CHIP_BASE} bg-[var(--chip-bg)] border border-transparent`,
        style: {
          ['--chip-bg' as any]: withAlpha(color, 0.1),
        } as React.CSSProperties,
      };

  const mergedClassName = className
    ? `${selectedStyles.className} ${className}`
    : selectedStyles.className;
  const desktopResponsiveClassName = 'md:h-8 md:px-0 md:gap-0 md:justify-start';
  const desktopTransitionClassName = 'md:transition-none';

  // Slightly reduced icon sizes
  const iconDimensionClass = iconSize === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  const chipButton = (
    <motion.button
      // Only animate position changes; width is controlled by inner label container
      type="button"
      onClick={onClick}
      className={`${mergedClassName} ${desktopResponsiveClassName} ${desktopTransitionClassName}`}
      style={{ ...selectedStyles.style, minWidth: '1.5rem' }}
      aria-pressed={selected}
      aria-label={label}
    >
      <span className="inline-flex items-center justify-center md:w-8 md:h-8">
        {IconComponent && (
          <span
            className={`${iconDimensionClass} inline-flex items-center justify-center`}
            aria-hidden="true"
          >
            <IconComponent className={iconDimensionClass} style={{ color }} />
          </span>
        )}
      </span>
      {/* Mobile label (always visible on mobile to preserve existing behavior) */}
      <span className="ml-1.5 font-medium pr-1.5 md:hidden">{label}</span>

      {/* Desktop label: measured container animates width; inner text fades */}
      <motion.span
        key="desktop-label-container"
        className="hidden md:inline-block overflow-hidden"
        layout
        animate={{ width: selected ? 'auto' : 0 }}
        initial={false}
        transition={{ duration: 0.22, ease: 'easeOut' }}
      >
        <motion.span
          ref={labelRef}
          className="font-medium pr-3 text-foreground/80 inline-block"
          initial={false}
          animate={{ opacity: selected ? 1 : 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          {label}
        </motion.span>
      </motion.span>
    </motion.button>
  );

  // Wrap with tooltip on desktop when unselected
  if (!selected) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{chipButton}</TooltipTrigger>
          <TooltipContent className="hidden md:block">
            <p>{label}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return chipButton;
};

export default FocusAreaChip;
