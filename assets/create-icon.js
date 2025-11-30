// Script to create Wapiea icon from SVG
// This creates a simple PNG icon for Electron
// Run: node assets/create-icon.js

const fs = require('fs');
const path = require('path');

// Create a simple SVG icon file
const svgIcon = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="iconGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#10b981" stop-opacity="1" />
      <stop offset="50%" stop-color="#059669" stop-opacity="1" />
      <stop offset="100%" stop-color="#00BFFF" stop-opacity="1" />
    </linearGradient>
    <filter id="iconGlow">
      <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <rect width="512" height="512" rx="120" fill="url(#iconGrad)"/>
  <path d="M17.472 64.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" fill="white" transform="scale(18) translate(12,12)" filter="url(#iconGlow)"/>
</svg>`;

// Save SVG icon
const svgPath = path.join(__dirname, 'icon.svg');
fs.writeFileSync(svgPath, svgIcon, 'utf8');
console.log('✅ Created icon.svg');

// Note: To create PNG/ICO/ICNS files, you'll need to:
// 1. Use an online converter (like https://convertio.co/svg-png/)
// 2. Or use a tool like ImageMagick: convert icon.svg -resize 512x512 icon.png
// 3. Or use electron-icon-maker: npx electron-icon-maker --input=assets/icon.svg --output=assets

console.log('\n📝 Next steps:');
console.log('1. Convert icon.svg to PNG (512x512): icon.png');
console.log('2. Convert to ICO for Windows: icon.ico');
console.log('3. Convert to ICNS for macOS: icon.icns');
console.log('\nOr use: npx electron-icon-maker --input=assets/icon.svg --output=assets');

