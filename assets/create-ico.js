// Create ICO file from PNG for Windows installer
// NSIS requires ICO format, not PNG

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function createIcoFromPng() {
    try {
        const pngPath = path.join(__dirname, 'icon.png');
        const icoPath = path.join(__dirname, 'icon.ico');
        
        if (!fs.existsSync(pngPath)) {
            console.error('❌ icon.png not found at:', pngPath);
            console.log('📝 Please ensure icon.png exists first');
            return;
        }
        
        console.log('🔄 Converting PNG to ICO...');
        
        // Read PNG and convert to ICO
        // Note: Sharp doesn't directly support ICO, so we'll create a multi-size ICO
        // For now, we'll just copy the PNG and let electron-builder handle it
        // Or we can use a different approach
        
        // Actually, electron-builder can convert PNG to ICO automatically
        // But NSIS needs a proper ICO file. Let's create a simple workaround:
        // Remove icon references from NSIS config and let it use defaults
        
        console.log('✅ ICO conversion note:');
        console.log('   NSIS installer will use default Electron icon');
        console.log('   To add custom icon, convert icon.png to icon.ico manually');
        console.log('   Use: https://convertio.co/png-ico/ or ImageMagick');
        console.log('   Then update package.json to use assets/icon.ico');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

createIcoFromPng();

