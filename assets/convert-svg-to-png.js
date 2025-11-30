// Convert SVG to PNG for Electron icon
// This script requires sharp or puppeteer to convert SVG to PNG
// Run: npm install sharp (recommended) or npm install puppeteer

const fs = require('fs');
const path = require('path');

async function convertSvgToPng() {
    try {
        // Try to use sharp first (faster, lighter)
        let sharp;
        try {
            sharp = require('sharp');
        } catch (e) {
            console.log('⚠️  Sharp not found. Trying puppeteer...');
            const puppeteer = require('puppeteer');
            
            const browser = await puppeteer.launch();
            const page = await browser.newPage();
            
            const svgPath = path.join(__dirname, 'icon.svg');
            const svgContent = fs.readFileSync(svgPath, 'utf8');
            
            await page.setContent(`
                <html>
                    <body style="margin:0;padding:0;">
                        ${svgContent}
                    </body>
                </html>
            `);
            
            const pngPath = path.join(__dirname, 'icon.png');
            await page.screenshot({
                path: pngPath,
                width: 512,
                height: 512,
                clip: { x: 0, y: 0, width: 512, height: 512 }
            });
            
            await browser.close();
            console.log('✅ Created icon.png using puppeteer');
            return;
        }
        
        // Use sharp if available
        const svgPath = path.join(__dirname, 'icon.svg');
        const pngPath = path.join(__dirname, 'icon.png');
        
        await sharp(svgPath)
            .resize(512, 512)
            .png()
            .toFile(pngPath);
        
        console.log('✅ Created icon.png using sharp');
    } catch (error) {
        console.error('❌ Error converting SVG to PNG:', error.message);
        console.log('\n📝 Manual conversion required:');
        console.log('   1. Open assets/icon.svg in a browser (Chrome, Firefox, etc.)');
        console.log('   2. Right-click on the image and "Inspect Element"');
        console.log('   3. Take a screenshot or use browser DevTools to export');
        console.log('   4. Or use an online converter: https://convertio.co/svg-png/');
        console.log('   5. Set size to 512x512 pixels');
        console.log('   6. Save as assets/icon.png');
        console.log('\n💡 Or install sharp: npm install sharp');
        console.log('   Then run: node assets/convert-svg-to-png.js');
    }
}

convertSvgToPng();

