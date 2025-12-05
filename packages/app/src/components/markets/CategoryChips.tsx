import type * as React from 'react';
import { Shapes } from 'lucide-react';
import { Skeleton } from '@sapience/sdk/ui/components/ui/skeleton';
import FocusAreaChip from './FocusAreaChip';
import { FOCUS_AREAS } from '~/lib/constants/focusAreas';
import { getCategoryIcon } from '~/lib/theme/categoryIcons';

interface Category {
  id: number;
  slug: string;
  name: string;
}

interface CategoryChipsProps {
  selectedCategorySlug: string | null;
  onCategoryClick: (categorySlug: string | null) => void;
  isLoading: boolean;
  categories: Category[] | null | undefined;
  getCategoryStyle: (
    categorySlug: string
  ) => { id: string; name: string; color: string } | undefined;
}

const DEFAULT_CATEGORY_COLOR = 'hsl(var(--muted-foreground))';

const CategoryChips: React.FC<CategoryChipsProps> = ({
  selectedCategorySlug,
  onCategoryClick,
  isLoading,
  categories,
  getCategoryStyle,
}) => {
  return (
    <div className="w-full max-w-full min-w-0 box-border mx-0 mt-1.5 min-[1400px]:mt-0 pb-0 md:pb-0 min-[1400px]:w-auto min-[1400px]:max-w-none">
      {/* Mobile: wrapping container with x-scroll; desktop: natural width and right align controlled by parent */}
      <div className="relative w-[100dvw] md:w-full max-w-none md:max-w-full min-w-0 -ml-4 md:ml-0">
        <div
          className="overflow-x-auto overflow-y-hidden md:overflow-visible touch-pan-x overscroll-x-contain w-full max-w-full min-w-0 py-1 px-1 md:px-0 min-[1400px]:w-auto"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div className="inline-flex min-w-max min-[1400px]:flex flex-nowrap whitespace-nowrap items-center gap-3.5 md:gap-4 px-3 md:px-0">
            <FocusAreaChip
              label="All Focus Areas"
              color={'hsl(var(--primary))'}
              selected={selectedCategorySlug === null}
              onClick={() => onCategoryClick(null)}
              className="py-1.5"
              IconComponent={Shapes}
              iconSize="md"
              selectedVariant="muted"
            />

            {isLoading &&
              [...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-8 w-24 rounded-full" />
              ))}

            {!isLoading &&
              categories &&
              FOCUS_AREAS.map((focusArea) => {
                const category = categories.find(
                  (c) => c.slug === focusArea.id
                );
                if (!category) return null;
                const styleInfo = getCategoryStyle(category.slug);
                const categoryColor =
                  styleInfo?.color ?? DEFAULT_CATEGORY_COLOR;
                const displayName = styleInfo?.name || category.name;
                const IconForCategory = getCategoryIcon(category.slug);

                return (
                  <FocusAreaChip
                    key={category.id}
                    label={displayName}
                    color={categoryColor}
                    selected={selectedCategorySlug === category.slug}
                    onClick={() => onCategoryClick(category.slug)}
                    IconComponent={IconForCategory}
                  />
                );
              })}
          </div>
        </div>
        {/* Mobile gradient overlays to indicate horizontal scroll */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-8 md:hidden z-10 bg-gradient-to-r from-background to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-8 md:hidden z-10 bg-gradient-to-l from-background to-transparent" />
      </div>
    </div>
  );
};

export default CategoryChips;
