/**
 * Custom Next.js image loader that handles data URIs and regular URLs
 * 
 * Next.js requires custom loaders to use the width parameter in the returned URL.
 * For data URIs, we return them as-is (they're already optimized).
 * For all other images (including SVGs), we append width to satisfy Next.js requirements,
 * even though SVGs don't actually need width-based optimization.
 */
export default function imageLoader({ src, width, quality }) {
  // If it's a data URI, return it as-is (no width needed, data URIs are self-contained)
  if (src.startsWith('data:')) {
    return src;
  }
  
  // For all other images (including SVGs), Next.js requires width to be in the URL
  // Append width as a query parameter to satisfy Next.js requirements
  // Note: For SVGs, the width param won't be used, but Next.js still requires it
  const separator = src.includes('?') ? '&' : '?';
  let result = `${src}${separator}w=${width}`;
  if (quality) {
    result += `&q=${quality}`;
  }
  return result;
}


