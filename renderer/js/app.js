// Main App Component
const { useState, useEffect } = React;

function App() {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [activeTab, setActiveTab] = useState('dashboard');
    const [connectionStatus, setConnectionStatus] = useState('disconnected');
    const [connectionData, setConnectionData] = useState({ status: 'disconnected', percent: 0, message: '' });
    const [qrCode, setQrCode] = useState(null);
    const [contacts, setContacts] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [campaigns, setCampaigns] = useState([]);
    const [logs, setLogs] = useState([]);
    const [stats, setStats] = useState({});
    const [campaignProgress, setCampaignProgress] = useState(null);

    // Check login status on mount
    useEffect(() => {
        const loggedIn = localStorage.getItem('isLoggedIn') === 'true';
        setIsLoggedIn(loggedIn);
        
        if (loggedIn) {
            loadTemplates();
            loadContacts();
            loadCampaigns();
            loadStats();
            loadLogs();
        }
    }, []);

    // Load initial data (only if logged in)
    useEffect(() => {
        if (isLoggedIn) {
        loadTemplates();
        loadContacts();
        loadCampaigns();
        loadStats();
        loadLogs();

        // Setup IPC listeners
        window.api.receiveMessage('qr-update', (qr) => {
            setQrCode(qr);
        });

        window.api.receiveMessage('connection-status', (data) => {
            setConnectionStatus(data.status);
            setConnectionData(data);
            if (data.status === 'connected') {
                setQrCode(null);
            }
        });

        window.api.receiveMessage('campaign-progress', (progress) => {
            setCampaignProgress(progress);
            if (progress.status === 'completed') {
                loadCampaigns();
                loadStats();
                loadLogs();
                setCampaignProgress(null);
            }
        });

        window.api.receiveMessage('template-saved', (data) => {
            if (data.success) {
                loadTemplates();
            }
        });

        window.api.receiveMessage('csv-uploaded', (data) => {
            if (data.success) {
                loadContacts();
                loadStats();
                
                // Show detailed results
                let message = `✅ Successfully imported ${data.added} contact(s)!`;
                if (data.skipped > 0) {
                    message += `\n⚠️ Skipped ${data.skipped} duplicate(s)`;
                }
                if (data.errors > 0) {
                    message += `\n❌ ${data.errors} error(s) found`;
                }
                
                // Show detailed information if there are issues
                if (data.skipped > 0 || data.errors > 0) {
                    let details = '\n\nDetails:\n';
                    
                    if (data.details && data.details.skipped && data.details.skipped.length > 0) {
                        details += '\n📋 Duplicates (skipped):\n';
                        data.details.skipped.slice(0, 10).forEach(item => {
                            details += `  Row ${item.row}: ${item.name} - ${item.phone} (already exists)\n`;
                        });
                        if (data.details.skipped.length > 10) {
                            details += `  ... and ${data.details.skipped.length - 10} more\n`;
                        }
                    }
                    
                    if (data.details && data.details.errors && data.details.errors.length > 0) {
                        details += '\n❌ Errors:\n';
                        data.details.errors.slice(0, 10).forEach(item => {
                            details += `  Row ${item.row}: ${item.name} - ${item.error}\n`;
                        });
                        if (data.details.errors.length > 10) {
                            details += `  ... and ${data.details.errors.length - 10} more\n`;
                        }
                    }
                    
                    alert(message + details);
                } else {
                    alert(message);
                }
            } else {
                alert('❌ Error importing CSV: ' + (data.error || 'Unknown error'));
            }
        });

        // Don't auto-connect - let user click connect button
        // This prevents errors on startup
        }
    }, [isLoggedIn]);

    const loadTemplates = async () => {
        const data = await window.api.invoke('get-templates');
        setTemplates(data || []);
    };

    const loadContacts = async () => {
        const data = await window.api.invoke('get-contacts');
        setContacts(data || []);
    };

    const loadCampaigns = async () => {
        const data = await window.api.invoke('get-campaigns');
        setCampaigns(data || []);
    };

    const loadStats = async () => {
        const data = await window.api.invoke('get-dashboard-stats');
        setStats(data || {});
    };

    const loadLogs = async (filters = {}) => {
        const data = await window.api.invoke('get-logs', filters);
        setLogs(data || []);
    };

    // Handle login
    const handleLogin = () => {
        setIsLoggedIn(true);
        loadTemplates();
        loadContacts();
        loadCampaigns();
        loadStats();
        loadLogs();
    };

    // Show login screen if not logged in
    if (!isLoggedIn) {
        return React.createElement(LoginTab, { onLogin: handleLogin });
    }

    return (
        <div className="app-container">
            {/* Sidebar Navigation */}
            <div className="app-sidebar">
                <div className="sidebar-header">
                    <div className="sidebar-logo">
                        <div className="sidebar-logo-icon">
                            <svg viewBox="0 0 100 100" style={{width: '32px', height: '32px'}} xmlns="http://www.w3.org/2000/svg">
                                <defs>
                                    <linearGradient id="sidebarLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                        <stop offset="0%" stopColor="#10b981" stopOpacity={1} />
                                        <stop offset="100%" stopColor="#059669" stopOpacity={1} />
                                    </linearGradient>
                                    <radialGradient id="sidebarGlowGrad" cx="50%" cy="50%">
                                        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.8" />
                                        <stop offset="50%" stopColor="#ffffff" stopOpacity="0.4" />
                                        <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                                    </radialGradient>
                                    <radialGradient id="sidebarWhiteGlow" cx="75%" cy="50%">
                                        <stop offset="0%" stopColor="#ffffff" stopOpacity={1} />
                                        <stop offset="40%" stopColor="#ffffff" stopOpacity="0.9" />
                                        <stop offset="100%" stopColor="#e5f9f0" stopOpacity="0.6" />
                                    </radialGradient>
                                </defs>
                                <rect x="20" y="20" width="60" height="60" rx="12" fill="url(#sidebarLogoGrad)"/>
                                <rect x="20" y="20" width="60" height="60" rx="12" fill="none" stroke="#34d399" strokeWidth="0.5" opacity="0.3"/>
                                <circle cx="50" cy="50" r="20" fill="none"/>
                                <path d="M 50 30 A 20 20 0 0 1 50 70 L 50 50 Z" fill="#059669" opacity="0.7"/>
                                <path d="M 50 30 A 20 20 0 0 0 50 70 L 50 50 Z" fill="url(#sidebarWhiteGlow)"/>
                                <circle cx="50" cy="50" r="10" fill="url(#sidebarGlowGrad)" opacity="0.6"/>
                                <ellipse cx="60" cy="50" rx="8" ry="12" fill="#ffffff" opacity="0.9"/>
                            </svg>
                        </div>
                        <h2 className="sidebar-title">Wapiea</h2>
                    </div>
                <div>
                        <span className={`sidebar-status status-badge status-${connectionStatus === 'connected' ? 'connected' : 'disconnected'}`}>
                        {connectionStatus === 'connected' ? '🟢 Connected' : '🔴 Disconnected'}
                    </span>
                </div>
            </div>

                <nav className="sidebar-nav">
                    <div 
                        className={`sidebar-nav-item ${activeTab === 'connection' ? 'active' : ''}`} 
                        onClick={() => setActiveTab('connection')}
                    >
                        <span className="sidebar-nav-item-icon">🔗</span>
                        <span className="sidebar-nav-item-text">Connection</span>
                    </div>
                    <div 
                        className={`sidebar-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} 
                        onClick={() => setActiveTab('dashboard')}
                    >
                        <span className="sidebar-nav-item-icon">📊</span>
                        <span className="sidebar-nav-item-text">Dashboard</span>
                    </div>
                    <div 
                        className={`sidebar-nav-item ${activeTab === 'contacts' ? 'active' : ''}`} 
                        onClick={() => setActiveTab('contacts')}
                    >
                        <span className="sidebar-nav-item-icon">👥</span>
                        <span className="sidebar-nav-item-text">Contacts</span>
                    </div>
                    <div 
                        className={`sidebar-nav-item ${activeTab === 'templates' ? 'active' : ''}`} 
                        onClick={() => setActiveTab('templates')}
                    >
                        <span className="sidebar-nav-item-icon">📝</span>
                        <span className="sidebar-nav-item-text">Templates</span>
                    </div>
                    <div 
                        className={`sidebar-nav-item ${activeTab === 'campaign' ? 'active' : ''}`} 
                        onClick={() => setActiveTab('campaign')}
                    >
                        <span className="sidebar-nav-item-icon">🚀</span>
                        <span className="sidebar-nav-item-text">Campaign</span>
                    </div>
                    <div 
                        className={`sidebar-nav-item ${activeTab === 'chats' ? 'active' : ''}`} 
                        onClick={() => setActiveTab('chats')}
                    >
                        <span className="sidebar-nav-item-icon">💬</span>
                        <span className="sidebar-nav-item-text">My Chats</span>
                    </div>
                    <div 
                        className={`sidebar-nav-item ${activeTab === 'logs' ? 'active' : ''}`} 
                        onClick={() => setActiveTab('logs')}
                    >
                        <span className="sidebar-nav-item-icon">📋</span>
                        <span className="sidebar-nav-item-text">Logs</span>
                    </div>
                    <div 
                        className={`sidebar-nav-item ${activeTab === 'automated-messages' ? 'active' : ''}`} 
                        onClick={() => setActiveTab('automated-messages')}
                    >
                        <span className="sidebar-nav-item-icon">🤖</span>
                        <span className="sidebar-nav-item-text">Auto Messages</span>
                    </div>
                </nav>

                <div className="sidebar-footer">
                    <div className="sidebar-footer-text">
                        <strong>Powered By</strong><br />
                        Cripcocode Technologies<br />
                        Pvt Ltd
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="app-main">
                <div className="header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <h1 style={{ margin: 0, fontSize: '28px' }}>
                            {activeTab === 'connection' && '🔗 Connection'}
                            {activeTab === 'dashboard' && '📊 Dashboard'}
                            {activeTab === 'contacts' && '👥 Contacts'}
                            {activeTab === 'templates' && '📝 Templates'}
                            {activeTab === 'campaign' && '🚀 Campaign'}
                            {activeTab === 'chats' && '💬 My Chats'}
                            {activeTab === 'logs' && '📋 Logs'}
                            {activeTab === 'automated-messages' && '🤖 Automated Messages'}
                        </h1>
                    </div>
            </div>

            <div className="content-panel">
                {activeTab === 'connection' && <ConnectionTab qrCode={qrCode} connectionStatus={connectionStatus} connectionData={connectionData} />}
                    {activeTab === 'dashboard' && <DashboardTab stats={stats} campaigns={campaigns} onReload={loadCampaigns} />}
                {activeTab === 'contacts' && <ContactsTab contacts={contacts} onReload={loadContacts} />}
                {activeTab === 'templates' && <TemplatesTab templates={templates} onReload={loadTemplates} />}
                {activeTab === 'campaign' && <CampaignTab templates={templates} contacts={contacts} onReload={loadCampaigns} progress={campaignProgress} />}
                    {activeTab === 'chats' && <ChatsTab connectionStatus={connectionStatus} />}
                {activeTab === 'logs' && <LogsTab logs={logs} onReload={loadLogs} />}
                {activeTab === 'automated-messages' && <AutomatedMessagesTab onReload={loadStats} />}
                </div>
            </div>
        </div>
    );
}

// Initialize app when DOM is ready
if (typeof React === 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('root').innerHTML = '<div style="padding: 20px; color: red;"><h2>Error: React library failed to load</h2><p>Please check your internet connection and try again.</p></div>';
    });
} else if (typeof window.api === 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('root').innerHTML = '<div style="padding: 20px; color: red;"><h2>Error: Electron API not available</h2><p>Please restart the application.</p></div>';
    });
} else {
    console.log('Starting React app...');
    
    const renderApp = () => {
        try {
            ReactDOM.render(<App />, document.getElementById('root'));
            console.log('React app rendered successfully');
        } catch (error) {
            console.error('Error rendering React app:', error);
            document.getElementById('root').innerHTML = `
                <div style="padding: 20px; color: red;">
                    <h2>Error Loading Application</h2>
                    <p>${error.message}</p>
                    <p>Check the console for more details.</p>
                </div>
            `;
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', renderApp);
    } else {
        renderApp();
    }
}

