# Wapiea Icon Setup Instructions

## Quick Setup (Recommended)

Run this command to automatically generate all icon formats:

```bash
npx electron-icon-maker --input=assets/icon.svg --output=assets
```

This will create:
- `icon.png` (512x512)
- `icon.ico` (Windows)
- `icon.icns` (macOS)

## Manual Setup

If you prefer to create icons manually:

### 1. Convert SVG to PNG
- Open `icon.svg` in any image editor or browser
- Export as PNG with dimensions 512x512
- Save as `assets/icon.png`

### 2. Create Windows ICO file
- Use an online converter (e.g., https://convertio.co/png-ico/)
- Or use ImageMagick: `magick convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico`
- Save as `assets/icon.ico`

### 3. Create macOS ICNS file
- Use an online converter (e.g., https://cloudconvert.com/png-to-icns)
- Or use `iconutil` on macOS: `iconutil -c icns icon.iconset`
- Save as `assets/icon.icns`

## Current Status

✅ `icon.svg` - Created (source file)
⏳ `icon.png` - Needs to be generated
⏳ `icon.ico` - Needs to be generated  
⏳ `icon.icns` - Needs to be generated

Once all files are created, restart the Electron app to see the new icon!

