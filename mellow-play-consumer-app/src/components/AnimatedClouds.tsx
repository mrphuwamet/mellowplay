import React from 'react';

// Import cloud assets directly for build optimization
import cloud1 from '../assets/clouds/Asset 1.webp';
import cloud2 from '../assets/clouds/Asset 2.webp';
import cloud3 from '../assets/clouds/Asset 3.webp';
import cloud4 from '../assets/clouds/Asset 4.webp';
import cloud5 from '../assets/clouds/Asset 5.webp';
import cloud6 from '../assets/clouds/Asset 6.webp';
import cloud7 from '../assets/clouds/Asset 7.webp';
import cloud8 from '../assets/clouds/Asset 8.webp';
import cloud9 from '../assets/clouds/Asset 9.webp';

const cloudAssets = [cloud1, cloud2, cloud3, cloud4, cloud5, cloud6, cloud7, cloud8, cloud9];

const AnimatedClouds = () => {
  // Increased density and randomized timing for a continuous flow
  const clouds = [
    // Original batch (slightly faster)
    { top: '5%', left: '5%', size: 'w-48', duration: '25s', delay: '0s', assetIndex: 0 },
    { top: '15%', left: '65%', size: 'w-64', duration: '35s', delay: '-5s', assetIndex: 1 },
    { top: '28%', left: '15%', size: 'w-44', duration: '30s', delay: '-12s', assetIndex: 2 },
    { top: '42%', left: '60%', size: 'w-72', duration: '40s', delay: '-18s', assetIndex: 3 },
    { top: '58%', left: '10%', size: 'w-56', duration: '32s', delay: '-25s', assetIndex: 4 },
    { top: '72%', left: '55%', size: 'w-52', duration: '38s', delay: '-8s', assetIndex: 5 },
    { top: '85%', left: '5%', size: 'w-80', duration: '45s', delay: '-30s', assetIndex: 6 },
    { top: '10%', left: '40%', size: 'w-36', duration: '33s', delay: '-15s', assetIndex: 7 },
    { top: '50%', left: '85%', size: 'w-52', duration: '37s', delay: '-22s', assetIndex: 8 },
    
    // New batch for higher frequency
    { top: '20%', left: '30%', size: 'w-40', duration: '28s', delay: '-3s', assetIndex: 2 },
    { top: '35%', left: '75%', size: 'w-56', duration: '42s', delay: '-9s', assetIndex: 5 },
    { top: '65%', left: '25%', size: 'w-48', duration: '36s', delay: '-14s', assetIndex: 0 },
    { top: '80%', left: '80%', size: 'w-60', duration: '31s', delay: '-20s', assetIndex: 7 },
    { top: '92%', left: '45%', size: 'w-50', duration: '44s', delay: '-27s', assetIndex: 1 },
    { top: '3%', left: '80%', size: 'w-32', duration: '26s', delay: '-6s', assetIndex: 4 },
    { top: '48%', left: '5%', size: 'w-54', duration: '34s', delay: '-11s', assetIndex: 8 },
  ];

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
      {clouds.map((cloud, index) => (
        <div 
          key={index}
          className="absolute animate-float-slow opacity-60"
          style={{ 
            top: cloud.top, 
            left: cloud.left,
            animationDuration: cloud.duration,
            animationDelay: cloud.delay,
          }}
        >
          <img 
            src={cloudAssets[cloud.assetIndex]} 
            alt="Cloud" 
            className={`${cloud.size} h-auto`}
          />
        </div>
      ))}
    </div>
  );
};

export default AnimatedClouds;
