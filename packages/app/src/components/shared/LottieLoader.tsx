'use client';

interface LottieLoaderProps {
  className?: string;
  size?: number;
}

const LottieLoader = ({ className = '', size = 12 }: LottieLoaderProps) => {
  return (
    <span
      className={`inline-block align-middle rounded-full bg-muted-foreground animate-loader-pulse ${className}`}
      style={{ width: size, height: size }}
    />
  );
};

export default LottieLoader;
