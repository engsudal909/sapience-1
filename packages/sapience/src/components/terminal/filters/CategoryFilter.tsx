'use client';

import type React from 'react';
import { useDeferredValue, useMemo } from 'react';
import MultiSelect, { type MultiSelectItem } from './MultiSelect';

type Props = {
  items: MultiSelectItem[];
  selected: string[];
  onChange: (values: string[]) => void;
};

const CategoryFilter: React.FC<Props> = ({ items, selected, onChange }) => {
  const deferredItems = useDeferredValue(items);
  const deferredSelected = useDeferredValue(selected);
  const memoItems = useMemo(() => deferredItems, [deferredItems]);
  const memoSelected = useMemo(() => deferredSelected, [deferredSelected]);

  return (
    <MultiSelect
      placeholder="All Focus Areas"
      items={memoItems}
      selected={memoSelected}
      onChange={onChange}
    />
  );
};

export default CategoryFilter;
