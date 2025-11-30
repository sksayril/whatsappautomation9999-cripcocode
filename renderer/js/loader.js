// Script loader for Babel transpilation - tries multiple methods
async function loadBabelScript(src) {
    try {
        let code = null;
        
        // Method 1: Try using Electron IPC (most reliable)
        if (window.api && window.api.invoke) {
            try {
                const result = await window.api.invoke('read-file', src);
                if (result.success) {
                    code = result.content;
                }
            } catch (e) {
                console.log('IPC method failed, trying XHR...');
            }
        }
        
        // Method 2: Try XMLHttpRequest (works with file:// protocol)
        if (!code) {
            code = await new Promise((resolve, reject) => {
                const basePath = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/'));
                const fullPath = basePath + '/' + src;
                
                const xhr = new XMLHttpRequest();
                xhr.open('GET', fullPath, true);
                xhr.onreadystatechange = function() {
                    if (xhr.readyState === 4) {
                        if (xhr.status === 200 || xhr.status === 0) {
                            resolve(xhr.responseText);
                        } else {
                            reject(new Error(`HTTP ${xhr.status}`));
                        }
                    }
                };
                xhr.onerror = () => reject(new Error('Network error'));
                xhr.send();
            });
        }
        
        if (!code) {
            throw new Error('Could not load file');
        }
        
        // Transform JSX to JavaScript using Babel
        const transformed = Babel.transform(code, {
            presets: ['react']
        }).code;
        
        // Execute the transformed code
        const script = document.createElement('script');
        script.textContent = transformed;
        document.head.appendChild(script);
        console.log('Loaded:', src);
    } catch (error) {
        console.error('Error loading script:', src, error);
        throw error;
    }
}

// Load all components in order
async function loadComponents() {
    const components = [
        'js/components/ConnectionTab.js',
        'js/components/DashboardTab.js',
        'js/components/ContactsTab.js',
        'js/components/TemplatesTab.js',
        'js/components/CampaignTab.js',
        'js/components/ChatsTab.js',
        'js/components/LogsTab.js',
        'js/components/LoginTab.js',
        'js/components/AutomatedMessagesTab.js',
        'js/app.js'
    ];

    try {
        for (const component of components) {
            await loadBabelScript(component);
        }
        console.log('All components loaded successfully');
    } catch (error) {
        console.error('Failed to load components:', error);
        const root = document.getElementById('root');
        if (root) {
            root.innerHTML = `
                <div style="padding: 20px; color: red;">
                    <h2>Error Loading Components</h2>
                    <p>${error.message}</p>
                    <p>File: ${error.message.includes('js/components') ? error.message : 'Unknown'}</p>
                    <p>Check the console for more details.</p>
                    <p>Current location: ${window.location.href}</p>
                </div>
            `;
        }
    }
}

// Start loading when Babel is ready
if (typeof Babel !== 'undefined') {
    loadComponents();
} else {
    // Wait for Babel to load
    const checkBabel = setInterval(() => {
        if (typeof Babel !== 'undefined') {
            clearInterval(checkBabel);
            loadComponents();
        }
    }, 100);
    
    // Timeout after 5 seconds
    setTimeout(() => {
        clearInterval(checkBabel);
        if (typeof Babel === 'undefined') {
            console.error('Babel failed to load');
        }
    }, 5000);
}

