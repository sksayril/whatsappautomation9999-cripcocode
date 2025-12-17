// ContactsTab Component
function ContactsTab({ contacts, onReload }) {
    const { useState } = React;
    const [showUpload, setShowUpload] = useState(false);
    const [csvData, setCsvData] = useState('');

    const handleFileSelect = async () => {
        const result = await window.api.invoke('select-csv-file');
        if (result.canceled) return;

        if (result.csvData) {
            setCsvData(result.csvData);
            setShowUpload(true);
        }
    };

    const validateCSV = (csvText) => {
        const lines = csvText.trim().split('\n');
        if (lines.length < 2) {
            return { valid: false, error: 'CSV must have at least a header row and one data row' };
        }
        
        const header = lines[0].toLowerCase();
        if (!header.includes('name') || !header.includes('phone')) {
            return { valid: false, error: 'CSV must have "name" and "phone" columns' };
        }
        
        return { valid: true };
    };

    const handleUpload = () => {
        if (!csvData.trim()) {
            alert('❌ Please enter CSV data');
            return;
        }
        
        const validation = validateCSV(csvData);
        if (!validation.valid) {
            alert('❌ Validation Error: ' + validation.error);
            return;
        }
        
        window.api.sendMessage('upload-csv', csvData);
        setShowUpload(false);
        setCsvData('');
        setTimeout(onReload, 1000);
    };

    const handleDelete = (id) => {
        if (confirm('Are you sure you want to delete this contact?')) {
            window.api.sendMessage('delete-contact', id);
            setTimeout(onReload, 500);
        }
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
                <h2 style={{ 
                    background: 'var(--primary-gradient)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    fontSize: '18px',
                    fontWeight: '800',
                    letterSpacing: '-0.3px',
                    margin: 0
                }}>👥 Contacts</h2>
                <button className="btn btn-primary" onClick={handleFileSelect}>
                    📤 Upload CSV
                </button>
            </div>

            {showUpload && (
                <div className="card" style={{ marginBottom: '12px' }}>
                    <h3 style={{ marginBottom: '12px', color: '#00BFFF', fontSize: '14px', fontWeight: '700' }}>📤 CSV Upload</h3>
                    <div style={{ 
                        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(147, 51, 234, 0.1) 100%)',
                        padding: '16px',
                        borderRadius: '12px',
                        marginBottom: '20px',
                        border: '2px solid rgba(59, 130, 246, 0.2)'
                    }}>
                        <p style={{ margin: 0, fontSize: '14px', color: '#1e40af', fontWeight: '600', marginBottom: '8px' }}>
                            📋 CSV Format Requirements:
                        </p>
                        <ul style={{ margin: 0, paddingLeft: '20px', color: '#1e40af', fontSize: '13px', lineHeight: '1.8' }}>
                            <li>First row must be header: <code style={{ background: 'rgba(255,255,255,0.5)', padding: '2px 6px', borderRadius: '4px' }}>name,phone,customMessage</code></li>
                            <li>Phone numbers will be normalized (spaces, dashes removed)</li>
                            <li>Duplicate phone numbers will be automatically skipped</li>
                            <li>Phone numbers must be at least 10 digits</li>
                        </ul>
                    </div>
                    <div className="input-group">
                        <label>CSV Data</label>
                        <textarea 
                            value={csvData} 
                            onChange={(e) => setCsvData(e.target.value)}
                            rows="10"
                            placeholder="name,phone,customMessage&#10;John Doe,1234567890,Hello John!&#10;Jane Smith,9876543210,Hi Jane!"
                            style={{ fontFamily: 'monospace', fontSize: '13px' }}
                        />
                    </div>
                    <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                        <button className="btn btn-success" onClick={handleUpload}>
                            💾 Save to Database
                        </button>
                        <button className="btn btn-secondary" onClick={() => {
                            setShowUpload(false);
                            setCsvData('');
                        }}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {contacts.length === 0 ? (
                <div className="empty-state">
                    <p>No contacts found. Upload a CSV file to get started.</p>
                    <div style={{ 
                        marginTop: '20px',
                        padding: '16px',
                        background: 'rgba(0, 191, 255, 0.05)',
                        borderRadius: '12px',
                        maxWidth: '600px',
                        margin: '20px auto 0'
                    }}>
                        <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#00BFFF', fontWeight: '600' }}>
                            📋 CSV Format:
                        </p>
                        <code style={{ 
                            display: 'block',
                            padding: '12px',
                            background: 'white',
                            borderRadius: '8px',
                            fontSize: '13px',
                            marginBottom: '12px',
                            fontFamily: 'monospace'
                        }}>
                            name,phone,customMessage<br/>
                            John Doe,1234567890,Hello John!<br/>
                            Jane Smith,9876543210,Hi Jane!
                        </code>
                        <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', color: '#6b7280', lineHeight: '1.8' }}>
                            <li>Phone numbers are automatically normalized (spaces/dashes removed)</li>
                            <li>Duplicate phone numbers are automatically skipped</li>
                            <li>Phone numbers must be 10-15 digits</li>
                        </ul>
                    </div>
                </div>
            ) : (
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Phone</th>
                                <th>Message</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {contacts.map(contact => (
                                <tr key={contact.id}>
                                    <td>{contact.name}</td>
                                    <td>{contact.phone}</td>
                                    <td>{contact.message || '-'}</td>
                                    <td>
                                        <span className={`status-badge status-${contact.status || 'pending'}`}>
                                            {contact.status || 'pending'}
                                        </span>
                                    </td>
                                    <td>
                                        <button className="btn btn-danger" style={{ padding: '4px 8px', fontSize: '10px' }} onClick={() => handleDelete(contact.id)}>
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

