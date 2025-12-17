// DashboardTab Component
function DashboardTab({ stats, campaigns, onReload }) {
    const { useState, useEffect, useRef } = React;
    const [chartData, setChartData] = useState({
        messagesOverTime: [],
        successRate: null
    });

    // Chart ref
    const messagesChartRef = useRef(null);

    // Load chart data
    useEffect(() => {
        const loadChartData = async () => {
            try {
                const [messagesData, successData] = await Promise.all([
                    window.api.invoke('get-messages-sent-over-time'),
                    window.api.invoke('get-success-rate-data')
                ]);
                
                setChartData({
                    messagesOverTime: messagesData || [],
                    successRate: successData || null
                });
            } catch (error) {
                console.error('Error loading chart data:', error);
            }
        };
        
        loadChartData();
    }, [campaigns, stats]);

    // Render messages sent over time chart
    useEffect(() => {
        let retryCount = 0;
        const maxRetries = 50; // 5 seconds max wait
        
        // Wait for Chart.js to be available
        const checkChart = () => {
            const ChartLib = typeof Chart !== 'undefined' ? Chart : (typeof window !== 'undefined' && window.Chart ? window.Chart : null);
            
            if (!messagesChartRef.current || !ChartLib) {
                if (!ChartLib && retryCount < maxRetries) {
                    retryCount++;
                    setTimeout(checkChart, 100);
                } else if (retryCount >= maxRetries) {
                    console.error('Chart.js failed to load after maximum retries');
                }
                return;
            }
            
            const canvas = messagesChartRef.current;
            if (!canvas) {
                console.warn('Canvas ref not available');
                return;
            }
            
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                console.warn('Could not get 2d context from canvas');
                return;
            }
            
            // Destroy existing chart if it exists
            if (canvas.chart) {
                canvas.chart.destroy();
                canvas.chart = null;
            }

            // Generate labels for last 7 days
            const labels = [];
            const data = [];
            const today = new Date();
            today.setHours(0, 0, 0, 0); // Normalize to start of day
            
            // Create data map from API response
            const dataMap = {};
            if (chartData.messagesOverTime && Array.isArray(chartData.messagesOverTime)) {
                chartData.messagesOverTime.forEach(item => {
                    if (item && item.date) {
                        try {
                            // Handle different date formats
                            let dateObj;
                            if (typeof item.date === 'string') {
                                // SQLite returns dates as strings like "2024-11-22" or "2024-11-22T00:00:00.000Z"
                                if (item.date.includes('T')) {
                                    dateObj = new Date(item.date);
                                } else {
                                    dateObj = new Date(item.date + 'T00:00:00');
                                }
                            } else {
                                dateObj = new Date(item.date);
                            }
                            dateObj.setHours(0, 0, 0, 0);
                            const dateKey = dateObj.toDateString();
                            dataMap[dateKey] = item.sentCount || item.count || 0;
                        } catch (e) {
                            console.warn('Error parsing date:', item.date, e);
                        }
                    }
                });
            }

            // Fill in last 7 days
            for (let i = 6; i >= 0; i--) {
                const date = new Date(today);
                date.setDate(date.getDate() - i);
                date.setHours(0, 0, 0, 0);
                const dateKey = date.toDateString();
                const dateLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                labels.push(dateLabel);
                data.push(dataMap[dateKey] || 0);
            }
            
            try {
                canvas.chart = new ChartLib(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Successfully Sent Messages',
                        data: data,
                        borderColor: 'rgb(16, 185, 129)',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        borderWidth: 3,
                        tension: 0.4,
                        fill: true,
                        pointRadius: 5,
                        pointHoverRadius: 7,
                        pointBackgroundColor: 'rgb(16, 185, 129)',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            font: {
                                size: 11,
                                weight: '600'
                            },
                            padding: 12
                        }
                    },
                    title: {
                        display: true,
                        text: 'Successfully Sent Messages (Last 7 Days)',
                        font: {
                            size: 14,
                            weight: '700'
                        },
                        padding: {
                            top: 8,
                            bottom: 16
                        },
                        color: '#1a1a2e'
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        padding: 12,
                        titleFont: {
                            size: 14,
                            weight: '600'
                        },
                        bodyFont: {
                            size: 13
                        },
                        callbacks: {
                            label: function(context) {
                                return `Sent: ${context.parsed.y} messages`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1,
                            font: {
                                size: 10
                            },
                            color: '#6b7280'
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                        },
                        title: {
                            display: true,
                            text: 'Number of Messages',
                            font: {
                                size: 11,
                                weight: '600'
                            },
                            color: '#6b7280'
                        }
                    },
                    x: {
                        ticks: {
                            font: {
                                size: 10
                            },
                            color: '#6b7280'
                        },
                        grid: {
                            display: false
                        },
                        title: {
                            display: true,
                            text: 'Date',
                            font: {
                                size: 11,
                                weight: '600'
                            },
                            color: '#6b7280'
                        }
                    }
                }
            }
                });
            } catch (error) {
                console.error('Error creating chart:', error);
            }
        };
        
        // Initial check
        checkChart();
    }, [chartData.messagesOverTime]);

    // Cleanup chart on unmount
    useEffect(() => {
        return () => {
            if (messagesChartRef.current && messagesChartRef.current.chart) {
                messagesChartRef.current.chart.destroy();
            }
        };
    }, []);

    const handleStartCampaign = async (campaignId) => {
        try {
            const canStart = await window.api.invoke('can-start-campaign', campaignId);
            if (!canStart.canStart) {
                alert('❌ Cannot start campaign: ' + canStart.reason);
                return;
            }
            
            window.api.sendMessage('start-campaign', { campaignId });
            setTimeout(() => {
                if (onReload) onReload();
            }, 500);
        } catch (error) {
            alert('❌ Error: ' + (error.message || 'Unknown error'));
        }
    };

    const handlePauseCampaign = (campaignId) => {
        if (confirm('Are you sure you want to pause this campaign?')) {
            window.api.sendMessage('pause-campaign', campaignId);
            setTimeout(() => {
                if (onReload) onReload();
            }, 500);
        }
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
            }}>📊 Dashboard</h2>
            
            <div className="stats-grid">
                <div className="stat-card">
                    <h3>Total Contacts</h3>
                    <div className="value">{stats.totalContacts || 0}</div>
                </div>
                <div className="stat-card">
                    <h3>Total Campaigns</h3>
                    <div className="value">{stats.totalCampaigns || 0}</div>
                </div>
                <div className="stat-card">
                    <h3>Pending Messages</h3>
                    <div className="value">{stats.pendingContacts || 0}</div>
                </div>
                <div className="stat-card">
                    <h3>Sent Messages</h3>
                    <div className="value">{stats.sentContacts || 0}</div>
                </div>
            </div>

            {/* Success Rate Summary */}
            {chartData.successRate && (
                <div className="card" style={{ 
                    marginBottom: '12px',
                    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 150, 105, 0.1) 100%)',
                    border: '2px solid rgba(16, 185, 129, 0.2)'
                }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                        <div style={{ textAlign: 'center' }}>
                            <p style={{ color: '#6b7280', fontSize: '10px', fontWeight: '600', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                                Successfully Sent
                            </p>
                            <p style={{ color: '#10b981', fontSize: '22px', fontWeight: '800', margin: 0 }}>
                                {chartData.successRate.sent || 0}
                            </p>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <p style={{ color: '#6b7280', fontSize: '10px', fontWeight: '600', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                                Failed
                            </p>
                            <p style={{ color: '#ef4444', fontSize: '22px', fontWeight: '800', margin: 0 }}>
                                {chartData.successRate.failed || 0}
                            </p>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <p style={{ color: '#6b7280', fontSize: '10px', fontWeight: '600', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                                Pending
                            </p>
                            <p style={{ color: '#f59e0b', fontSize: '22px', fontWeight: '800', margin: 0 }}>
                                {chartData.successRate.pending || 0}
                            </p>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <p style={{ color: '#6b7280', fontSize: '10px', fontWeight: '600', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                                Success Rate
                            </p>
                            <p style={{ color: '#00BFFF', fontSize: '22px', fontWeight: '800', margin: 0 }}>
                                {chartData.successRate.successRate || 0}%
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Messages Sent Chart */}
            <div className="card" style={{ marginBottom: '12px' }}>
                <div style={{ height: '250px', position: 'relative', width: '100%' }}>
                    {typeof Chart === 'undefined' && typeof window !== 'undefined' && !window.Chart ? (
                        <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            height: '100%',
                            color: '#6b7280',
                            fontSize: '14px'
                        }}>
                            Loading chart library...
                        </div>
                    ) : (
                        <canvas 
                            ref={messagesChartRef}
                            style={{ width: '100%', height: '100%' }}
                        ></canvas>
                    )}
                </div>
            </div>

            {stats.lastCampaign && (
                <div className="card" style={{ 
                    background: 'linear-gradient(135deg, rgba(0, 191, 255, 0.05) 0%, rgba(16, 185, 129, 0.05) 100%)',
                    border: '2px solid rgba(0, 191, 255, 0.2)'
                }}>
                    <h3 style={{ marginBottom: '12px', color: '#00BFFF', fontSize: '14px', fontWeight: '700' }}>📊 Last Campaign</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                        <div>
                            <p style={{ color: '#6b7280', fontSize: '9px', fontWeight: '600', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Name</p>
                            <p style={{ color: '#1a1a2e', fontSize: '12px', fontWeight: '700', margin: 0 }}>{stats.lastCampaign.name}</p>
                        </div>
                        <div>
                            <p style={{ color: '#6b7280', fontSize: '9px', fontWeight: '600', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Total</p>
                            <p style={{ color: '#1a1a2e', fontSize: '12px', fontWeight: '700', margin: 0 }}>{stats.lastCampaign.totalContacts}</p>
                        </div>
                        <div>
                            <p style={{ color: '#6b7280', fontSize: '9px', fontWeight: '600', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Sent</p>
                            <p style={{ color: '#10b981', fontSize: '12px', fontWeight: '700', margin: 0 }}>{stats.lastCampaign.sent}</p>
                        </div>
                        <div>
                            <p style={{ color: '#6b7280', fontSize: '9px', fontWeight: '600', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Failed</p>
                            <p style={{ color: '#ef4444', fontSize: '12px', fontWeight: '700', margin: 0 }}>{stats.lastCampaign.failed}</p>
                        </div>
                        <div>
                            <p style={{ color: '#6b7280', fontSize: '9px', fontWeight: '600', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Created</p>
                            <p style={{ color: '#1a1a2e', fontSize: '11px', fontWeight: '700', margin: 0 }}>{new Date(stats.lastCampaign.createdAt).toLocaleString()}</p>
                        </div>
                    </div>
                </div>
            )}

            {campaigns.length > 0 && (
                <div className="card">
                    <h3 style={{ marginBottom: '12px', color: '#00BFFF', fontSize: '14px', fontWeight: '700' }}>📈 Recent Campaigns</h3>
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Total</th>
                                    <th>Sent</th>
                                    <th>Failed</th>
                                    <th>Limits</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                    <th>Created</th>
                                </tr>
                            </thead>
                            <tbody>
                                {campaigns.slice(0, 5).map(campaign => {
                                    const status = campaign.status || (campaign.completedAt ? 'completed' : 'pending');
                                    const isRunning = status === 'running';
                                    const isPaused = status === 'paused';
                                    const isCompleted = status === 'completed';
                                    
                                    return (
                                    <tr key={campaign.id}>
                                            <td style={{ fontWeight: '600' }}>{campaign.name}</td>
                                        <td>{campaign.totalContacts}</td>
                                            <td style={{ color: '#10b981', fontWeight: '600' }}>{campaign.sent || 0}</td>
                                            <td style={{ color: '#ef4444', fontWeight: '600' }}>{campaign.failed || 0}</td>
                                            <td style={{ fontSize: '10px', color: '#6b7280' }}>
                                                <div>24h: {campaign.sent || 0}/{campaign.dailyLimit || 1000}</div>
                                                <div>Total: {campaign.sent || 0}/{campaign.totalLimit || 1000}</div>
                                            </td>
                                            <td>
                                                <span className={`status-badge ${
                                                    isCompleted ? 'status-sent' : 
                                                    isRunning ? 'status-connected' : 
                                                    isPaused ? 'status-pending' : 
                                                    'status-pending'
                                                }`}>
                                                    {isCompleted ? '✅ Completed' : 
                                                     isRunning ? '▶️ Running' : 
                                                     isPaused ? '⏸️ Paused' : 
                                                     '⏳ Pending'}
                                            </span>
                                        </td>
                                            <td>
                                                {!isCompleted && (
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        {!isRunning && (
                                                            <button 
                                                                className="btn btn-success" 
                                                                style={{ padding: '4px 8px', fontSize: '10px' }}
                                                                onClick={() => handleStartCampaign(campaign.id)}
                                                            >
                                                                ▶️ Start
                                                            </button>
                                                        )}
                                                        {isRunning && (
                                                            <button 
                                                                className="btn btn-secondary" 
                                                                style={{ padding: '4px 8px', fontSize: '10px' }}
                                                                onClick={() => handlePauseCampaign(campaign.id)}
                                                            >
                                                                ⏸️ Pause
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ color: '#6b7280', fontSize: '10px' }}>{new Date(campaign.createdAt).toLocaleString()}</td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

