import React, { useState } from 'react';

/**
 * An image that shimmers until it has actually decoded.
 *
 * The event-album grids draw dozens of photos off R2 at once; a bare <img>
 * pops each one in abruptly and leaves blank white cells on a slow
 * connection. Here a pulsing slate block owns the cell and the picture fades
 * in over it once loaded — the same skeleton language the Explore and Home
 * pages already speak. onError also ends the shimmer: a broken file should
 * read as an empty cell, not as one that loads forever.
 */
const SkeletonImage: React.FC<{
  src: string;
  alt?: string;
  className?: string;
  eager?: boolean;
}> = ({ src, alt = '', className = '', eager = false }) => {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="relative w-full h-full overflow-hidden">
      {!loaded && <div className="absolute inset-0 bg-slate-200 animate-pulse" />}
      <img
        src={src}
        alt={alt}
        loading={eager ? undefined : 'lazy'}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        className={`w-full h-full transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'} ${className}`}
      />
    </div>
  );
};

export default SkeletonImage;
