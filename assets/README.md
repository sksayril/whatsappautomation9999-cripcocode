# Wapiea Icon Assets

This folder contains the icon files for the Wapiea desktop application.

## Icon Files Needed

- `icon.png` - 512x512 PNG for Linux and general use
- `icon.ico` - Windows icon file (multiple sizes)
- `icon.icns` - macOS icon file

## Quick Setup

### Option 1: Using electron-icon-maker (Recommended)
```bash
npm install -g electron-icon-maker
electron-icon-maker --input=assets/icon.svg --output=assets
```

### Option 2: Using Online Converter
1. Open `icon.svg` in a browser or image editor
2. Export as PNG (512x512) → `icon.png`
3. Convert PNG to ICO (Windows) → `icon.ico`
4. Convert PNG to ICNS (macOS) → `icon.icns`

### Option 3: Using ImageMagick (if installed)
```bash
# Convert SVG to PNG
magick convert assets/icon.svg -resize 512x512 assets/icon.png

# Convert PNG to ICO (Windows)
magick convert assets/icon.png -define icon:auto-resize=256,128,64,48,32,16 assets/icon.ico
```

## Current Status

✅ `icon.svg` - Created (source file)
⏳ `icon.png` - Needs to be generated
⏳ `icon.ico` - Needs to be generated  
⏳ `icon.icns` - Needs to be generated

Once all icon files are created, the Electron app will use them automatically.

