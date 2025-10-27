'use client';

interface QuestionItemProps {
  item: any; // Can be a market or market group
  onClick: (item: any) => void;
  isSelected?: boolean;
  showBorder?: boolean;
  className?: string;
  showUnderline?: boolean;
}

const QuestionItem = ({
  item,
  onClick,
  isSelected = false,
  showBorder = true,
  className = '',
  showUnderline = true,
}: QuestionItemProps) => {
  // Determine if this is a market group or individual market
  const isMarketGroup = !item.marketId && !item.optionName;

  // Get the display title - focus on market question
  const getTitle = () => {
    if (isMarketGroup) {
      return item.question;
    }

    // For individual markets, always show the market question
    return (
      item.question ||
      item.optionName ||
      item.group?.question ||
      `Market ${item.marketId}`
    );
  };

  // Get category color for the left border
  const getCategoryColor = () => {
    if (isMarketGroup) {
      return item.category?.color || 'hsl(var(--muted-foreground))';
    }

    // For individual markets, get from group
    return item.group?.category?.color || 'hsl(var(--muted-foreground))';
  };

  const categoryColor = getCategoryColor();
  const borderClass = showBorder ? 'border-b border-border' : '';
  const selectedClass = isSelected ? 'bg-primary/10' : '';

  return (
    <div className={`w-full ${borderClass}`}>
      <button
        type="button"
        className={`w-full group bg-card border-muted flex flex-row transition-colors items-stretch min-h-[48px] relative hover:bg-muted/50 ${selectedClass} ${className}`}
        onClick={() => onClick(item)}
      >
        {/* Colored Bar (Full Height) */}
        <div
          className="w-px min-w-[1px] max-w-[1px]"
          style={{ backgroundColor: categoryColor, margin: '-1px 0' }}
        />

        {/* Content Container */}
        <div className="flex-grow px-4 py-3">
          <div className="text-left">
            <div
              className={`font-mono font-medium text-brand-white break-words whitespace-normal ${
                showUnderline
                  ? 'underline decoration-dotted decoration-1 decoration-brand-white/40 underline-offset-4 transition-colors group-hover:decoration-brand-white/80'
                  : ''
              }`}
            >
              {getTitle()}
            </div>
          </div>
        </div>
      </button>
    </div>
  );
};

export default QuestionItem;
