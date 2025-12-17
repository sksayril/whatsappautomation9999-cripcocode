// ChatsTab Component
function ChatsTab({ connectionStatus }) {
    const { useState, useEffect } = React;
    const [chats, setChats] = useState([]);
    const [contacts, setContacts] = useState([]);
    const [activeView, setActiveView] = useState('chats'); // 'chats' or 'contacts'
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedChat, setSelectedChat] = useState(null);
    const [messages, setMessages] = useState([]);
    const [loadingMessages, setLoadingMessages] = useState(false);
    
    // AI Chat State - Per Chat ID
    const [aiChatSettings, setAiChatSettings] = useState({}); // { chatId: { enabled, persona, systemPrompt } }
    const [globalAutomation, setGlobalAutomation] = useState(false);
    const [messageInput, setMessageInput] = useState('');
    const [sendingMessage, setSendingMessage] = useState(false);
    const [showAiSettings, setShowAiSettings] = useState(false);
    
    // Load AI settings from localStorage
    useEffect(() => {
        try {
            const saved = localStorage.getItem('aiChatSettings');
            if (saved) {
                setAiChatSettings(JSON.parse(saved));
            }
            const savedGlobal = localStorage.getItem('globalAutomation');
            if (savedGlobal) {
                setGlobalAutomation(JSON.parse(savedGlobal));
            }
        } catch (e) {
            console.error('Error loading AI settings:', e);
        }
    }, []);
    
    // Get current chat AI settings
    const getCurrentChatAiSettings = () => {
        if (!selectedChat) return { enabled: false, persona: 'whatsapp-marketing', systemPrompt: '' };
        return aiChatSettings[selectedChat.id] || { enabled: false, persona: 'whatsapp-marketing', systemPrompt: '' };
    };
    
    // Update current chat AI settings
    const updateCurrentChatAiSettings = (updates) => {
        if (!selectedChat) return;
        const currentSettings = getCurrentChatAiSettings();
        const newSettings = Object.assign({}, aiChatSettings);
        newSettings[selectedChat.id] = Object.assign({}, currentSettings, updates);
        setAiChatSettings(newSettings);
        localStorage.setItem('aiChatSettings', JSON.stringify(newSettings));
    };

    useEffect(() => {
        if (connectionStatus === 'connected') {
            loadData();
        }
    }, [connectionStatus]);

    const loadData = async () => {
        if (connectionStatus !== 'connected') {
            setError('Please connect to WhatsApp first');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            console.log(`Loading ${activeView}...`);
            
            if (activeView === 'chats') {
                const result = await window.api.invoke('get-whatsapp-chats');
                console.log('Chats result:', result);
                
                if (!result) {
                    setError('No response from server. Please check if WhatsApp is connected and try again.');
                } else if (result.success) {
                    setChats(result.chats || []);
                    console.log(`Loaded ${result.chats ? result.chats.length : 0} chats`);
                } else {
                    setError(result.error || 'Failed to load chats');
                    if (result.details) {
                        console.error('Error details:', result.details);
                    }
                }
            } else {
                const result = await window.api.invoke('get-whatsapp-contacts');
                console.log('Contacts result:', result);
                
                if (!result) {
                    setError('No response from server. Please check if WhatsApp is connected and try again.');
                } else if (result.success) {
                    setContacts(result.contacts || []);
                    console.log(`Loaded ${result.contacts ? result.contacts.length : 0} contacts`);
                } else {
                    setError(result.error || 'Failed to load contacts');
                    if (result.details) {
                        console.error('Error details:', result.details);
                    }
                }
            }
        } catch (error) {
            console.error('Error loading data:', error);
            setError(error.message || 'Unknown error occurred. Please check the console for details.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (connectionStatus === 'connected') {
            loadData();
        }
    }, [activeView]);

    // Listen for incoming messages for auto-responding
    useEffect(() => {
        const handleIncomingMessage = async (messageData) => {
            try {
                console.log('Received incoming message event:', messageData);
                
                // Check if global automation is enabled or chat-specific automation
                const chatSettings = aiChatSettings[messageData.chatId] || { enabled: false };
                
                console.log('Global automation:', globalAutomation, 'Chat settings:', chatSettings);
                
                if (globalAutomation || chatSettings.enabled) {
                    console.log('Auto-responding to message from:', messageData.chatId);
                    
                    // Skip if message body is empty
                    if (!messageData.body || !messageData.body.trim()) {
                        console.log('Skipping empty message');
                        return;
                    }
                    
                    try {
                        // Get conversation history
                        const result = await window.api.invoke('get-chat-messages', messageData.chatId, 10);
                        const conversationHistory = result.success ? (result.messages || []) : [];
                        
                        console.log('Got conversation history:', conversationHistory.length, 'messages');
                        
                        // Call AI API
                        const aiResponse = await callAiApi(messageData.body, conversationHistory, messageData.chatId);
                        
                        console.log('AI response generated:', aiResponse.substring(0, 50) + '...');
                        
                        // Send AI response via WhatsApp
                        const sendResult = await window.api.invoke('send-whatsapp-message', messageData.chatId, aiResponse);
                        
                        if (sendResult && sendResult.success) {
                            console.log('✅ Auto-responded successfully to:', messageData.chatId);
                        } else {
                            console.error('❌ Failed to send auto-response:', sendResult);
                        }
                    } catch (apiError) {
                        console.error('Error in auto-response process:', apiError);
                    }
                } else {
                    console.log('Auto-response disabled for this chat');
                }
            } catch (error) {
                console.error('Error auto-responding to message:', error);
            }
        };

        window.api.receiveMessage('incoming-message', handleIncomingMessage);
        
        return () => {
            window.api.removeListener('incoming-message', handleIncomingMessage);
        };
    }, [globalAutomation, aiChatSettings]);

    const loadChatMessages = async (chatId) => {
        if (!connectionStatus === 'connected') {
            setError('Please connect to WhatsApp first');
            return;
        }

        setLoadingMessages(true);
        setError(null);

        try {
            console.log('Loading messages for chat:', chatId);
            const result = await window.api.invoke('get-chat-messages', chatId, 100);
            console.log('Messages result:', result);
            
            if (!result) {
                setError('No response from server. Please try again.');
            } else if (result.success) {
                setMessages(result.messages || []);
                console.log(`Loaded ${result.messages ? result.messages.length : 0} messages`);
                
                // Auto-scroll to bottom after messages load
                setTimeout(() => {
                    const container = document.getElementById('messages-container');
                    if (container) {
                        container.scrollTop = container.scrollHeight;
                    }
                }, 100);
            } else {
                setError(result.error || 'Failed to load messages');
            }
        } catch (error) {
            console.error('Error loading messages:', error);
            setError(error.message || 'Unknown error occurred');
        } finally {
            setLoadingMessages(false);
        }
    };

    const handleChatClick = (chat) => {
        setSelectedChat(chat);
        setMessages([]);
        loadChatMessages(chat.id);
    };

    const handleBackToList = () => {
        setSelectedChat(null);
        setMessages([]);
        setMessageInput('');
    };

    // AI Persona System Prompts
    const getPersonaPrompt = (persona) => {
        const prompts = {
            'whatsapp-marketing': 'You are a WhatsApp marketing expert. Help users with marketing strategies, campaign ideas, and customer engagement tips. Be friendly, professional, and provide actionable advice.',
            'college-student': 'You are a helpful college student assistant. Help with studies, assignments, time management, and student life advice. Be friendly, relatable, and supportive.',
            'product-based': 'You are a product expert assistant. Help users with product information, features, troubleshooting, and recommendations. Be knowledgeable, clear, and helpful.'
        };
        return prompts[persona] || prompts['whatsapp-marketing'];
    };

    // Call AI API
    const callAiApi = async (userMessage, conversationHistory = [], chatId = null) => {
        try {
            // Get AI settings for this chat
            const chatSettings = chatId ? (aiChatSettings[chatId] || { enabled: false, persona: 'whatsapp-marketing', systemPrompt: '' }) : getCurrentChatAiSettings();
            
            // Build messages array with conversation history
            const messages = [];
            
            // Get system prompt (custom or persona default)
            const systemPromptText = (chatSettings.systemPrompt && chatSettings.systemPrompt.trim()) ? chatSettings.systemPrompt.trim() : getPersonaPrompt(chatSettings.persona || 'whatsapp-marketing');
            
            // Add conversation history (last 10 messages for context)
            const recentHistory = conversationHistory.slice(-10);
            
            // If there's a system prompt and no history, include it in the first message
            if (systemPromptText && recentHistory.length === 0) {
                messages.push({
                    role: 'user',
                    content: `${systemPromptText}\n\nUser: ${userMessage}`
                });
            } else {
                // Add system prompt as context if we have history
                if (systemPromptText && recentHistory.length > 0) {
                    // Include system prompt in the conversation context
                    const contextMessages = recentHistory.map(msg => {
                        return {
                            role: msg.fromMe ? 'user' : 'assistant',
                            content: msg.body || ''
                        };
                    });
                    
                    // Prepend system prompt to the first message for context
                    if (contextMessages.length > 0) {
                        contextMessages[0].content = `[System: ${systemPromptText}]\n\n${contextMessages[0].content}`;
                    }
                    
                    for (let i = 0; i < contextMessages.length; i++) {
                        messages.push(contextMessages[i]);
                    }
                } else {
                    // No system prompt, just add history
                    recentHistory.forEach(msg => {
                        messages.push({
                            role: msg.fromMe ? 'user' : 'assistant',
                            content: msg.body || ''
                        });
                    });
                }
                
                // Add current user message
                messages.push({
                    role: 'user',
                    content: userMessage
                });
            }

            let response;
            try {
                response = await fetch('https://api.a0.dev/ai/llm', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ messages })
                });

                if (!response.ok) {
                    throw new Error(`AI API error: ${response.status}`);
                }

                const data = await response.json();
                return data.completion || 'Sorry, I could not generate a response.';
            } catch (error) {
                console.error('AI API Error:', error);
                // Return a fallback message instead of throwing
                if (error.message && error.message.includes('Failed to fetch')) {
                    console.warn('Network error: AI API may be unreachable');
                    return 'Sorry, I could not connect to the AI service. Please check your internet connection.';
                }
                throw error;
            }
        } catch (error) {
            console.error('Error in callAiApi:', error);
            return 'Sorry, I encountered an error while processing your request.';
        }
    };

    // Handle sending message
    const handleSendMessage = async () => {
        if (!messageInput.trim() || sendingMessage) return;
        if (!selectedChat) return;

        const userMessage = messageInput.trim();
        setMessageInput('');
        setSendingMessage(true);

        try {
            // Add user message to local state immediately
            const userMessageObj = {
                id: 'temp-' + Date.now(),
                body: userMessage,
                timestamp: Math.floor(Date.now() / 1000),
                fromMe: true,
                hasMedia: false
            };
            setMessages(function(prev) {
                var newMessages = prev.slice();
                newMessages.push(userMessageObj);
                return newMessages;
            });

            // Scroll to bottom
            setTimeout(() => {
                const container = document.getElementById('messages-container');
                if (container) {
                    container.scrollTop = container.scrollHeight;
                }
            }, 100);

            // Get current chat AI settings
            const currentSettings = getCurrentChatAiSettings();
            
            // If AI chat is enabled, get AI response
            if (currentSettings.enabled || globalAutomation) {
                try {
                    // Get conversation history (exclude temp messages)
                    const conversationHistory = messages.filter(m => !m.id.startsWith('temp-'));
                    
                    // Call AI API
                    const aiResponse = await callAiApi(userMessage, conversationHistory);
                    
                    // Add AI response to messages
                    const aiMessageObj = {
                        id: 'ai-' + Date.now(),
                        body: aiResponse,
                        timestamp: Math.floor(Date.now() / 1000),
                        fromMe: false,
                        hasMedia: false,
                        author: 'AI Assistant',
                        authorName: 'AI Assistant'
                    };
                    setMessages(function(prev) {
                        var newMessages = prev.slice();
                        newMessages.push(aiMessageObj);
                        return newMessages;
                    });

                    // Scroll to bottom after AI response
                    setTimeout(() => {
                        const container = document.getElementById('messages-container');
                        if (container) {
                            container.scrollTop = container.scrollHeight;
                        }
                    }, 100);
                } catch (aiError) {
                    console.error('AI Error:', aiError);
                    // Add error message
                    const errorMessageObj = {
                        id: 'error-' + Date.now(),
                        body: '⚠️ AI response failed. Please try again.',
                        timestamp: Math.floor(Date.now() / 1000),
                        fromMe: false,
                        hasMedia: false
                    };
                    setMessages(function(prev) {
                        var newMessages = prev.slice();
                        newMessages.push(errorMessageObj);
                        return newMessages;
                    });
                }
            }
        } catch (error) {
            console.error('Error sending message:', error);
            alert('Error sending message: ' + error.message);
        } finally {
            setSendingMessage(false);
        }
    };

    // Handle Enter key in message input
    const handleMessageInputKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    const filteredChats = chats.filter(chat => 
        chat.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredContacts = contacts.filter(contact => 
        (contact.name && contact.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (contact.number && contact.number.includes(searchTerm))
    );

    if (connectionStatus !== 'connected') {
        return (
            <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
                <div style={{ fontSize: '64px', marginBottom: '20px' }}>📱</div>
                <h3 style={{ color: '#6b7280', marginBottom: '12px' }}>Not Connected</h3>
                <p style={{ color: '#9ca3af', fontSize: '14px' }}>
                    Please connect to WhatsApp to view your chats and contacts
                </p>
            </div>
        );
    }

    // If a chat is selected, show chat view
    if (selectedChat) {
        // Format chat name
        let displayName = selectedChat.name || 'Unknown';
        if (displayName.match(/^\d+$/)) {
            displayName = displayName.replace(/(\d{2})(\d{5})(\d{5})/, '+$1 $2 $3');
        }
        const firstLetter = displayName ? displayName.charAt(0).toUpperCase() : '?';

        return (
            <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 200px)', minHeight: '600px' }}>
                {/* Chat Header */}
                <div style={{
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    padding: '12px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    color: 'white',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    borderRadius: 'var(--border-radius) var(--border-radius) 0 0'
                }}>
                    <button
                        onClick={handleBackToList}
                        style={{
                            background: 'rgba(255,255,255,0.2)',
                            border: 'none',
                            borderRadius: '50%',
                            width: '40px',
                            height: '40px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            color: 'white',
                            fontSize: '20px',
                            transition: 'background 0.2s',
                            flexShrink: 0
                        }}
                        onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.3)'}
                        onMouseLeave={(e) => e.target.style.background = 'rgba(255,255,255,0.2)'}
                    >
                        ←
                    </button>
                    <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '50%',
                        background: 'rgba(255,255,255,0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '24px',
                        flexShrink: 0
                    }}>
                        {selectedChat.isGroup ? '👥' : firstLetter}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {displayName}
                        </h3>
                        {selectedChat.isGroup && (
                            <p style={{ margin: '2px 0 0 0', fontSize: '13px', opacity: 0.9 }}>
                                Group
                            </p>
                        )}
                    </div>
                    {/* AI Chat Toggle Button */}
                    <button
                        onClick={() => setShowAiSettings(!showAiSettings)}
                        style={{
                            background: (getCurrentChatAiSettings().enabled || globalAutomation) ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.2)',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '8px 12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            cursor: 'pointer',
                            color: 'white',
                            fontSize: '13px',
                            fontWeight: '600',
                            transition: 'background 0.2s',
                            flexShrink: 0
                        }}
                        onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.3)'}
                        onMouseLeave={(e) => e.target.style.background = (getCurrentChatAiSettings().enabled || globalAutomation) ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.2)'}
                        title={(getCurrentChatAiSettings().enabled || globalAutomation) ? 'AI Chat Enabled' : 'Enable AI Chat'}
                    >
                        {(getCurrentChatAiSettings().enabled || globalAutomation) ? '🤖 AI ON' : '🤖 AI OFF'}
                    </button>
                </div>
                
                {/* AI Settings Panel */}
                {showAiSettings && (
                    <div style={{
                        background: 'white',
                        padding: '20px',
                        borderBottom: '1px solid #e5e7eb',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                    }}>
                        {/* Global Automation Toggle */}
                        <div style={{ marginBottom: '20px', padding: '12px', background: '#f0f9ff', borderRadius: '8px', border: '1px solid #bae6fd' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={globalAutomation}
                                    onChange={(e) => {
                                        setGlobalAutomation(e.target.checked);
                                        localStorage.setItem('globalAutomation', JSON.stringify(e.target.checked));
                                    }}
                                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                />
                                <div style={{ flex: 1 }}>
                                    <span style={{ fontSize: '15px', fontWeight: '700', color: '#1a1a2e', display: 'block' }}>
                                        🌐 Global AI Automation
                                    </span>
                                    <span style={{ fontSize: '12px', color: '#6b7280', display: 'block', marginTop: '4px' }}>
                                        Enable AI auto-responses for ALL contacts and chats automatically
                                    </span>
                                </div>
                            </label>
                        </div>
                        
                        {/* Per-Chat AI Settings */}
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '12px' }}>
                                <input
                                    type="checkbox"
                                    checked={getCurrentChatAiSettings().enabled}
                                    onChange={(e) => updateCurrentChatAiSettings({ enabled: e.target.checked })}
                                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                />
                                <span style={{ fontSize: '15px', fontWeight: '600', color: '#1a1a2e' }}>
                                    Enable AI Chat Assistant (This Chat Only)
                                </span>
                            </label>
                        </div>
                        
                        {(getCurrentChatAiSettings().enabled || globalAutomation) && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {/* AI Persona Selection */}
                                <div>
                                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600', color: '#4b5563' }}>
                                        AI Persona:
                                    </label>
                                    <select
                                        value={getCurrentChatAiSettings().persona || 'whatsapp-marketing'}
                                        onChange={(e) => updateCurrentChatAiSettings({ persona: e.target.value })}
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            border: '1px solid #e5e7eb',
                                            borderRadius: '8px',
                                            fontSize: '14px',
                                            background: 'white',
                                            cursor: 'pointer',
                                            outline: 'none'
                                        }}
                                    >
                                        <option value="whatsapp-marketing">📱 WhatsApp Marketing AI</option>
                                        <option value="college-student">🎓 College Student Handling AI</option>
                                        <option value="product-based">📦 Product-Based AI</option>
                                    </select>
                                </div>
                                
                                {/* Custom System Prompt */}
                                <div>
                                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600', color: '#4b5563' }}>
                                        Custom System Prompt (Optional):
                                    </label>
                                    <textarea
                                        value={getCurrentChatAiSettings().systemPrompt || ''}
                                        onChange={(e) => updateCurrentChatAiSettings({ systemPrompt: e.target.value })}
                                        placeholder="Enter custom system prompt or leave empty to use persona default..."
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            border: '1px solid #e5e7eb',
                                            borderRadius: '8px',
                                            fontSize: '14px',
                                            minHeight: '80px',
                                            resize: 'vertical',
                                            fontFamily: 'inherit',
                                            outline: 'none'
                                        }}
                                    />
                                    <p style={{ marginTop: '6px', fontSize: '12px', color: '#6b7280' }}>
                                        Leave empty to use the default persona prompt, or customize it for specific behavior.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Messages Area */}
                <div style={{
                    flex: 1,
                    background: '#efeae2',
                    backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cdefs%3E%3Cpattern id=\'grid\' width=\'60\' height=\'60\' patternUnits=\'userSpaceOnUse\'%3E%3Cpath d=\'M 60 0 L 0 0 0 60\' fill=\'none\' stroke=\'%23d4d4d4\' stroke-width=\'0.5\' opacity=\'0.3\'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width=\'100%25\' height=\'100%25\' fill=\'url(%23grid)\'/%3E%3C/svg%3E")',
                    overflowY: 'auto',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    borderRadius: '0 0 var(--border-radius) var(--border-radius)'
                }}
                className="whatsapp-scrollbar"
                id="messages-container">
                    {loadingMessages ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#667781' }}>
                            <div className="loading" style={{ margin: '0 auto 16px' }}></div>
                            <p>Loading messages...</p>
                        </div>
                    ) : messages.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#667781' }}>
                            <p>No messages yet</p>
                            <p style={{ fontSize: '14px', marginTop: '8px' }}>Start a conversation!</p>
                        </div>
                    ) : (
                        messages.map((message, index) => {
                            const isFromMe = message.fromMe;
                            const prevMessage = index > 0 ? messages[index - 1] : null;
                            const isGroup = selectedChat.isGroup;
                            
                            // Show avatar if it's a new sender or first message
                            const showAvatar = !isFromMe && (
                                !prevMessage || 
                                prevMessage.fromMe || 
                                (isGroup && prevMessage.author !== message.author) ||
                                (!isGroup && prevMessage.from !== message.from)
                            );
                            
                            // Get author initial for avatar
                            let authorInitial = firstLetter;
                            if (isGroup && message.authorName && !isFromMe) {
                                // Extract first letter from author name (handle phone numbers)
                                const name = message.authorName.replace(/[^a-zA-Z]/g, ''); // Remove non-letters
                                if (name) {
                                    authorInitial = name.charAt(0).toUpperCase();
                                } else {
                                    // If it's a phone number, use first digit
                                    authorInitial = message.authorName.charAt(0).toUpperCase() || '?';
                                }
                            }
                            
                            // Format timestamp
                            let timeDisplay = '';
                            if (message.timestamp) {
                                try {
                                    const timestamp = message.timestamp < 946684800000 ? message.timestamp * 1000 : message.timestamp;
                                    const date = new Date(timestamp);
                                    if (!isNaN(date.getTime())) {
                                        timeDisplay = date.toLocaleTimeString('en-US', {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                            hour12: true
                                        });
                                    }
                                } catch (e) {
                                    console.warn('Error formatting message timestamp:', e);
                                }
                            }

                            // Determine media type icon
                            let mediaIcon = '📎';
                            if (message.media) {
                                if (message.media.mimetype) {
                                    if (message.media.mimetype.startsWith('image/')) mediaIcon = '🖼️';
                                    else if (message.media.mimetype.startsWith('video/')) mediaIcon = '🎥';
                                    else if (message.media.mimetype.startsWith('audio/')) mediaIcon = '🎵';
                                    else if (message.media.mimetype.includes('pdf')) mediaIcon = '📄';
                                    else if (message.media.mimetype.includes('document')) mediaIcon = '📄';
                                }
                            }

                            return (
                                <div
                                    key={message.id || index}
                                    style={{
                                        display: 'flex',
                                        justifyContent: isFromMe ? 'flex-end' : 'flex-start',
                                        marginBottom: '8px'
                                    }}
                                >
                                    <div style={{
                                        maxWidth: '65%',
                                        display: 'flex',
                                        gap: '8px',
                                        flexDirection: isFromMe ? 'row-reverse' : 'row',
                                        alignItems: 'flex-end'
                                    }}>
                                        {/* Avatar for received messages */}
                                        {!isFromMe && showAvatar && (
                                            <div style={{
                                                width: '32px',
                                                height: '32px',
                                                borderRadius: '50%',
                                                background: 'linear-gradient(135deg, #00BFFF 0%, #10b981 100%)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '14px',
                                                color: 'white',
                                                fontWeight: '600',
                                                flexShrink: 0
                                            }}>
                                                {authorInitial}
                                            </div>
                                        )}
                                        {!isFromMe && !showAvatar && (
                                            <div style={{ width: '32px', flexShrink: 0 }}></div>
                                        )}

                                        {/* Message Bubble */}
                                        <div style={{
                                            background: isFromMe ? '#d9fdd3' : 'white',
                                            padding: message.hasMedia ? '4px' : '8px 12px',
                                            borderRadius: '8px',
                                            boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                                            position: 'relative',
                                            wordWrap: 'break-word',
                                            maxWidth: '100%'
                                        }}>
                                            {/* Author name for group messages */}
                                            {isGroup && !isFromMe && (message.authorName || message.author) && (
                                                <div style={{
                                                    fontSize: '13px',
                                                    fontWeight: '600',
                                                    color: '#667781',
                                                    marginBottom: '4px',
                                                    padding: '0 4px'
                                                }}>
                                                    {message.authorName || (message.author ? message.author.split('@')[0] : 'Unknown')}
                                                </div>
                                            )}
                                            
                                            {/* Media Display */}
                                            {message.hasMedia && (
                                                <div style={{ marginBottom: message.body ? '8px' : '0' }}>
                                                    {message.media && message.media.data && message.media.mimetype && message.media.mimetype.startsWith('image/') ? (
                                                        <div style={{ position: 'relative' }}>
                                                            <img 
                                                                src={`data:${message.media.mimetype};base64,${message.media.data}`}
                                                                alt="Media"
                                                                style={{
                                                                    maxWidth: '100%',
                                                                    maxHeight: '300px',
                                                                    borderRadius: '4px',
                                                                    display: 'block',
                                                                    objectFit: 'contain'
                                                                }}
                                                                onError={(e) => {
                                                                    // Hide image and show fallback
                                                                    const parent = e.target.parentElement;
                                                                    if (parent) {
                                                                        parent.innerHTML = `
                                                                            <div style="padding: 20px; text-align: center; background: rgba(0,0,0,0.05); border-radius: 4px; color: #667781;">
                                                                                <div style="font-size: 32px; margin-bottom: 8px;">${mediaIcon}</div>
                                                                                <div style="font-size: 12px;">Failed to load image</div>
                                                                            </div>
                                                                        `;
                                                                    }
                                                                }}
                                                            />
                                                        </div>
                                                    ) : (
                                                        <div style={{
                                                            padding: '20px',
                                                            textAlign: 'center',
                                                            background: 'rgba(0,0,0,0.05)',
                                                            borderRadius: '4px',
                                                            color: '#667781'
                                                        }}>
                                                            <div style={{ fontSize: '32px', marginBottom: '8px' }}>{mediaIcon}</div>
                                                            <div style={{ fontSize: '12px' }}>
                                                                {message.media && message.media.filename ? message.media.filename : 
                                                                 message.media && message.media.mimetype ? message.media.mimetype.split('/')[1].toUpperCase() : 
                                                                 'Media'}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            
                                            {/* Message Text */}
                                            {message.body && (
                                                <p style={{
                                                    margin: 0,
                                                    fontSize: '14.2px',
                                                    color: '#111b21',
                                                    lineHeight: '1.4',
                                                    whiteSpace: 'pre-wrap',
                                                    wordBreak: 'break-word',
                                                    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"'
                                                }}>
                                                    {message.body}
                                                </p>
                                            )}
                                            
                                            {/* Media error fallback - show when hasMedia but no media data */}
                                            {message.hasMedia && !message.media && (
                                                <div style={{
                                                    padding: '12px',
                                                    textAlign: 'center',
                                                    background: 'rgba(0,0,0,0.05)',
                                                    borderRadius: '4px',
                                                    color: '#667781',
                                                    fontSize: '13px'
                                                }}>
                                                    <div style={{ fontSize: '24px', marginBottom: '4px' }}>{mediaIcon}</div>
                                                    <div>Loading media...</div>
                                                </div>
                                            )}
                                            
                                            {/* Media error fallback - show when media failed to load */}
                                            {message.hasMedia && message.media && message.media.error && (
                                                <div style={{
                                                    padding: '12px',
                                                    textAlign: 'center',
                                                    background: 'rgba(0,0,0,0.05)',
                                                    borderRadius: '4px',
                                                    color: '#667781',
                                                    fontSize: '13px'
                                                }}>
                                                    <div style={{ fontSize: '24px', marginBottom: '4px' }}>{mediaIcon}</div>
                                                    <div>Failed to load media</div>
                                                </div>
                                            )}
                                            
                                            {/* Timestamp and Status */}
                                            <div style={{
                                                display: 'flex',
                                                justifyContent: 'flex-end',
                                                alignItems: 'center',
                                                gap: '4px',
                                                marginTop: '4px',
                                                paddingTop: '2px'
                                            }}>
                                                <span style={{
                                                    fontSize: '11px',
                                                    color: '#667781',
                                                    whiteSpace: 'nowrap'
                                                }}>
                                                    {timeDisplay}
                                                </span>
                                                {isFromMe && (
                                                    <span style={{ fontSize: '14px', color: '#667781' }}>
                                                        ✓
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
                
                {/* Message Input Area */}
                <div style={{
                    padding: '12px 20px',
                    background: 'white',
                    borderTop: '1px solid #e5e7eb',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    borderRadius: '0 0 var(--border-radius) var(--border-radius)'
                }}>
                    <input
                        type="text"
                        placeholder={(getCurrentChatAiSettings().enabled || globalAutomation) ? "Type a message (AI will respond)..." : "Type a message..."}
                        value={messageInput}
                        onChange={(e) => setMessageInput(e.target.value)}
                        onKeyPress={handleMessageInputKeyPress}
                        disabled={sendingMessage}
                        style={{
                            flex: 1,
                            padding: '10px 14px',
                            borderRadius: '20px',
                            border: '1px solid #e5e7eb',
                            fontSize: '14px',
                            outline: 'none',
                            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)',
                            background: sendingMessage ? '#f3f4f6' : 'white'
                        }}
                    />
                    <button
                        onClick={handleSendMessage}
                        disabled={!messageInput.trim() || sendingMessage}
                        style={{
                            background: (messageInput.trim() && !sendingMessage) ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : '#d1d5db',
                            color: 'white',
                            border: 'none',
                            borderRadius: '50%',
                            width: '40px',
                            height: '40px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '20px',
                            cursor: (messageInput.trim() && !sendingMessage) ? 'pointer' : 'not-allowed',
                            boxShadow: (messageInput.trim() && !sendingMessage) ? '0 2px 8px rgba(0,0,0,0.2)' : 'none',
                            transition: 'all 0.2s ease',
                            flexShrink: 0
                        }}
                        onMouseEnter={(e) => {
                            if (messageInput.trim() && !sendingMessage) {
                                e.target.style.transform = 'scale(1.05)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            e.target.style.transform = 'scale(1)';
                        }}
                    >
                        {sendingMessage ? '⏳' : '➤'}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div>
            {/* View Toggle - WhatsApp Style Header */}
            <div style={{ 
                marginBottom: '24px',
                background: 'white',
                borderRadius: 'var(--border-radius)',
                padding: '16px',
                boxShadow: 'var(--shadow-md)'
            }}>
                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                    <button
                        className={`btn ${activeView === 'chats' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setActiveView('chats')}
                        style={{ flex: 1 }}
                    >
                        💬 Chats ({chats.length})
                    </button>
                    <button
                        className={`btn ${activeView === 'contacts' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setActiveView('contacts')}
                        style={{ flex: 1 }}
                    >
                        👥 Contacts ({contacts.length})
                    </button>
                </div>

                {/* Search Bar - WhatsApp Style */}
                <div style={{ marginTop: '12px' }}>
                    <input
                        type="text"
                        placeholder={`🔍 Search ${activeView === 'chats' ? 'chats' : 'contacts'}...`}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '12px 16px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '24px',
                            fontSize: '15px',
                            background: '#f0f2f5',
                            transition: 'all 0.2s ease',
                            outline: 'none'
                        }}
                        onFocus={(e) => {
                            e.target.style.background = 'white';
                            e.target.style.borderColor = '#00BFFF';
                            e.target.style.boxShadow = '0 0 0 3px rgba(0, 191, 255, 0.1)';
                        }}
                        onBlur={(e) => {
                            e.target.style.background = '#f0f2f5';
                            e.target.style.borderColor = '#e5e7eb';
                            e.target.style.boxShadow = 'none';
                        }}
                    />
                </div>

                {/* Refresh Button */}
                <button
                    className="btn btn-success"
                    onClick={loadData}
                    disabled={loading}
                    style={{ 
                        marginTop: '12px', 
                        width: '100%',
                        padding: '12px',
                        fontSize: '15px',
                        fontWeight: '600'
                    }}
                >
                    {loading ? '⏳ Loading...' : '🔄 Refresh'}
                </button>
            </div>

            {/* Error Message */}
            {error && (
                <div className="card" style={{ 
                    marginBottom: '24px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '2px solid rgba(239, 68, 68, 0.3)'
                }}>
                    <p style={{ color: '#ef4444', margin: 0, fontWeight: '600' }}>❌ {error}</p>
                </div>
            )}

            {/* Loading State */}
            {loading && (
                <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
                    <div className="loading" style={{ margin: '0 auto 16px' }}></div>
                    <p style={{ color: '#6b7280' }}>Loading {activeView}...</p>
                </div>
            )}

            {/* Chats View - WhatsApp Style */}
            {!loading && activeView === 'chats' && (
                <div style={{ 
                    background: 'white',
                    borderRadius: 'var(--border-radius)',
                    overflow: 'hidden',
                    boxShadow: 'var(--shadow-md)'
                }}>
                    <div style={{
                        padding: '20px 24px',
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        color: 'white',
                        marginBottom: 0
                    }}>
                        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>💬</span>
                            <span>All Chats ({filteredChats.length})</span>
                        </h3>
                    </div>
                    
                    {filteredChats.length === 0 ? (
                        <div className="empty-state" style={{ padding: '60px 20px' }}>
                            <p>No chats found</p>
                            <p style={{ fontSize: '14px', color: '#9ca3af' }}>
                                {searchTerm ? 'Try a different search term' : 'Start a conversation to see chats here'}
                            </p>
                        </div>
                    ) : (
                        <div style={{ 
                            maxHeight: '70vh',
                            overflowY: 'auto',
                            background: '#f0f2f5'
                        }}
                        className="whatsapp-scrollbar">
                            {filteredChats.map((chat, index) => {
                                // Format timestamp - handle both seconds and milliseconds
                                let timeDisplay = '';
                                if (chat.timestamp) {
                                    try {
                                        // Check if timestamp is in seconds (less than year 2000 in ms) or milliseconds
                                        const timestamp = chat.timestamp < 946684800000 ? chat.timestamp * 1000 : chat.timestamp;
                                        const date = new Date(timestamp);
                                        
                                        // Check if date is valid
                                        if (!isNaN(date.getTime())) {
                                            const now = new Date();
                                            const diffTime = now - date;
                                            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                                            
                                            if (diffDays === 0) {
                                                // Today - show time only
                                                timeDisplay = date.toLocaleTimeString('en-US', {
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                    hour12: true
                                                });
                                            } else if (diffDays === 1) {
                                                // Yesterday
                                                timeDisplay = 'Yesterday';
                                            } else if (diffDays < 7) {
                                                // This week - show day name
                                                timeDisplay = date.toLocaleDateString('en-US', { weekday: 'short' });
                                            } else {
                                                // Older - show date
                                                timeDisplay = date.toLocaleDateString('en-US', {
                                                    month: '2-digit',
                                                    day: '2-digit',
                                                    year: 'numeric'
                                                });
                                            }
                                        }
                                    } catch (e) {
                                        console.warn('Error formatting timestamp:', e, chat.timestamp);
                                    }
                                }
                                
                                // Format chat name - handle phone numbers
                                let displayName = chat.name || 'Unknown';
                                if (displayName.match(/^\d+$/)) {
                                    // If name is just numbers, format as phone number
                                    displayName = displayName.replace(/(\d{2})(\d{5})(\d{5})/, '+$1 $2 $3');
                                }
                                
                                // Get first letter for avatar
                                const firstLetter = displayName ? displayName.charAt(0).toUpperCase() : '?';
                                
                                return (
                                    <div
                                        key={chat.id}
                                        style={{
                                            padding: '12px 16px',
                                            background: 'white',
                                            borderBottom: index < filteredChats.length - 1 ? '1px solid #e5e7eb' : 'none',
                                            cursor: 'pointer',
                                            transition: 'background-color 0.2s ease',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            position: 'relative'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundColor = '#f5f6f6';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = 'white';
                                        }}
                                        onClick={() => handleChatClick(chat)}
                                    >
                                        {/* Avatar */}
                                        <div style={{
                                            width: '56px',
                                            height: '56px',
                                            borderRadius: '50%',
                                            background: 'linear-gradient(135deg, #00BFFF 0%, #10b981 100%)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '24px',
                                            fontWeight: '600',
                                            color: 'white',
                                            flexShrink: 0,
                                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                                        }}>
                                            {chat.isGroup ? '👥' : firstLetter}
                                        </div>
                                        
                                        {/* Chat Info */}
                                        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            {/* Top Row: Name and Time */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <h4 style={{ 
                                                    margin: 0, 
                                                    fontSize: '17px', 
                                                    fontWeight: '600', 
                                                    color: '#111b21',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                    flex: 1
                                                }}>
                                                    {displayName}
                                                </h4>
                                                {timeDisplay && (
                                                    <span style={{
                                                        fontSize: '12px',
                                                        color: '#667781',
                                                        marginLeft: '8px',
                                                        flexShrink: 0
                                                    }}>
                                                        {timeDisplay}
                                                    </span>
                                                )}
                                            </div>
                                            
                                            {/* Bottom Row: Message Preview and Badges */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                {chat.lastMessage ? (
                                                    <p style={{
                                                        margin: 0,
                                                        fontSize: '14px',
                                                        color: chat.unreadCount > 0 ? '#111b21' : '#667781',
                                                        fontWeight: chat.unreadCount > 0 ? '500' : '400',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                        flex: 1
                                                    }}>
                                                        {chat.lastMessage.body ? (
                                                            chat.lastMessage.body.length > 50 
                                                                ? chat.lastMessage.body.substring(0, 50) + '...' 
                                                                : chat.lastMessage.body
                                                        ) : '📎 Media'}
                                                    </p>
                                                ) : (
                                                    <p style={{
                                                        margin: 0,
                                                        fontSize: '14px',
                                                        color: '#667781',
                                                        fontStyle: 'italic'
                                                    }}>
                                                        No messages
                                                    </p>
                                                )}
                                                
                                                {/* Badges */}
                                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                                                    {chat.isGroup && (
                                                        <span style={{
                                                            fontSize: '10px',
                                                            padding: '2px 6px',
                                                            background: 'rgba(0, 191, 255, 0.15)',
                                                            color: '#00BFFF',
                                                            borderRadius: '10px',
                                                            fontWeight: '600'
                                                        }}>GROUP</span>
                                                    )}
                                                    {chat.unreadCount > 0 && (
                                                        <span style={{
                                                            fontSize: '12px',
                                                            padding: '2px 8px',
                                                            background: '#10b981',
                                                            color: 'white',
                                                            borderRadius: '12px',
                                                            fontWeight: '700',
                                                            minWidth: '20px',
                                                            textAlign: 'center'
                                                        }}>
                                                            {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Contacts View */}
            {!loading && activeView === 'contacts' && (
                <div className="card">
                    <h3 style={{ marginBottom: '12px', color: '#00BFFF', fontSize: '14px', fontWeight: '700' }}>
                        👥 All Contacts ({filteredContacts.length})
                    </h3>
                    {filteredContacts.length === 0 ? (
                        <div className="empty-state">
                            <p>No contacts found</p>
                            <p style={{ fontSize: '14px', color: '#9ca3af' }}>
                                {searchTerm ? 'Try a different search term' : 'No contacts available'}
                            </p>
                        </div>
                    ) : (
                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Number</th>
                                        <th>Type</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredContacts.map(contact => (
                                        <tr key={contact.id}>
                                            <td style={{ fontWeight: '600' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    {contact.profilePicUrl ? (
                                                        <img
                                                            src={contact.profilePicUrl}
                                                            alt={contact.name}
                                                            style={{
                                                                width: '32px',
                                                                height: '32px',
                                                                borderRadius: '50%',
                                                                objectFit: 'cover'
                                                            }}
                                                            onError={(e) => {
                                                                e.target.style.display = 'none';
                                                            }}
                                                        />
                                                    ) : (
                                                        <div style={{
                                                            width: '32px',
                                                            height: '32px',
                                                            borderRadius: '50%',
                                                            background: 'var(--primary-gradient)',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            fontSize: '16px'
                                                        }}>
                                                            {contact.name ? contact.name.charAt(0).toUpperCase() : '?'}
                                                        </div>
                                                    )}
                                                    <span>{contact.name}</span>
                                                </div>
                                            </td>
                                            <td style={{ fontFamily: 'monospace', fontSize: '13px', color: '#6b7280' }}>
                                                {contact.number || 'N/A'}
                                            </td>
                                            <td>
                                                {contact.isGroup && (
                                                    <span className="status-badge status-connected">Group</span>
                                                )}
                                                {contact.isBusiness && (
                                                    <span className="status-badge status-pending">Business</span>
                                                )}
                                                {!contact.isGroup && !contact.isBusiness && (
                                                    <span className="status-badge status-sent">Individual</span>
                                                )}
                                            </td>
                                            <td>
                                                {contact.isMyContact ? (
                                                    <span className="status-badge status-connected">Saved</span>
                                                ) : (
                                                    <span className="status-badge status-pending">Not Saved</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

