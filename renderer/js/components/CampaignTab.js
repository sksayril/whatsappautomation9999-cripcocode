// CampaignTab Component
function CampaignTab({ templates, contacts, onReload, progress }) {
    const { useState, useEffect } = React;
    const [campaignName, setCampaignName] = useState('');
    const [selectedTemplate, setSelectedTemplate] = useState('');
    const [selectedContacts, setSelectedContacts] = useState([]);
    const [delay, setDelay] = useState(5000);
    const [randomDelay, setRandomDelay] = useState({ enabled: false, min: 1000, max: 9000 });
    const [pauseAfter, setPauseAfter] = useState(0);
    const [mediaPath, setMediaPath] = useState('');
    const [dailyLimit, setDailyLimit] = useState(1000);
    const [totalLimit, setTotalLimit] = useState(1000);
    const [isCreating, setIsCreating] = useState(false);
    const [createdCampaignId, setCreatedCampaignId] = useState(null);

    // Listen for campaign started response
    useEffect(() => {
        const handleCampaignStarted = (data) => {
            if (data.success) {
                var campaignId = null;
                if (data.campaign && data.campaign.id) {
                    campaignId = data.campaign.id;
                }
                setCreatedCampaignId(campaignId);
                // Keep button disabled after campaign is created
                // Reset form after a delay
                setTimeout(() => {
                    setIsCreating(false);
                    // Optionally reset form
                    // setCampaignName('');
                    // setSelectedContacts([]);
                    // setCreatedCampaignId(null);
                }, 2000);
            } else {
                // Re-enable button on error
                setIsCreating(false);
                setCreatedCampaignId(null);
                if (data.error) {
                    alert('❌ Error: ' + data.error);
                }
            }
        };

        window.api.receiveMessage('campaign-started', handleCampaignStarted);
        
        return () => {
            // Cleanup listener if needed
        };
    }, []);

    const handleStart = async () => {
        // Prevent multiple clicks
        if (isCreating) {
            return;
        }

        if (!campaignName) {
            alert('❌ Please enter a campaign name');
            return;
        }
        if (selectedContacts.length === 0) {
            alert('❌ Please select at least one contact');
            return;
        }
        
        if (dailyLimit < 1 || dailyLimit > 1000) {
            alert('❌ Daily limit must be between 1 and 1000');
            return;
        }
        
        if (totalLimit < 1 || totalLimit > 1000) {
            alert('❌ Total limit must be between 1 and 1000');
            return;
        }

        // Block button and form
        setIsCreating(true);
        setCreatedCampaignId(null);

        try {
        window.api.sendMessage('start-campaign', {
            name: campaignName,
            templateId: selectedTemplate || null,
            contactIds: selectedContacts,
            delay,
            randomDelay: randomDelay.enabled ? randomDelay : null,
            pauseAfter: pauseAfter || null,
                mediaPath: mediaPath || null,
                dailyLimit: parseInt(dailyLimit),
                totalLimit: parseInt(totalLimit)
        });

            // Reload campaigns list
            setTimeout(() => {
                if (onReload) onReload();
            }, 1000);
        } catch (error) {
            setIsCreating(false);
            alert('❌ Error starting campaign: ' + (error.message || 'Unknown error'));
        }
    };

    const handleSelectMedia = async () => {
        const result = await window.api.invoke('select-media-file');
        if (!result.canceled) {
            setMediaPath(result.filePaths[0]);
        }
    };

    const toggleContact = (id) => {
        if (selectedContacts.includes(id)) {
            setSelectedContacts(selectedContacts.filter(cid => cid !== id));
        } else {
            setSelectedContacts(selectedContacts.concat([id]));
        }
    };

    const selectAll = () => {
        setSelectedContacts(contacts.map(c => c.id));
    };

    const deselectAll = () => {
        setSelectedContacts([]);
    };

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
            }}>🚀 Create Campaign</h2>

            {progress && (
                <div className="card" style={{ marginBottom: '12px', background: '#f0fdf4' }}>
                    <h3 style={{ marginBottom: '8px', fontSize: '14px' }}>Campaign Progress</h3>
                    <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${(progress.current / progress.total) * 100}%` }}></div>
                    </div>
                    <p>Progress: {progress.current} / {progress.total}</p>
                    <p>Sent: {progress.sent} | Failed: {progress.failed}</p>
                    {progress.status === 'completed' && (
                        <p style={{ color: '#10b981', fontWeight: 'bold', marginTop: '10px' }}>✅ Campaign Completed!</p>
                    )}
                </div>
            )}

            <div className="card">
                <div className="input-group">
                    <label>Campaign Name</label>
                    <input 
                        type="text" 
                        value={campaignName} 
                        onChange={(e) => setCampaignName(e.target.value)} 
                        placeholder="My Campaign"
                        disabled={isCreating}
                    />
                </div>

                <div className="input-group">
                    <label>Template (Optional)</label>
                    <select 
                        value={selectedTemplate} 
                        onChange={(e) => setSelectedTemplate(e.target.value)}
                        disabled={isCreating}
                    >
                        <option value="">No Template (Use contact's custom message)</option>
                        {templates.map(t => (
                            <option key={t.id} value={t.id}>{t.title}</option>
                        ))}
                    </select>
                </div>

                <div className="input-group">
                    <label>Select Contacts ({selectedContacts.length} selected)</label>
                    <div style={{ marginBottom: '10px' }}>
                        <button 
                            className="btn btn-secondary" 
                            style={{ padding: '6px 12px', fontSize: '12px', marginRight: '10px' }} 
                            onClick={selectAll}
                            disabled={isCreating}
                        >
                            Select All
                        </button>
                        <button 
                            className="btn btn-secondary" 
                            style={{ padding: '6px 12px', fontSize: '12px' }} 
                            onClick={deselectAll}
                            disabled={isCreating}
                        >
                            Deselect All
                        </button>
                    </div>
                    <div className="checkbox-group">
                        {contacts.map(contact => (
                            <div className="checkbox-item" key={contact.id}>
                                <input 
                                    type="checkbox" 
                                    checked={selectedContacts.includes(contact.id)}
                                    onChange={() => toggleContact(contact.id)}
                                    disabled={isCreating}
                                />
                                <span>{contact.name} - {contact.phone}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="input-group">
                    <label>Delay (ms)</label>
                    <input 
                        type="number" 
                        value={delay} 
                        onChange={(e) => setDelay(parseInt(e.target.value))} 
                        min="1000" 
                        step="1000"
                        disabled={isCreating}
                    />
                </div>

                <div className="input-group">
                    <label className="checkbox-label">
                        <span className="toggle-switch">
                        <input 
                            type="checkbox" 
                            checked={randomDelay.enabled}
                            onChange={(e) => setRandomDelay(Object.assign({}, randomDelay, { enabled: e.target.checked }))}
                                disabled={isCreating}
                            />
                            <span className="toggle-slider"></span>
                        </span>
                        <span style={{ flex: 1 }}>
                            Random Delay (1-9 seconds between messages)
                        </span>
                    </label>
                    {randomDelay.enabled && (
                        <div className="input-range-group" style={{ marginTop: '12px' }}>
                            <input 
                                type="number" 
                                value={randomDelay.min} 
                                onChange={(e) => setRandomDelay(Object.assign({}, randomDelay, { min: parseInt(e.target.value) || 1000 }))}
                                placeholder="Min (ms)"
                                min="1000"
                                step="1000"
                                disabled={isCreating}
                            />
                            <span className="range-separator">-</span>
                            <input 
                                type="number" 
                                value={randomDelay.max} 
                                onChange={(e) => setRandomDelay(Object.assign({}, randomDelay, { max: parseInt(e.target.value) || 9000 }))}
                                placeholder="Max (ms)"
                                min="1000"
                                step="1000"
                                disabled={isCreating}
                            />
                        </div>
                    )}
                </div>

                <div className="input-group">
                    <label style={{ marginBottom: '8px', display: 'block', fontWeight: '500', color: 'var(--text-primary)' }}>
                        Pause After X Messages (0 = no pause)
                    </label>
                    <input 
                        type="number" 
                        value={pauseAfter} 
                        onChange={(e) => setPauseAfter(parseInt(e.target.value) || 0)} 
                        min="0"
                        placeholder="0"
                        disabled={isCreating}
                    />
                </div>

                <div className="input-group">
                    <label style={{ marginBottom: '8px', display: 'block', fontWeight: '500', color: 'var(--text-primary)' }}>
                        Media File (Optional - Image/PDF)
                    </label>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <button 
                            className="btn btn-secondary" 
                            onClick={handleSelectMedia}
                            disabled={isCreating}
                            style={{ 
                                padding: '10px 20px',
                                borderRadius: 'var(--border-radius-sm)',
                                border: '2px solid rgba(16, 185, 129, 0.3)',
                                background: 'rgba(255, 255, 255, 0.9)',
                                color: '#10b981',
                                fontWeight: '600',
                                transition: 'all 0.3s ease',
                                cursor: isCreating ? 'not-allowed' : 'pointer'
                            }}
                        >
                            📎 Select Media
                        </button>
                        {mediaPath && (
                            <span style={{ 
                                alignSelf: 'center', 
                                color: '#10b981',
                                fontWeight: '500',
                                fontSize: '14px',
                                padding: '8px 12px',
                                background: 'rgba(16, 185, 129, 0.1)',
                                borderRadius: 'var(--border-radius-sm)',
                                maxWidth: '200px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                            }}>
                                {mediaPath.split(/[/\\]/).pop()}
                            </span>
                        )}
                    </div>
                </div>

                <div style={{ 
                    marginTop: '24px',
                    padding: '20px',
                    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(147, 51, 234, 0.1) 100%)',
                    borderRadius: '12px',
                    border: '2px solid rgba(59, 130, 246, 0.2)'
                }}>
                    <h3 style={{ marginBottom: '12px', color: '#00BFFF', fontSize: '14px', fontWeight: '700' }}>
                        📊 Message Limits
                    </h3>
                    
                    <div className="input-group" style={{ marginBottom: '16px' }}>
                        <label>24-Hour Limit (1-1000 messages)</label>
                        <input 
                            type="number" 
                            value={dailyLimit} 
                            onChange={(e) => {
                                const val = parseInt(e.target.value) || 1000;
                                setDailyLimit(Math.min(Math.max(1, val), 1000));
                            }} 
                            min="1" 
                            max="1000"
                            placeholder="1000"
                            disabled={isCreating}
                        />
                        <p style={{ marginTop: '6px', fontSize: '10px', color: '#6b7280' }}>
                            Maximum messages that can be sent in 24 hours for this campaign
                        </p>
                    </div>

                    <div className="input-group">
                        <label>Total Limit (1-1000 messages)</label>
                        <input 
                            type="number" 
                            value={totalLimit} 
                            onChange={(e) => {
                                const val = parseInt(e.target.value) || 1000;
                                setTotalLimit(Math.min(Math.max(1, val), 1000));
                            }} 
                            min="1" 
                            max="1000"
                            placeholder="1000"
                            disabled={isCreating}
                        />
                        <p style={{ marginTop: '6px', fontSize: '10px', color: '#6b7280' }}>
                            Maximum total messages for this campaign (campaign will stop when reached)
                        </p>
                    </div>
                </div>

                {isCreating && (
                    <div className="card" style={{ 
                        marginTop: '24px',
                        marginBottom: '16px',
                        background: 'linear-gradient(135deg, rgba(0, 191, 255, 0.1) 0%, rgba(16, 185, 129, 0.1) 100%)',
                        border: '2px solid rgba(0, 191, 255, 0.2)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div className="loading" style={{ width: '20px', height: '20px' }}></div>
                            <div>
                                <p style={{ margin: 0, color: '#00BFFF', fontWeight: '700', fontSize: '12px' }}>
                                    {createdCampaignId ? '✅ Campaign Created! Starting...' : '⏳ Creating Campaign...'}
                                </p>
                                <p style={{ margin: '4px 0 0 0', color: '#6b7280', fontSize: '10px' }}>
                                    Please wait while we create and start your campaign
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                <button 
                    className="btn btn-primary" 
                    onClick={handleStart} 
                    disabled={isCreating}
                    style={{ 
                        marginTop: '24px', 
                        width: '100%',
                        opacity: isCreating ? 0.6 : 1,
                        cursor: isCreating ? 'not-allowed' : 'pointer'
                    }}
                >
                    {isCreating ? (
                        <React.Fragment>
                            <span className="loading" style={{ marginRight: '8px', width: '16px', height: '16px' }}></span>
                            {createdCampaignId ? 'Starting Campaign...' : 'Creating Campaign...'}
                        </React.Fragment>
                    ) : (
                        '🚀 Start Campaign'
                    )}
                </button>
            </div>
        </div>
    );
}

