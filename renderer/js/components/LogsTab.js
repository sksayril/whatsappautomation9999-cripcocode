// LogsTab Component
function LogsTab({ logs, onReload }) {
    const { useState, useEffect } = React;
    const [filter, setFilter] = useState('');
    const [search, setSearch] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => {
            onReload({ status: filter || null, search: search || null });
        }, 300);
        return () => clearTimeout(timer);
    }, [filter, search]);

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
                <h2 style={{ 
                    background: 'var(--primary-gradient)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    fontSize: '28px',
                    fontWeight: '800',
                    letterSpacing: '-0.5px',
                    margin: 0
                }}>📋 Logs</h2>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <input 
                        type="text" 
                        placeholder="🔍 Search by phone/name..." 
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{ 
                            padding: '12px 16px', 
                            border: '2px solid #e5e7eb', 
                            borderRadius: '12px',
                            fontSize: '15px',
                            transition: 'all 0.3s ease',
                            minWidth: '250px'
                        }}
                        onFocus={(e) => {
                            e.target.style.borderColor = '#00BFFF';
                            e.target.style.boxShadow = '0 0 0 4px rgba(0, 191, 255, 0.1)';
                        }}
                        onBlur={(e) => {
                            e.target.style.borderColor = '#e5e7eb';
                            e.target.style.boxShadow = 'none';
                        }}
                    />
                    <select 
                        value={filter} 
                        onChange={(e) => setFilter(e.target.value)}
                        style={{ 
                            padding: '12px 16px', 
                            border: '2px solid #e5e7eb', 
                            borderRadius: '12px',
                            fontSize: '15px',
                            cursor: 'pointer',
                            transition: 'all 0.3s ease'
                        }}
                        onFocus={(e) => {
                            e.target.style.borderColor = '#00BFFF';
                            e.target.style.boxShadow = '0 0 0 4px rgba(0, 191, 255, 0.1)';
                        }}
                        onBlur={(e) => {
                            e.target.style.borderColor = '#e5e7eb';
                            e.target.style.boxShadow = 'none';
                        }}
                    >
                        <option value="">All Status</option>
                        <option value="sent">Sent</option>
                        <option value="failed">Failed</option>
                    </select>
                </div>
            </div>

            {logs.length === 0 ? (
                <div className="empty-state">
                    <p>No logs found.</p>
                </div>
            ) : (
                <div>
                    {logs.map(log => (
                        <div key={log.id} className={`log-item ${log.status === 'failed' ? 'error' : log.status === 'sent' ? 'success' : ''}`}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <strong>{log.name || 'Unknown'}</strong> - {log.phone || 'N/A'}
                                </div>
                                <span className={`status-badge status-${log.status}`}>
                                    {log.status}
                                </span>
                            </div>
                            {log.error && <p style={{ color: '#ef4444', marginTop: '5px', fontSize: '12px' }}>Error: {log.error}</p>}
                            <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '5px' }}>
                                {new Date(log.timestamp).toLocaleString()}
                            </p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

