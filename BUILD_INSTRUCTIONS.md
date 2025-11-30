# Building Wapiea Executable and Installer

## Prerequisites

1. **Node.js** (v16 or higher)
2. **npm** (comes with Node.js)
3. **Windows** (for building Windows installer)

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Generate Icon Files

Before building, you need to create the icon files:

1. **For Windows (.ico file):**
   - Open `assets/icon.svg` in an image editor
   - Export as PNG (512x512)
   - Convert PNG to ICO using an online tool (e.g., https://convertio.co/png-ico/)
   - Save as `assets/icon.ico`

2. **Or use the existing PNG:**
   - The build will use `assets/icon.png` if `.ico` is not available

## Step 3: Build the Installer

### Option 1: Build Windows Installer (Recommended)
```bash
npm run build:win
```

This will create:
- `dist/Wapiea-1.0.0-Setup.exe` - Full installer with uninstall option
- The installer includes:
  - ✅ Custom installation directory selection
  - ✅ Desktop shortcut
  - ✅ Start menu shortcut
  - ✅ Uninstaller in Windows Programs & Features
  - ✅ Option to keep/remove user data on uninstall

### Option 2: Build Portable Version
```bash
npm run build:win:portable
```

This creates a portable `.exe` that doesn't require installation.

### Option 3: Build for Testing (Unpacked)
```bash
npm run pack
```

This creates an unpacked version in `dist/win-unpacked/` for testing.

## Step 4: Find Your Build

After building, find your installer in:
```
dist/
├── Wapiea-1.0.0-Setup.exe  ← Windows Installer
└── win-unpacked/           ← Unpacked app (for testing)
```

## Installation Features

The installer includes:
- ✅ **Custom Installation Path** - Users can choose where to install
- ✅ **Desktop Shortcut** - Creates shortcut on desktop
- ✅ **Start Menu Entry** - Adds to Windows Start Menu
- ✅ **Uninstaller** - Can be removed via Windows Settings > Apps
- ✅ **Data Persistence** - User data (sessions, database) is preserved

## Uninstalling

Users can uninstall Wapiea by:
1. Opening **Windows Settings** > **Apps**
2. Finding **Wapiea** in the list
3. Clicking **Uninstall**
4. Or using **Control Panel** > **Programs and Features**

## Troubleshooting

### Error: "icon.ico not found"
- Create `assets/icon.ico` from `assets/icon.png`
- Or the build will use `icon.png` automatically

### Error: "electron-builder not found"
```bash
npm install electron-builder --save-dev
```

### Build fails with module errors
```bash
npm run rebuild
npm run build:win
```

## Build Configuration

The build configuration is in `package.json` under the `"build"` section:
- **appId**: `com.wapiea.app`
- **productName**: `Wapiea`
- **Output**: `dist/` folder
- **Installer**: NSIS (Nullsoft Scriptable Install System)

## Notes

- The installer is signed with the publisher name: "Cripcocode Technologies Pvt Ltd"
- User data (database, sessions) is stored in the installation directory
- The uninstaller will ask whether to keep user data

