'use client';

import * as React from 'react';
import { RefreshCw } from 'lucide-react';

type RefreshIconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  ariaLabel?: string;
  iconClassName?: string;
};

const RefreshIconButton = React.forwardRef<
  HTMLButtonElement,
  RefreshIconButtonProps
>(
  (
    { ariaLabel, title, onClick, className = '', iconClassName = '', ...rest },
    ref
  ) => {
    const [rotation, setRotation] = React.useState(0);

    const handleClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
      setRotation((r) => r + 360);
      onClick?.(e);
    };

    return (
      <button
        ref={ref}
        type="button"
        {...rest}
        aria-label={ariaLabel}
        title={title}
        onClick={handleClick}
        className={className}
      >
        <RefreshCw
          className={`text-accent-gold ${iconClassName}`}
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: 'transform 300ms ease-out',
          }}
        />
      </button>
    );
  }
);

RefreshIconButton.displayName = 'RefreshIconButton';

export default RefreshIconButton;
