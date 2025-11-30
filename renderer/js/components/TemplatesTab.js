// TemplatesTab Component
function TemplatesTab({ templates, onReload }) {
    const { useState, useRef } = React;
    const [showModal, setShowModal] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const textareaRef = useRef(null);

    const handleSave = () => {
        window.api.sendMessage('save-template', {
            id: editingTemplate && editingTemplate.id,
            title,
            body
        });
        setShowModal(false);
        setEditingTemplate(null);
        setTitle('');
        setBody('');
        setTimeout(onReload, 500);
    };

    const handleEdit = (template) => {
        setEditingTemplate(template);
        setTitle(template.title);
        setBody(template.body);
        setShowModal(true);
    };

    const handleDelete = (id) => {
        if (confirm('Are you sure you want to delete this template?')) {
            window.api.sendMessage('delete-template', id);
            setTimeout(onReload, 500);
        }
    };

    const handleNew = () => {
        setEditingTemplate(null);
        setTitle('');
        setBody('');
        setShowModal(true);
    };

    // Formatting functions
    const insertAtCursor = (before, after) => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selectedText = body.substring(start, end);
        const newText = body.substring(0, start) + before + selectedText + after + body.substring(end);
        
        setBody(newText);
        
        // Restore cursor position
        setTimeout(() => {
            textarea.focus();
            const newCursorPos = start + before.length + selectedText.length + after.length;
            textarea.setSelectionRange(newCursorPos, newCursorPos);
        }, 0);
    };

    const formatBold = () => {
        insertAtCursor('*', '*');
    };

    const formatItalic = () => {
        insertAtCursor('_', '_');
    };

    const formatBullet = () => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selectedText = body.substring(start, end);
        
        // If text is selected, wrap each line with bullet
        if (selectedText) {
            const lines = selectedText.split('\n');
            const bulleted = lines.map(line => line.trim() ? '• ' + line.trim() : '').join('\n');
            const newText = body.substring(0, start) + bulleted + body.substring(end);
            setBody(newText);
        } else {
            // Insert bullet at cursor
            insertAtCursor('• ', '');
        }
    };

    const insertVariable = () => {
        insertAtCursor('{{name}}', '');
    };

    const insertNewLine = () => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        
        const start = textarea.selectionStart;
        const newText = body.substring(0, start) + '\n' + body.substring(start);
        setBody(newText);
        
        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + 1, start + 1);
        }, 0);
    };

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
                }}>📝 Templates</h2>
                <button className="btn btn-primary" onClick={handleNew}>
                    ➕ New Template
                </button>
            </div>

            {templates.length === 0 ? (
                <div className="empty-state">
                    <p>No templates found. Create your first template!</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
                    {templates.map(template => (
                        <div className="card" key={template.id} style={{
                            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(249, 250, 251, 0.95) 100%)',
                            border: '2px solid rgba(102, 126, 234, 0.1)'
                        }}>
                            <h3 style={{ 
                                marginBottom: '16px', 
                                color: '#00BFFF',
                                fontSize: '20px',
                                fontWeight: '700'
                            }}>{template.title}</h3>
                            <div style={{ 
                                color: '#6b7280', 
                                marginBottom: '20px', 
                                whiteSpace: 'pre-wrap',
                                lineHeight: '1.8',
                                fontSize: '15px'
                            }}>
                                {template.body.split('\n').map((line, idx) => {
                                    // Simple formatting renderer
                                    const renderFormattedText = (text) => {
                                        const parts = [];
                                        let currentIndex = 0;
                                        
                                        // Match *bold* and _italic_
                                        const boldRegex = /\*([^*]+)\*/g;
                                        const italicRegex = /_([^_]+)_/g;
                                        
                                        let match;
                                        const matches = [];
                                        
                                        // Find all bold matches
                                        while ((match = boldRegex.exec(text)) !== null) {
                                            matches.push({ type: 'bold', start: match.index, end: match.index + match[0].length, content: match[1] });
                                        }
                                        
                                        // Find all italic matches
                                        while ((match = italicRegex.exec(text)) !== null) {
                                            matches.push({ type: 'italic', start: match.index, end: match.index + match[0].length, content: match[1] });
                                        }
                                        
                                        // Sort matches by position
                                        matches.sort((a, b) => a.start - b.start);
                                        
                                        // Build parts array
                                        let lastEnd = 0;
                                        matches.forEach(m => {
                                            if (m.start > lastEnd) {
                                                parts.push({ type: 'normal', text: text.substring(lastEnd, m.start) });
                                            }
                                            parts.push({ type: m.type, text: m.content });
                                            lastEnd = m.end;
                                        });
                                        
                                        if (lastEnd < text.length) {
                                            parts.push({ type: 'normal', text: text.substring(lastEnd) });
                                        }
                                        
                                        if (parts.length === 0) {
                                            parts.push({ type: 'normal', text: text });
                                        }
                                        
                                        return parts.map((part, partIdx) => {
                                            if (part.type === 'bold') {
                                                return <strong key={partIdx} style={{ fontWeight: '700', color: '#1a1a2e' }}>{part.text}</strong>;
                                            } else if (part.type === 'italic') {
                                                return <em key={partIdx} style={{ fontStyle: 'italic' }}>{part.text}</em>;
                                            } else {
                                                return <span key={partIdx}>{part.text}</span>;
                                            }
                                        });
                                    };
                                    
                                    // Check if line starts with bullet
                                    if (line.trim().startsWith('•')) {
                                        return (
                                            <div key={idx} style={{ marginLeft: '20px', marginBottom: '6px', display: 'flex', alignItems: 'flex-start' }}>
                                                <span style={{ marginRight: '8px', color: '#00BFFF', fontWeight: '700' }}>•</span>
                                                <span>{renderFormattedText(line.replace(/^\s*•\s*/, ''))}</span>
                                            </div>
                                        );
                                    }
                                    
                                    return (
                                        <div key={idx} style={{ marginBottom: '6px' }}>
                                            {renderFormattedText(line)}
                                        </div>
                                    );
                                })}
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button className="btn btn-primary" style={{ padding: '10px 20px', fontSize: '14px', flex: 1 }} onClick={() => handleEdit(template)}>
                                    ✏️ Edit
                                </button>
                                <button className="btn btn-danger" style={{ padding: '10px 20px', fontSize: '14px', flex: 1 }} onClick={() => handleDelete(template.id)}>
                                    🗑️ Delete
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <h2 style={{ marginBottom: '20px', color: '#00BFFF' }}>
                            {editingTemplate ? 'Edit Template' : 'New Template'}
                        </h2>
                        <div className="input-group">
                            <label>Title</label>
                            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Template title" />
                        </div>
                        <div className="input-group">
                            <label>Body (Use {'{'}{'{'}name{'}'}{'}'} for variable)</label>
                            
                            {/* Formatting Toolbar */}
                            <div style={{
                                display: 'flex',
                                gap: '8px',
                                marginBottom: '12px',
                                padding: '12px',
                                background: 'rgba(249, 250, 251, 0.8)',
                                borderRadius: '8px',
                                border: '1px solid #e5e7eb',
                                flexWrap: 'wrap',
                                alignItems: 'center'
                            }}>
                                <button
                                    type="button"
                                    onClick={formatBold}
                                    style={{
                                        padding: '8px 12px',
                                        background: 'white',
                                        border: '1px solid #d1d5db',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontSize: '14px',
                                        fontWeight: '700',
                                        color: '#374151',
                                        transition: 'all 0.2s'
                                    }}
                                    onMouseOver={(e) => {
                                        e.target.style.background = '#f3f4f6';
                                        e.target.style.borderColor = '#00BFFF';
                                    }}
                                    onMouseOut={(e) => {
                                        e.target.style.background = 'white';
                                        e.target.style.borderColor = '#d1d5db';
                                    }}
                                    title="Bold (*text*)"
                                >
                                    <strong>B</strong>
                                </button>
                                
                                <button
                                    type="button"
                                    onClick={formatItalic}
                                    style={{
                                        padding: '8px 12px',
                                        background: 'white',
                                        border: '1px solid #d1d5db',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontSize: '14px',
                                        fontStyle: 'italic',
                                        color: '#374151',
                                        transition: 'all 0.2s'
                                    }}
                                    onMouseOver={(e) => {
                                        e.target.style.background = '#f3f4f6';
                                        e.target.style.borderColor = '#00BFFF';
                                    }}
                                    onMouseOut={(e) => {
                                        e.target.style.background = 'white';
                                        e.target.style.borderColor = '#d1d5db';
                                    }}
                                    title="Italic (_text_)"
                                >
                                    <em>I</em>
                                </button>
                                
                                <button
                                    type="button"
                                    onClick={formatBullet}
                                    style={{
                                        padding: '8px 12px',
                                        background: 'white',
                                        border: '1px solid #d1d5db',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontSize: '16px',
                                        color: '#374151',
                                        transition: 'all 0.2s'
                                    }}
                                    onMouseOver={(e) => {
                                        e.target.style.background = '#f3f4f6';
                                        e.target.style.borderColor = '#00BFFF';
                                    }}
                                    onMouseOut={(e) => {
                                        e.target.style.background = 'white';
                                        e.target.style.borderColor = '#d1d5db';
                                    }}
                                    title="Bullet Point"
                                >
                                    •
                                </button>
                                
                                <div style={{ width: '1px', height: '24px', background: '#d1d5db', margin: '0 4px' }}></div>
                                
                                <button
                                    type="button"
                                    onClick={insertVariable}
                                    style={{
                                        padding: '8px 12px',
                                        background: 'linear-gradient(135deg, rgba(0, 191, 255, 0.1) 0%, rgba(16, 185, 129, 0.1) 100%)',
                                        border: '1px solid rgba(0, 191, 255, 0.3)',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontSize: '13px',
                                        fontWeight: '600',
                                        color: '#00BFFF',
                                        transition: 'all 0.2s'
                                    }}
                                    onMouseOver={(e) => {
                                        e.target.style.background = 'linear-gradient(135deg, rgba(0, 191, 255, 0.2) 0%, rgba(16, 185, 129, 0.2) 100%)';
                                        e.target.style.borderColor = '#00BFFF';
                                    }}
                                    onMouseOut={(e) => {
                                        e.target.style.background = 'linear-gradient(135deg, rgba(0, 191, 255, 0.1) 0%, rgba(16, 185, 129, 0.1) 100%)';
                                        e.target.style.borderColor = 'rgba(0, 191, 255, 0.3)';
                                    }}
                                    title="Insert {{name}} variable"
                                >
                                    {'{'}{'{'}name{'}'}{'}'}
                                </button>
                                
                                <button
                                    type="button"
                                    onClick={insertNewLine}
                                    style={{
                                        padding: '8px 12px',
                                        background: 'white',
                                        border: '1px solid #d1d5db',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontSize: '12px',
                                        color: '#374151',
                                        transition: 'all 0.2s'
                                    }}
                                    onMouseOver={(e) => {
                                        e.target.style.background = '#f3f4f6';
                                        e.target.style.borderColor = '#00BFFF';
                                    }}
                                    onMouseOut={(e) => {
                                        e.target.style.background = 'white';
                                        e.target.style.borderColor = '#d1d5db';
                                    }}
                                    title="New Line"
                                >
                                    ⏎
                                </button>
                                
                                <div style={{ marginLeft: 'auto', fontSize: '12px', color: '#6b7280' }}>
                                    💡 WhatsApp: *bold* _italic_ • bullets
                                </div>
                            </div>
                            
                            <textarea 
                                ref={textareaRef}
                                value={body} 
                                onChange={(e) => setBody(e.target.value)} 
                                rows="10"
                                placeholder="Hello {{name}}, this is a test message!"
                                style={{
                                    fontFamily: 'inherit',
                                    fontSize: '15px',
                                    lineHeight: '1.6'
                                }}
                            />
                            
                            <div style={{
                                marginTop: '8px',
                                padding: '10px',
                                background: 'rgba(59, 130, 246, 0.05)',
                                borderRadius: '8px',
                                fontSize: '12px',
                                color: '#1e40af'
                            }}>
                                <strong>Formatting Guide:</strong>
                                <ul style={{ margin: '8px 0 0 20px', padding: 0, lineHeight: '1.8' }}>
                                    <li><strong>*text*</strong> = Bold text</li>
                                    <li><strong>_text_</strong> = Italic text</li>
                                    <li><strong>• text</strong> = Bullet point</li>
                                    <li><strong>{'{'}{'{'}name{'}'}{'}'}</strong> = Contact name variable</li>
                                </ul>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                            <button className="btn btn-primary" onClick={handleSave}>Save</button>
                            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

