// ConnectionTab Component
function ConnectionTab({ qrCode, connectionStatus, connectionData }) {
    const { useState, useEffect } = React;
    const qrContainerRef = React.useRef(null);
    const [isConnecting, setIsConnecting] = useState(false);
    const [loadingProgress, setLoadingProgress] = useState(0);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [phoneNumber, setPhoneNumber] = useState(null);

    useEffect(() => {
        if (qrCode && qrContainerRef.current) {
            qrContainerRef.current.innerHTML = '';
            if (typeof QRCode !== 'undefined') {
                try {
                    new QRCode(qrContainerRef.current, {
                        text: qrCode,
                        width: 240,
                        height: 240,
                        colorDark: '#000000',
                        colorLight: '#ffffff',
                        correctLevel: QRCode.CorrectLevel.H
                    });
                } catch (error) {
                    console.error('QR Code generation error:', error);
                    qrContainerRef.current.innerHTML = '<p style="color: red;">Error generating QR code. Check console.</p>';
                }
            }
        } else if (qrContainerRef.current) {
            qrContainerRef.current.innerHTML = '';
        }
    }, [qrCode]);

    // Handle connection status changes
    useEffect(() => {
        if (connectionData && connectionData.percent !== undefined) {
            setLoadingProgress(connectionData.percent);
        }
        if (connectionData && connectionData.message) {
            setLoadingMessage(connectionData.message);
        }

        if (connectionStatus === 'loading') {
            setIsConnecting(true);
            setLoadingMessage(connectionData.message || 'Initializing WhatsApp connection...');
            setLoadingProgress(connectionData.percent || 10);
        } else if (connectionStatus === 'authenticated') {
            setIsConnecting(true);
            setLoadingProgress(connectionData.percent || 75);
            setLoadingMessage(connectionData.message || 'Authentication successful! Finalizing connection...');
        } else if (qrCode) {
            setIsConnecting(true);
            setLoadingProgress(connectionData.percent || 30);
            setLoadingMessage('Waiting for QR code scan...');
        } else if (connectionStatus === 'connected') {
            setIsConnecting(false);
            setLoadingProgress(100);
            setLoadingMessage('');
            // Get phone number if available
            if (connectionData && connectionData.phoneNumber) {
                setPhoneNumber(connectionData.phoneNumber);
            } else {
                // Try to fetch phone number
                window.api.invoke('get-phone-number').then(num => {
                    if (num) setPhoneNumber(num);
                }).catch(err => console.error('Error fetching phone number:', err));
            }
        } else if (connectionStatus === 'reconnecting') {
            setIsConnecting(true);
            setLoadingProgress(connectionData.percent || 10);
            setLoadingMessage(connectionData.message || 'Reconnecting... Please wait for QR code.');
        } else if (connectionStatus === 'disconnected') {
            setPhoneNumber(null);
            setIsConnecting(false);
            setLoadingProgress(0);
            setLoadingMessage('');
        } else if (connectionStatus === 'auth_failure') {
            setIsConnecting(false);
            setLoadingProgress(0);
            setLoadingMessage('Authentication failed. Please try again.');
        }
    }, [connectionStatus, qrCode, connectionData]);

    const handleConnect = () => {
        setIsConnecting(true);
        setLoadingProgress(10);
        setLoadingMessage('Starting connection...');
        window.api.sendMessage('whatsapp-connect');
    };

    const handleDisconnect = () => {
        setIsConnecting(false);
        setLoadingProgress(0);
        setLoadingMessage('');
        window.api.sendMessage('whatsapp-disconnect');
    };

    const handleReconnect = () => {
        handleConnect();
    };

    // Determine if we're in a connecting/reconnecting state
    const isConnectingState = isConnecting || connectionStatus === 'loading' || connectionStatus === 'authenticated' || connectionStatus === 'reconnecting' || (qrCode && connectionStatus !== 'connected');

    return (
        <div>
            <h2 style={{ 
                marginBottom: '16px', 
                background: 'var(--primary-gradient)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                fontSize: '18px',
                fontWeight: '800',
                letterSpacing: '-0.3px'
            }}>🔗 WhatsApp Connection</h2>
            
            {/* Loading/Connecting State */}
            {isConnectingState && (
                <div className="card" style={{ 
                    marginBottom: '24px',
                    background: connectionStatus === 'authenticated' 
                        ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 150, 105, 0.1) 100%)'
                        : 'linear-gradient(135deg, rgba(0, 191, 255, 0.05) 0%, rgba(16, 185, 129, 0.05) 100%)',
                    border: connectionStatus === 'authenticated'
                        ? '2px solid rgba(16, 185, 129, 0.3)'
                        : '2px solid rgba(0, 191, 255, 0.2)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
                        {connectionStatus === 'authenticated' ? (
                            <span style={{ fontSize: '28px', marginRight: '16px' }}>✅</span>
                        ) : (
                            <div className="loading" style={{ marginRight: '16px', width: '24px', height: '24px' }}></div>
                        )}
                        <h3 style={{ margin: 0, color: connectionStatus === 'authenticated' ? '#10b981' : '#00BFFF', fontSize: '14px', fontWeight: '700' }}>
                            {connectionStatus === 'authenticated' ? '🔐 Authentication Successful! Finalizing connection...' : 
                             qrCode ? '📱 Waiting for QR Scan...' : 
                             '⚡ Connecting to WhatsApp...'}
                        </h3>
                    </div>
                    
                    {loadingMessage && (
                        <p style={{ 
                            color: connectionStatus === 'authenticated' ? '#065f46' : '#6b7280', 
                            marginBottom: '15px',
                            fontWeight: connectionStatus === 'authenticated' ? '600' : '400'
                        }}>
                            {loadingMessage}
                        </p>
                    )}
                    
                    {/* Progress Bar */}
                    <div className="progress-bar">
                        <div 
                            className="progress-fill" 
                            style={{ 
                                width: `${loadingProgress}%`,
                                animation: loadingProgress < 100 ? 'pulse 1.5s ease-in-out infinite' : 'none',
                                background: connectionStatus === 'authenticated' 
                                    ? 'linear-gradient(90deg, #10b981 0%, #059669 100%)'
                                    : 'var(--primary-gradient)'
                            }}
                        ></div>
                    </div>
                    
                    {loadingProgress > 0 && loadingProgress < 100 && (
                        <p style={{ 
                            textAlign: 'center', 
                            marginTop: '10px', 
                            fontSize: '13px', 
                            color: connectionStatus === 'authenticated' ? '#065f46' : '#6b7280',
                            fontWeight: connectionStatus === 'authenticated' ? '600' : '400'
                        }}>
                            {loadingProgress}% - {loadingMessage || 'Connecting...'}
                        </p>
                    )}
                    
                    {connectionStatus === 'authenticated' && (
                        <div style={{
                            marginTop: '16px',
                            padding: '12px',
                            background: 'rgba(16, 185, 129, 0.1)',
                            borderRadius: '8px',
                            border: '1px solid rgba(16, 185, 129, 0.2)'
                        }}>
                            <p style={{ margin: 0, fontSize: '13px', color: '#065f46', fontWeight: '500' }}>
                                💡 Please wait while we complete the connection. This may take a few seconds...
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* QR Code Display */}
            {qrCode && connectionStatus !== 'connected' && (
                <div className="qr-container">
                    <h3 style={{ 
                        marginBottom: '16px', 
                        color: '#00BFFF',
                        fontSize: '14px',
                        fontWeight: '700',
                        letterSpacing: '-0.2px'
                    }}>📱 Scan QR Code with WhatsApp</h3>
                    <div ref={qrContainerRef} style={{ display: 'inline-block', margin: '20px 0', padding: '15px', background: 'white', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}></div>
                    <div style={{ 
                        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(147, 51, 234, 0.1) 100%)',
                        padding: '20px',
                        borderRadius: '12px',
                        marginTop: '24px',
                        border: '2px solid rgba(59, 130, 246, 0.2)'
                    }}>
                        <p style={{ color: '#1e40af', margin: 0, fontWeight: '700', marginBottom: '12px', fontSize: '16px' }}>📋 Instructions:</p>
                        <ol style={{ color: '#1e40af', margin: 0, paddingLeft: '24px', lineHeight: '1.8' }}>
                            <li style={{ marginBottom: '8px' }}>Open WhatsApp on your phone</li>
                            <li style={{ marginBottom: '8px' }}>Go to Settings → Linked Devices</li>
                            <li style={{ marginBottom: '8px' }}>Tap "Link a Device"</li>
                            <li>Point your phone at this QR code</li>
                        </ol>
                    </div>
                    <p style={{ color: '#6b7280', marginTop: '15px', fontSize: '14px', fontStyle: 'italic' }}>
                        The QR code will expire in a few minutes. If it expires, click "Reconnect" to generate a new one.
                    </p>
                </div>
            )}

            {/* Not Connected State */}
            {!isConnectingState && connectionStatus !== 'connected' && !qrCode && (
                <div className="card">
                    <h3 style={{ color: '#6b7280', marginBottom: '10px' }}>Not Connected</h3>
                    <p style={{ color: '#6b7280' }}>Click "Connect WhatsApp" to start the connection process and generate a QR code.</p>
                </div>
            )}

            {/* Connected State */}
            {connectionStatus === 'connected' && (
                <div className="card" style={{ 
                    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 150, 105, 0.1) 100%)',
                    border: '2px solid #10b981',
                    boxShadow: '0 8px 24px rgba(16, 185, 129, 0.2)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
                        <span style={{ fontSize: '32px', marginRight: '12px' }}>✅</span>
                        <h3 style={{ color: '#10b981', margin: 0, fontSize: '16px', fontWeight: '800' }}>Successfully Connected!</h3>
                    </div>
                    <p style={{ color: '#065f46', margin: 0, marginBottom: '10px' }}>
                        Your WhatsApp is connected and ready to send messages.
                    </p>
                    {(phoneNumber || (connectionData && connectionData.phoneNumber)) && (
                        <div style={{ 
                            background: 'white', 
                            padding: '12px 16px', 
                            borderRadius: '8px', 
                            marginTop: '10px',
                            border: '1px solid #d1fae5'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ fontSize: '20px' }}>📱</span>
                                <div>
                                    <p style={{ margin: 0, fontSize: '12px', color: '#6b7280', fontWeight: '600' }}>
                                        Connected Phone Number:
                                    </p>
                                    <p style={{ margin: '4px 0 0 0', fontSize: '18px', color: '#10b981', fontWeight: '700' }}>
                                        +{phoneNumber || (connectionData && connectionData.phoneNumber)}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Error State */}
            {connectionStatus === 'auth_failure' && (
                <div className="card" style={{ background: '#fef2f2', border: '2px solid #ef4444' }}>
                    <h3 style={{ color: '#ef4444', marginBottom: '10px' }}>❌ Authentication Failed</h3>
                    <p style={{ color: '#991b1b' }}>Failed to authenticate with WhatsApp. Please try connecting again.</p>
                </div>
            )}

            {/* Action Buttons */}
            <div style={{ marginTop: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {connectionStatus === 'connected' ? (
                    <React.Fragment>
                        <button className="btn btn-success" disabled style={{ opacity: 0.7 }}>
                            ✅ Connected
                        </button>
                        <button className="btn btn-danger" onClick={handleDisconnect}>
                            Disconnect
                        </button>
                    </React.Fragment>
                ) : isConnectingState ? (
                    <React.Fragment>
                        <button className="btn btn-secondary" onClick={handleReconnect} disabled={!qrCode}>
                            {qrCode ? '🔄 Regenerate QR Code' : 'Connecting...'}
                        </button>
                        <button className="btn btn-danger" onClick={handleDisconnect}>
                            Cancel
                        </button>
                    </React.Fragment>
                ) : (
                    <button className="btn btn-primary" onClick={handleConnect}>
                        🔗 Connect WhatsApp
                    </button>
                )}
            </div>
        </div>
    );
}

