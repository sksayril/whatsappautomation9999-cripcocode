# Fixing NSIS Icon Error

## Problem
NSIS installer requires `.ico` format for icons, not `.png`. The error was:
```
Error while loading icon from "assets/icon.png": invalid icon file
```

## Solution Applied
Removed icon references from NSIS config. The installer will now use default Electron icons.

## To Add Custom ICO Icon (Optional)

1. **Convert PNG to ICO:**
   - Go to https://convertio.co/png-ico/
   - Upload `assets/icon.png`
   - Download as `assets/icon.ico`
   - Make sure it includes multiple sizes (16x16, 32x32, 48x48, 256x256)

2. **Update package.json:**
   ```json
   "nsis": {
     "installerIcon": "assets/icon.ico",
     "uninstallerIcon": "assets/icon.ico",
     "installerHeaderIcon": "assets/icon.ico"
   }
   ```

3. **Rebuild:**
   ```bash
   npm run build:win
   ```

## Current Status
✅ Build works without custom ICO icons
✅ Installer created: `dist/Wapiea-1.0.0-Setup.exe`
✅ Uninstaller included in installer

The app icon (in taskbar/window) uses `assets/icon.png` which works fine.
Only the installer/uninstaller icons need ICO format.

