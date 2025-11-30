// AutomatedMessagesTab Component
function AutomatedMessagesTab({ onReload }) {
    const { useState, useEffect } = React;
    const [flows, setFlows] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [editingFlow, setEditingFlow] = useState(null);
    const [flowName, setFlowName] = useState('');
    const [flowDescription, setFlowDescription] = useState('');
    const [isActive, setIsActive] = useState(true);
    const [steps, setSteps] = useState([]);
    const [showDataModal, setShowDataModal] = useState(false);
    const [collectedData, setCollectedData] = useState([]);
    const [selectedFlowId, setSelectedFlowId] = useState(null);
    const [messageCount, setMessageCount] = useState(0);

    useEffect(() => {
        loadFlows();
        loadMessageCount();
    }, []);

    const loadFlows = async () => {
        try {
            const data = await window.api.invoke('get-automated-messages');
            setFlows(data || []);
        } catch (error) {
            console.error('Error loading flows:', error);
        }
    };

    const loadMessageCount = async () => {
        try {
            const count = await window.api.invoke('get-automated-message-count');
            setMessageCount(count || 0);
        } catch (error) {
            console.error('Error loading message count:', error);
        }
    };

    const loadCollectedData = async (flowId) => {
        try {
            const data = await window.api.invoke('get-collected-data', { flowId });
            setCollectedData(data || []);
            setSelectedFlowId(flowId);
            setShowDataModal(true);
        } catch (error) {
            console.error('Error loading collected data:', error);
        }
    };

    const handleNew = () => {
        setEditingFlow(null);
        setFlowName('');
        setFlowDescription('');
        setIsActive(true);
        setSteps([]);
        setShowModal(true);
    };

    const handleEdit = async (flow) => {
        try {
            const fullFlow = await window.api.invoke('get-automated-message', flow.id);
            setEditingFlow(fullFlow);
            setFlowName(fullFlow.name);
            setFlowDescription(fullFlow.description || '');
            setIsActive(fullFlow.isActive === 1);
            
            // Convert options to UI format (with text, url, nextStepNumber)
            const stepsForUI = (fullFlow.steps || []).map(function(step) {
                const stepObj = Object.assign({}, step);
                stepObj.options = (step.options || []).map(function(opt) {
                    return {
                        text: opt.optionText || '',
                        url: opt.optionUrl || '',
                        nextStepNumber: opt.nextStepNumber || null,
                        nextStepId: opt.nextStepId || null
                    };
                });
                return stepObj;
            });
            
            setSteps(stepsForUI);
            setShowModal(true);
        } catch (error) {
            console.error('Error loading flow:', error);
            alert('Error loading flow: ' + (error.message || 'Unknown error'));
        }
    };

    const handleDelete = (id) => {
        if (confirm('Are you sure you want to delete this automated message flow? This will also delete all collected data.')) {
            window.api.sendMessage('delete-automated-message', id);
            setTimeout(() => {
                loadFlows();
                loadMessageCount();
            }, 500);
        }
    };

    const handleSave = async () => {
        if (!flowName.trim()) {
            alert('Please enter a flow name');
            return;
        }

        if (steps.length === 0) {
            alert('Please add at least one step to the flow');
            return;
        }

        try {
            // Prepare steps data for saving (ensure options have correct format)
            const stepsToSave = steps.map(function(step) {
                const stepObj = Object.assign({}, step);
                stepObj.options = (step.options || []).map(function(opt) {
                    return {
                        text: opt.text || '',
                        url: opt.url || '',
                        nextStepNumber: opt.nextStepNumber || null,
                        nextStepId: opt.nextStepId || null
                    };
                });
                return stepObj;
            });
            
            await window.api.invoke('save-automated-message', {
                id: editingFlow ? editingFlow.id : null,
                name: flowName,
                description: flowDescription,
                isActive: isActive,
                steps: stepsToSave
            });
            setShowModal(false);
            setEditingFlow(null);
            setFlowName('');
            setFlowDescription('');
            setSteps([]);
            setTimeout(() => {
                loadFlows();
                loadMessageCount();
                if (onReload) onReload();
            }, 500);
        } catch (error) {
            console.error('Error saving flow:', error);
            alert('Error saving flow: ' + (error.message || 'Unknown error'));
        }
    };

    const addStep = () => {
        const newStep = {
            question: '',
            stepType: 'question',
            isFormStep: false,
            options: []
        };
        setSteps([...steps, newStep]);
    };

    const updateStep = (index, field, value) => {
        const newSteps = [...steps];
        const updatedStep = Object.assign({}, newSteps[index]);
        updatedStep[field] = value;
        newSteps[index] = updatedStep;
        setSteps(newSteps);
    };

    const deleteStep = (index) => {
        if (confirm('Are you sure you want to delete this step?')) {
            const newSteps = steps.filter((_, i) => i !== index);
            setSteps(newSteps);
        }
    };

    const addOption = (stepIndex) => {
        const newSteps = [...steps];
        if (!newSteps[stepIndex].options) {
            newSteps[stepIndex].options = [];
        }
        newSteps[stepIndex].options.push({ text: '', url: '', nextStepNumber: null, nextStepId: null });
        setSteps(newSteps);
    };

    const updateOption = (stepIndex, optionIndex, field, value) => {
        const newSteps = [...steps];
        const updatedOption = Object.assign({}, newSteps[stepIndex].options[optionIndex]);
        updatedOption[field] = value;
        newSteps[stepIndex].options[optionIndex] = updatedOption;
        setSteps(newSteps);
    };

    const deleteOption = (stepIndex, optionIndex) => {
        const newSteps = [...steps];
        newSteps[stepIndex].options = newSteps[stepIndex].options.filter((_, i) => i !== optionIndex);
        setSteps(newSteps);
    };

    const addStepForOption = (stepIndex, optionIndex) => {
        const newSteps = [...steps];
        
        // Create a new step
        const newStep = {
            question: '',
            stepType: 'question',
            isFormStep: false,
            options: []
        };
        
        // Insert the new step right after the current step
        const insertIndex = stepIndex + 1;
        newSteps.splice(insertIndex, 0, newStep);
        
        // Update the option to point to the new step
        const newStepNumber = insertIndex + 1; // +1 because steps are 1-indexed
        if (!newSteps[stepIndex].options) {
            newSteps[stepIndex].options = [];
        }
        newSteps[stepIndex].options[optionIndex].nextStepNumber = newStepNumber;
        
        setSteps(newSteps);
    };

    const exportData = (flowId) => {
        const data = collectedData.filter(d => !flowId || d.flowId === flowId);
        if (data.length === 0) {
            alert('No data to export');
            return;
        }

        const csv = [
            ['Name', 'Email', 'Mobile', 'Phone', 'Interested', 'Submitted At'],
            ...data.map(row => [
                row.name || '',
                row.email || '',
                row.mobile || '',
                row.phone || '',
                row.isInterested ? 'Yes' : 'No',
                row.submittedAt || ''
            ])
        ].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `collected-data-${new Date().getTime()}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    return (
        <div className="tab-content">
            <div className="tab-header">
                <div>
                    <h2>Automated Messages</h2>
                    <p>Create interactive message flows with questions, options, and form collection</p>
                </div>
                <button className="btn btn-primary" onClick={handleNew}>
                    + New Automated Message
                </button>
            </div>

            <div className="stats-grid" style={{ marginBottom: '24px' }}>
                <div className="stat-card">
                    <div className="stat-value">{messageCount}</div>
                    <div className="stat-label">Total Flows Created</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">{flows.filter(f => f.isActive === 1).length}</div>
                    <div className="stat-label">Active Flows</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">{collectedData.length}</div>
                    <div className="stat-label">Total Leads Collected</div>
                </div>
            </div>

            <div className="card">
                <h3>Your Automated Message Flows</h3>
                {flows.length === 0 ? (
                    <div className="empty-state">
                        <p>No automated message flows yet. Create your first one!</p>
                    </div>
                ) : (
                    <div className="table-container">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Description</th>
                                    <th>Status</th>
                                    <th>Steps</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {flows.map(flow => (
                                    <tr key={flow.id}>
                                        <td><strong>{flow.name}</strong></td>
                                        <td>{flow.description || '-'}</td>
                                        <td>
                                            <span className={`status-badge status-${flow.isActive === 1 ? 'active' : 'inactive'}`}>
                                                {flow.isActive === 1 ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td>
                                            <button 
                                                className="btn btn-sm btn-secondary"
                                                onClick={async () => {
                                                    const fullFlow = await window.api.invoke('get-automated-message', flow.id);
                                                    const stepCount = (fullFlow && fullFlow.steps) ? fullFlow.steps.length : 0;
                                                    alert(`This flow has ${stepCount} step(s)`);
                                                }}
                                            >
                                                View Steps
                                            </button>
                                        </td>
                                        <td>
                                            <div className="action-buttons">
                                                <button 
                                                    className="btn btn-sm btn-primary"
                                                    onClick={() => handleEdit(flow)}
                                                >
                                                    Edit
                                                </button>
                                                <button 
                                                    className="btn btn-sm btn-info"
                                                    onClick={() => loadCollectedData(flow.id)}
                                                >
                                                    View Data
                                                </button>
                                                <button 
                                                    className="btn btn-sm btn-danger"
                                                    onClick={() => handleDelete(flow.id)}
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Create/Edit Flow Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px', maxHeight: '90vh', overflow: 'auto' }}>
                        <div className="modal-header">
                            <h3>{editingFlow ? 'Edit' : 'Create'} Automated Message Flow</h3>
                            <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group" style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', marginBottom: '10px', fontWeight: '600', fontSize: '14px', color: 'var(--text-primary)' }}>Flow Name *</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    value={flowName}
                                    onChange={(e) => setFlowName(e.target.value)}
                                    placeholder="e.g., Customer Support Flow"
                                    style={{ padding: '12px 16px', fontSize: '14px' }}
                                />
                            </div>

                            <div className="form-group" style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', marginBottom: '10px', fontWeight: '600', fontSize: '14px', color: 'var(--text-primary)' }}>Description</label>
                                <textarea
                                    className="form-control"
                                    value={flowDescription}
                                    onChange={(e) => setFlowDescription(e.target.value)}
                                    placeholder="Describe what this flow does..."
                                    rows="3"
                                    style={{ padding: '12px 16px', fontSize: '14px', minHeight: '90px' }}
                                />
                            </div>

                            <div className="form-group" style={{ marginBottom: '20px', padding: '12px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontWeight: '500', fontSize: '14px', color: 'var(--text-primary)' }}>
                                    <input
                                        type="checkbox"
                                        checked={isActive}
                                        onChange={(e) => setIsActive(e.target.checked)}
                                        style={{ marginRight: '10px', width: '18px', height: '18px', cursor: 'pointer', accentColor: '#00BFFF' }}
                                    />
                                    Active (will respond to messages)
                                </label>
                            </div>

                            <div className="form-group">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                    <label style={{ margin: 0, fontWeight: '600', fontSize: '16px', color: 'var(--text-primary)' }}>Steps *</label>
                                    <button className="btn btn-secondary" onClick={addStep} style={{ padding: '8px 16px', fontSize: '14px' }}>
                                        + Add Step
                                    </button>
                                </div>

                                {steps.map((step, stepIndex) => (
                                    <div key={stepIndex} className="card" style={{ marginBottom: '18px', padding: '18px', border: '1px solid rgba(0, 0, 0, 0.1)', borderRadius: '10px', background: '#ffffff' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', paddingBottom: '10px', borderBottom: '1px solid rgba(0, 0, 0, 0.1)' }}>
                                            <h4 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>Step {stepIndex + 1}</h4>
                                            <button 
                                                className="btn btn-sm btn-danger"
                                                onClick={() => deleteStep(stepIndex)}
                                                style={{ padding: '6px 14px', fontSize: '13px' }}
                                            >
                                                Delete
                                            </button>
                                        </div>

                                        <div className="form-group" style={{ marginBottom: '16px' }}>
                                            <label style={{ display: 'block', marginBottom: '10px', fontWeight: '500', fontSize: '14px', color: 'var(--text-primary)' }}>Question/Message *</label>
                                            <textarea
                                                className="form-control"
                                                value={step.question}
                                                onChange={(e) => updateStep(stepIndex, 'question', e.target.value)}
                                                placeholder="Enter the question or message to send..."
                                                rows="3"
                                                style={{ padding: '12px 16px', fontSize: '14px', minHeight: '90px' }}
                                            />
                                        </div>

                                        <div className="form-group" style={{ marginBottom: '14px', padding: '12px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontWeight: '500', fontSize: '14px', color: 'var(--text-primary)' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={step.isFormStep}
                                                    onChange={(e) => updateStep(stepIndex, 'isFormStep', e.target.checked)}
                                                    style={{ marginRight: '10px', width: '18px', height: '18px', cursor: 'pointer', accentColor: '#00BFFF' }}
                                                />
                                                This is a form step (collects user data)
                                            </label>
                                        </div>

                                        {step.isFormStep ? (
                                            <div className="form-group">
                                                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: 'var(--text-primary)' }}>Form Field Name</label>
                                                <input
                                                    type="text"
                                                    className="form-control"
                                                    value={step.formFieldName || ''}
                                                    onChange={(e) => updateStep(stepIndex, 'formFieldName', e.target.value)}
                                                    placeholder="e.g., name, email, phone"
                                                    style={{ marginBottom: '8px', padding: '12px 16px', fontSize: '14px' }}
                                                />
                                                <small style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '13px' }}>This field will be collected when user responds</small>
                                            </div>
                                        ) : (
                                            <div>
                                                <label style={{ display: 'block', marginBottom: '12px', fontWeight: '500', fontSize: '14px', color: 'var(--text-primary)' }}>Options (User can select one) *</label>
                                                <button 
                                                    className="btn btn-sm btn-secondary"
                                                    onClick={() => addOption(stepIndex)}
                                                    style={{ marginBottom: '12px', padding: '6px 14px', fontSize: '13px' }}
                                                >
                                                    + Add Option
                                                </button>

                                                {step.options && step.options.length > 0 && (
                                                    <div style={{ marginBottom: '12px' }}>
                                                        {step.options.map((option, optIndex) => (
                                                            <div key={optIndex} style={{ marginBottom: '10px', padding: '14px', background: option.nextStepNumber ? '#f0f9ff' : '#f9fafb', borderRadius: '8px', border: option.nextStepNumber ? '1px solid #00BFFF' : '1px solid #e5e7eb' }}>
                                                                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                                                                    <input
                                                                        type="text"
                                                                        className="form-control"
                                                                        value={option.text || ''}
                                                                        onChange={(e) => updateOption(stepIndex, optIndex, 'text', e.target.value)}
                                                                        placeholder="Option text (e.g., Yes, No, Option 1)"
                                                                        style={{ flex: 1, padding: '10px 14px', fontSize: '14px' }}
                                                                    />
                                                                    <button
                                                                        className="btn btn-sm btn-danger"
                                                                        onClick={() => deleteOption(stepIndex, optIndex)}
                                                                        style={{ padding: '8px 12px', minWidth: '40px' }}
                                                                    >
                                                                        ×
                                                                    </button>
                                                                </div>
                                                                <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center' }}>
                                                                    <input
                                                                        type="url"
                                                                        className="form-control"
                                                                        value={option.url || ''}
                                                                        onChange={(e) => updateOption(stepIndex, optIndex, 'url', e.target.value)}
                                                                        placeholder="Website URL (optional)"
                                                                        style={{ flex: 1, padding: '10px 14px', fontSize: '13px' }}
                                                                    />
                                                                    <select
                                                                        className="form-control"
                                                                        value={option.nextStepNumber || ''}
                                                                        onChange={(e) => updateOption(stepIndex, optIndex, 'nextStepNumber', e.target.value ? (e.target.value === 'end' ? 'end' : parseInt(e.target.value)) : null)}
                                                                        style={{ width: '140px', padding: '10px 14px', fontSize: '13px' }}
                                                                    >
                                                                        <option value="">Next Step...</option>
                                                                        {steps.map((s, idx) => {
                                                                            if (idx > stepIndex) {
                                                                                return (
                                                                                    <option key={idx} value={idx + 1}>
                                                                                        Step {idx + 1}
                                                                                    </option>
                                                                                );
                                                                            }
                                                                            return null;
                                                                        })}
                                                                        <option value="end">End Flow</option>
                                                                    </select>
                                                                    <button
                                                                        className="btn btn-sm btn-secondary"
                                                                        onClick={() => addStepForOption(stepIndex, optIndex)}
                                                                        style={{ padding: '10px 14px', fontSize: '12px', whiteSpace: 'nowrap' }}
                                                                        title="Add a new step that will be linked to this option"
                                                                    >
                                                                        + Add Step
                                                                    </button>
                                                                </div>
                                                                    <small style={{ display: 'block', marginTop: '6px', color: option.nextStepNumber ? '#00BFFF' : 'var(--text-secondary)', fontSize: '12px', fontWeight: option.nextStepNumber ? '500' : '400' }}>
                                                                        {option.url ? '🔗 This option will open the link when clicked' : option.nextStepNumber === 'end' ? '→ Will end the flow' : option.nextStepNumber ? `→ Will go to Step ${option.nextStepNumber} (conditional branch)` : 'Select next step or use "Add Step" to create a new step for this option'}
                                                                    </small>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                <small style={{ display: 'block', marginTop: '8px', color: 'var(--text-secondary)', fontSize: '12px', fontStyle: 'italic' }}>
                                                    💡 Each option can lead to a different step. Use "Add Step" button to create a new step linked to an option, or select an existing step from the dropdown.
                                                </small>
                                            </div>
                                        )}
                                    </div>
                                ))}

                                {steps.length === 0 && (
                                    <div className="empty-state" style={{ padding: '40px 20px', textAlign: 'center', background: 'rgba(249, 250, 251, 0.5)', borderRadius: '12px', border: '2px dashed rgba(0, 0, 0, 0.1)' }}>
                                        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>No steps added yet. Add your first step to start building the flow.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowModal(false)} style={{ padding: '8px 20px', fontSize: '14px' }}>
                                Cancel
                            </button>
                            <button className="btn btn-primary" onClick={handleSave} style={{ padding: '8px 20px', fontSize: '14px' }}>
                                Save Flow
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Collected Data Modal */}
            {showDataModal && (
                <div className="modal-overlay" onClick={() => setShowDataModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '1000px', maxHeight: '90vh', overflow: 'auto' }}>
                        <div className="modal-header">
                            <h3>Collected Data (Leads)</h3>
                            <button className="modal-close" onClick={() => setShowDataModal(false)}>×</button>
                        </div>
                        <div className="modal-body">
                            <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <p><strong>{collectedData.length}</strong> leads collected</p>
                                <button 
                                    className="btn btn-primary"
                                    onClick={() => exportData(selectedFlowId)}
                                >
                                    Export CSV
                                </button>
                            </div>

                            {collectedData.length === 0 ? (
                                <div className="empty-state">
                                    <p>No data collected yet.</p>
                                </div>
                            ) : (
                                <div className="table-container">
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>Name</th>
                                                <th>Email</th>
                                                <th>Mobile</th>
                                                <th>Phone</th>
                                                <th>Interested</th>
                                                <th>Submitted At</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {collectedData.map((row, index) => (
                                                <tr key={index}>
                                                    <td>{row.name || '-'}</td>
                                                    <td>{row.email || '-'}</td>
                                                    <td>{row.mobile || '-'}</td>
                                                    <td>{row.phone || '-'}</td>
                                                    <td>
                                                        <span className={`status-badge status-${row.isInterested ? 'active' : 'inactive'}`}>
                                                            {row.isInterested ? 'Yes' : 'No'}
                                                        </span>
                                                    </td>
                                                    <td>{row.submittedAt ? new Date(row.submittedAt).toLocaleString() : '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowDataModal(false)}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

