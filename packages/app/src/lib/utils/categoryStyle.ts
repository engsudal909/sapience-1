'use client';

import { FOCUS_AREAS } from '~/lib/constants/focusAreas';
import { getDeterministicCategoryColor } from '~/lib/theme/categoryPalette';

const DEFAULT_CATEGORY_COLOR = 'hsl(var(--muted-foreground))';

export const getCategoryStyle = (categorySlug?: string | null) => {
  const slug = categorySlug || '';
  const focusArea = FOCUS_AREAS.find((fa) => fa.id === slug);
  if (focusArea) {
    return { color: focusArea.color, id: focusArea.id, name: focusArea.name };
  }
  if (!slug) return { color: DEFAULT_CATEGORY_COLOR, id: '', name: '' };
  return {
    color: getDeterministicCategoryColor(slug) || DEFAULT_CATEGORY_COLOR,
    id: slug,
    name: '',
  };
};
