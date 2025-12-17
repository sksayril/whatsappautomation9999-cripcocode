const { Client, LocalAuth, MessageMedia, List } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Ensure puppeteer is available
let puppeteer;
try {
    puppeteer = require('puppeteer');
} catch (e) {
    try {
        puppeteer = require('puppeteer-core');
    } catch (e2) {
        console.error('❌ Cannot find puppeteer or puppeteer-core:', e2.message);
        throw new Error('Puppeteer is required but not found. Please ensure puppeteer is installed.');
    }
}

class WhatsAppClient extends EventEmitter {
    constructor(sessionDir, db) {
        super();
        this.sessionDir = sessionDir;
        this.db = db;
        this.client = null;
        this.isConnected = false;
        this.currentCampaign = null;
        this.isPaused = false;
        this.unreadCheckInterval = null;
        this.isLoggedOut = false; // Track if user intentionally logged out
        // Message debouncing: track pending messages per chat
        this.messageQueues = {}; // { chatId: { messages: [], timer: null } }
        this.debounceDelay = 3000; // Wait 3 seconds after last message before replying
    }

    connect() {
        // Reset logout flag when manually connecting
        this.isLoggedOut = false;

        if (this.client) {
            this.disconnect();
        }

        try {
            this.client = new Client({
                authStrategy: new LocalAuth({
                    dataPath: this.sessionDir,
                    clientId: 'default-client'
                }),
                puppeteer: {
                    headless: true,
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-accelerated-2d-canvas',
                        '--no-first-run',
                        '--no-zygote',
                        '--disable-gpu',
                        '--disable-software-rasterizer',
                        '--disable-extensions',
                        '--disable-logging',
                        '--log-level=3',
                        '--silent'
                    ],
                    handleSIGINT: false,
                    handleSIGTERM: false,
                    handleSIGHUP: false,
                    // Prevent chrome_debug.log file creation
                    ignoreDefaultArgs: ['--enable-logging', '--v=1']
                },
                restartOnAuthFail: true
            });

            this.setupEventHandlers();

            // Add browser close/crash detection
            this.setupBrowserMonitoring();

            // Initialize with error handling
            this.client.initialize().catch((error) => {
                console.error('Error initializing WhatsApp client:', error);
                this.isConnected = false;

                // Ignore EBUSY errors (file locking) - these are common on Windows
                if (error.code === 'EBUSY' || error.message.includes('EBUSY') || error.message.includes('resource busy')) {
                    console.log('File locked during initialization (EBUSY), this is normal. Retrying...');
                    // Retry after a delay
                    setTimeout(() => {
                        if (!this.isConnected) {
                            console.log('Retrying initialization after file lock...');
                            this.connect();
                        }
                    }, 2000);
                    return;
                }

                // Check if it's a browser disconnection error
                const errorMessage = error.message || '';
                if (
                    errorMessage.includes('browser has disconnected') ||
                    errorMessage.includes('Target closed') ||
                    errorMessage.includes('Protocol error') ||
                    errorMessage.includes('Navigation failed')
                ) {
                    console.log('Browser disconnected, will attempt to reconnect...');
                    // Emit disconnected event so UI can show reconnect option
                    this.emit('disconnected', 'Browser disconnected. Reconnecting...');

                    // Auto-reconnect after a delay
                    setTimeout(() => {
                        if (!this.isConnected) {
                            console.log('Attempting to reconnect...');
                            this.reconnect();
                        }
                    }, 3000);
                } else {
                    this.emit('error', error);
                }
            });
        } catch (error) {
            console.error('Error creating WhatsApp client:', error);
            this.isConnected = false;
            this.emit('error', error);
        }
    }

    setupEventHandlers() {
        if (!this.client) return;

        this.client.on('qr', (qr) => {
            qrcode.generate(qr, { small: true });
            this.emit('qr', qr);
        });

        this.client.on('ready', async () => {
            console.log('WhatsApp Client is ready!');
            this.isConnected = true;

            // Set up message listener for auto-responding
            this.setupMessageListener();

            // Process existing unread messages
            setTimeout(() => {
                this.processUnreadMessages();
            }, 3000); // Wait 3 seconds for client to fully initialize

            // Set up periodic check for unread messages (every 30 seconds)
            this.unreadCheckInterval = setInterval(() => {
                if (this.isConnected && this.client) {
                    this.processUnreadMessages();
                }
            }, 30000); // Check every 30 seconds

            // Get phone number from client info
            let phoneNumber = null;
            try {
                // Wait a bit for client info to be fully available
                await new Promise((resolve) => setTimeout(resolve, 1500));

                const info = this.client.info;
                if (info && info.wid) {
                    phoneNumber = info.wid.user || info.wid._serialized || null;
                    if (phoneNumber && phoneNumber.includes('@')) {
                        phoneNumber = phoneNumber.split('@')[0];
                    }
                }

                // If still no phone number, try to get it from state
                if (!phoneNumber) {
                    try {
                        const state = await this.client.getState();
                        console.log('Client state:', state);
                        // State should be CONNECTED if ready
                        if (state !== 'CONNECTED') {
                            console.warn('Client ready but state is:', state);
                        }
                    } catch (err) {
                        console.error('Error getting client state:', err);
                    }
                }
            } catch (error) {
                console.error('Error getting phone number:', error);
            }

            console.log('Emitting ready event with phone number:', phoneNumber);
            this.emit('ready', phoneNumber);
        });

        this.client.on('authenticated', () => {
            console.log('WhatsApp Client authenticated!');
            this.emit('authenticated');

            // After authentication, periodically check if client is ready
            // Sometimes 'ready' event doesn't fire immediately, especially in production builds
            let checkAttempts = 0;
            const maxAttempts = 20; // Check for up to 20 seconds (20 * 1 second)

            const checkReadyInterval = setInterval(async () => {
                checkAttempts++;

                // Stop checking if already connected or max attempts reached
                if (this.isConnected || checkAttempts > maxAttempts) {
                    clearInterval(checkReadyInterval);
                    if (checkAttempts > maxAttempts && !this.isConnected) {
                        console.warn('Max attempts reached checking client readiness after authentication');
                    }
                    return;
                }

                if (this.client) {
                    try {
                        // Check client state
                        const state = await this.client.getState();
                        console.log(`[Attempt ${checkAttempts}/${maxAttempts}] Client state after authentication:`, state);

                        if (state === 'CONNECTED') {
                            // Wait a bit more for client.info to be available
                            await new Promise((resolve) => setTimeout(resolve, 500));

                            if (this.client.info) {
                                console.log('Client is CONNECTED and info is available, checking details...');
                                const info = this.client.info;
                                if (info && info.wid) {
                                    this.isConnected = true;
                                    let phoneNumber = null;
                                    try {
                                        if (info.wid.user || info.wid._serialized) {
                                            phoneNumber = info.wid.user || info.wid._serialized || null;
                                            if (phoneNumber && phoneNumber.includes('@')) {
                                                phoneNumber = phoneNumber.split('@')[0];
                                            }
                                        }
                                    } catch (error) {
                                        console.error('Error getting phone number after auth:', error);
                                    }
                                    console.log('Emitting ready event manually with phone:', phoneNumber);
                                    clearInterval(checkReadyInterval);
                                    this.emit('ready', phoneNumber);
                                    return;
                                }
                            } else {
                                console.log('Client state is CONNECTED but info not yet available, waiting...');
                            }
                        }
                    } catch (error) {
                        console.error(`[Attempt ${checkAttempts}] Error checking client readiness:`, error.message);
                        // Continue checking on next interval
                    }
                } else {
                    clearInterval(checkReadyInterval);
                }
            }, 1000); // Check every 1 second
        });

        this.client.on('auth_failure', (msg) => {
            console.error('Authentication failure:', msg);
            this.isConnected = false;
            this.emit('auth_failure', msg);
        });

        this.client.on('disconnected', (reason) => {
            console.log('WhatsApp Client disconnected:', reason);
            this.isConnected = false;
            this.emit('disconnected', reason);

            // Don't auto-reconnect on LOGOUT - user intentionally logged out
            if (reason && reason.toUpperCase().includes('LOGOUT')) {
                console.log('User logged out. Session preserved. Not auto-reconnecting.');
                this.isLoggedOut = true;
                // Session is preserved, user can manually reconnect
                this.emit('disconnected', 'Logged out. Session preserved. Click Connect to reconnect.');
                return;
            }

            // Don't auto-reconnect on AUTH_FAILURE - needs manual intervention
            if (reason && reason.toUpperCase().includes('AUTH_FAILURE')) {
                console.log('Authentication failure. Not auto-reconnecting.');
                this.isLoggedOut = true;
                return;
            }

            // Reset logout flag for other disconnections
            this.isLoggedOut = false;

            // Auto-reconnect only for unexpected disconnections (browser crashes, network issues)
            if (reason && (reason.includes('browser') || reason.includes('closed') || reason.includes('disconnected'))) {
                console.log('Unexpected disconnection detected, will attempt to reconnect...');
                setTimeout(() => {
                    if (!this.isConnected && !this.isLoggedOut) {
                        console.log('Attempting to reconnect after disconnection...');
                        this.reconnect();
                    }
                }, 3000);
            }
        });

        this.client.on('loading_screen', (percent, message) => {
            this.emit('loading_screen', percent, message);
        });

        // Handle errors
        this.client.on('error', (error) => {
            console.error('WhatsApp Client error:', error);
            this.isConnected = false;

            // Check if it's a browser disconnection error
            const errorMessage = error.message || '';
            if (
                errorMessage.includes('browser has disconnected') ||
                errorMessage.includes('Target closed') ||
                errorMessage.includes('Protocol error') ||
                errorMessage.includes('Navigation failed')
            ) {
                console.log('Browser disconnected error detected, attempting to reconnect...');
                this.emit('disconnected', 'Browser disconnected. Reconnecting...');

                // Auto-reconnect after a delay
                setTimeout(() => {
                    if (!this.isConnected) {
                        console.log('Attempting to reconnect after error...');
                        this.reconnect();
                    }
                }, 3000);
            } else {
                this.emit('error', error);
            }
        });

        // Handle remote_session_saved
        this.client.on('remote_session_saved', () => {
            console.log('Remote session saved');
        });

        // Handle change_state event - helps track connection state changes
        this.client.on('change_state', (state) => {
            console.log('WhatsApp client state changed:', state);
            if (state === 'CONNECTED' && !this.isConnected) {
                // If state is CONNECTED but isConnected flag is false, update it
                setTimeout(() => {
                    if (this.client && this.client.info) {
                        this.isConnected = true;
                        let phoneNumber = null;
                        try {
                            const info = this.client.info;
                            if (info && info.wid) {
                                phoneNumber = info.wid.user || info.wid._serialized || null;
                                if (phoneNumber && phoneNumber.includes('@')) {
                                    phoneNumber = phoneNumber.split('@')[0];
                                }
                            }
                        } catch (error) {
                            console.error('Error getting phone number on state change:', error);
                        }
                        console.log('Client connected via state change, emitting ready with phone:', phoneNumber);
                        this.emit('ready', phoneNumber);
                    }
                }, 1000);
            }
        });
    }

    disconnect() {
        // Clear unread check interval
        if (this.unreadCheckInterval) {
            clearInterval(this.unreadCheckInterval);
            this.unreadCheckInterval = null;
        }

        // Clear all message queue timers
        for (const chatId in this.messageQueues) {
            if (this.messageQueues[chatId].timer) {
                clearTimeout(this.messageQueues[chatId].timer);
            }
        }
        this.messageQueues = {};

        if (this.client) {
            try {
                // Remove all listeners before destroying to prevent errors
                this.client.removeAllListeners();

                // Destroy client with error handling for file locking issues
                this.client.destroy().catch((error) => {
                    // Ignore EBUSY errors (file locking) - these are common on Windows
                    if (error.code === 'EBUSY' || error.message.includes('EBUSY') || error.message.includes('resource busy')) {
                        console.log('File is locked (EBUSY), this is normal on Windows. Session will be preserved.');
                    } else {
                        console.error('Error destroying WhatsApp client:', error);
                    }
                });
            } catch (error) {
                // Ignore EBUSY errors during disconnect
                if (error.code === 'EBUSY' || error.message.includes('EBUSY') || error.message.includes('resource busy')) {
                    console.log('File is locked during disconnect (EBUSY), this is normal. Session preserved.');
                } else {
                    console.error('Error disconnecting WhatsApp client:', error);
                }
            }
            this.client = null;
            this.isConnected = false;
        }
    }

    reconnect() {
        console.log('Reconnecting WhatsApp client...');
        this.isConnected = false;

        // Clean up existing client
        if (this.client) {
            try {
                // Remove all event listeners to prevent memory leaks
                this.client.removeAllListeners();
                this.client.destroy().catch((error) => {
                    // Ignore EBUSY errors - file locking is normal on Windows
                    if (error.code === 'EBUSY' || error.message.includes('EBUSY') || error.message.includes('resource busy')) {
                        console.log('File locked during reconnect cleanup (EBUSY), continuing...');
                    } else {
                        console.error('Error destroying client during reconnect:', error);
                    }
                });
            } catch (error) {
                // Ignore EBUSY errors
                if (error.code === 'EBUSY' || error.message.includes('EBUSY') || error.message.includes('resource busy')) {
                    console.log('File locked during reconnect cleanup (EBUSY), continuing...');
                } else {
                    console.error('Error cleaning up client during reconnect:', error);
                }
            }
            this.client = null;
        }

        // Wait a bit before reconnecting to allow file locks to release
        setTimeout(() => {
            console.log('Starting reconnection process...');
            this.emit('disconnected', 'Reconnecting...');
            // Emit a status update to show we're reconnecting
            this.emit('connection-status', {
                status: 'reconnecting',
                message: 'Reconnecting... Please wait for QR code.',
                percent: 0
            });
            this.connect();
        }, 3000); // Increased delay to allow file locks to release
    }

    setupBrowserMonitoring() {
        if (!this.client) return;

        // Monitor browser process - access through client's internal structure
        try {
            // Wait for client to initialize before accessing browser
            this.client.once('ready', () => {
                try {
                    const browser = this.client.pupBrowser || this.client._pupBrowser;
                    if (browser) {
                        browser.on('disconnected', () => {
                            console.log('Browser disconnected unexpectedly');
                            this.isConnected = false;
                            this.emit('disconnected', 'Browser disconnected. Reconnecting...');
                            setTimeout(() => {
                                if (!this.isConnected) {
                                    this.reconnect();
                                }
                            }, 2000);
                        });
                    }
                } catch (err) {
                    console.log('Could not set up browser monitoring:', err.message);
                }
            });
        } catch (err) {
            console.log('Could not set up browser monitoring:', err.message);
        }
    }

    async startCampaign(campaign, campaignData, db, progressCallback) {
        if (!this.isConnected || !this.client) {
            throw new Error('WhatsApp is not connected');
        }

        // Check if campaign can start
        const canStart = db.canStartCampaign(campaign.id);
        if (!canStart.canStart) {
            throw new Error(canStart.reason);
        }

        // Update campaign status to running
        db.updateCampaignStatus(campaign.id, 'running');

        this.currentCampaign = campaign;
        this.isPaused = false;
        const { templateId, contactIds, delay, randomDelay, mediaPath, pauseAfter } = campaignData;

        let template = null;
        if (templateId) {
            template = db.getTemplate(templateId);
        }

        const contacts = db.getContactsByIds(contactIds);
        let sent = 0;
        let failed = 0;
        const campaignInfo = db.getCampaign(campaign.id);

        const sendMessage = async (contact, index) => {
            // Check if paused
            if (this.isPaused) {
                // Wait until resumed
                while (this.isPaused) {
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                }
            }

            // Check limits before sending
            const messagesLast24h = db.getCampaignMessagesLast24Hours(campaign.id);
            if (messagesLast24h >= campaignInfo.dailyLimit) {
                throw new Error(`24-hour limit reached (${messagesLast24h}/${campaignInfo.dailyLimit})`);
            }

            if (sent >= campaignInfo.totalLimit) {
                throw new Error(`Total limit reached (${sent}/${campaignInfo.totalLimit})`);
            }

            try {
                // Format phone number
                let phone = contact.phone.replace(/\D/g, '');
                if (!phone.startsWith('91') && phone.length === 10) {
                    phone = '91' + phone;
                }
                const chatId = `${phone}@c.us`;

                // Prepare message
                let message = contact.message || '';
                if (template && template.body) {
                    message = template.body.replace(/\{\{name\}\}/g, contact.name);
                }
                if (!message && contact.message) {
                    message = contact.message;
                }

                // Simulate typing before sending (human-like behavior for campaigns)
                await this.simulateTyping(chatId, 1, 3);

                // Send media if provided
                if (mediaPath && fs.existsSync(mediaPath)) {
                    const media = MessageMedia.fromFilePath(mediaPath);
                    await this.client.sendMessage(chatId, media, { caption: message || '' });
                } else {
                    // Send text message
                    await this.client.sendMessage(chatId, message);
                }

                // Update status and track message
                sent++;
                db.trackMessage(campaign.id, contact.id);
                db.updateContactStatus(contact.id, 'sent', new Date().toISOString());
                db.addLog(campaign.id, contact.id, 'sent');
                db.updateCampaignProgress(campaign.id, sent, failed);

                progressCallback({
                    campaignId: campaign.id,
                    contactId: contact.id,
                    status: 'sent',
                    sent,
                    failed,
                    total: contacts.length,
                    current: index + 1
                });

                // Apply random delay AFTER sending message (before next message)
                // This helps avoid rate limiting and makes sending more natural
                if (index < contacts.length - 1) {
                    // Don't delay after the last message
                    let waitTime = delay || 5000;
                    if (randomDelay) {
                        const min = randomDelay.min || 1000; // Default 1 second
                        const max = randomDelay.max || 9000; // Default 9 seconds
                        waitTime = Math.floor(Math.random() * (max - min + 1)) + min;
                    }

                    // Wait before sending next message
                    await new Promise((resolve) => setTimeout(resolve, waitTime));
                }

                // Pause after X messages
                if (pauseAfter && index > 0 && (index + 1) % pauseAfter === 0) {
                    await new Promise((resolve) => setTimeout(resolve, 30000)); // 30 second pause
                }
            } catch (error) {
                console.error(`Error sending to ${contact.phone}:`, error);
                failed++;
                db.updateContactStatus(contact.id, 'failed');
                db.addLog(campaign.id, contact.id, 'failed', error.message);
                db.updateCampaignProgress(campaign.id, sent, failed);

                progressCallback({
                    campaignId: campaign.id,
                    contactId: contact.id,
                    status: 'failed',
                    error: error.message,
                    sent,
                    failed,
                    total: contacts.length,
                    current: index + 1
                });
            }
        };

        // Send messages sequentially
        try {
            for (let i = 0; i < contacts.length; i++) {
                // Check if campaign was paused externally
                if (this.isPaused) {
                    db.updateCampaignStatus(campaign.id, 'paused');
                    break;
                }

                // Check limits
                const messagesLast24h = db.getCampaignMessagesLast24Hours(campaign.id);
                if (messagesLast24h >= campaignInfo.dailyLimit || sent >= campaignInfo.totalLimit) {
                    db.updateCampaignStatus(campaign.id, 'completed');
                    break;
                }

                await sendMessage(contacts[i], i);
            }

            // Complete campaign if all messages sent or limit reached
            if (!this.isPaused) {
                db.completeCampaign(campaign.id);
                db.updateCampaignStatus(campaign.id, 'completed');
            }
        } catch (error) {
            console.error('Campaign error:', error);
            db.updateCampaignStatus(campaign.id, 'paused');
            throw error;
        } finally {
            this.currentCampaign = null;
        }

        progressCallback({
            campaignId: campaign.id,
            status: this.isPaused ? 'paused' : 'completed',
            sent,
            failed,
            total: contacts.length
        });
    }

    pauseCampaign() {
        this.isPaused = true;
    }

    resumeCampaign() {
        this.isPaused = false;
    }

    async isReady() {
        if (!this.client) {
            return false;
        }

        try {
            // Check actual client state, don't rely on isConnected flag
            // This is important because isConnected might not be set yet
            const state = await this.client.getState();
            const isStateConnected = state === 'CONNECTED';

            // Also check if client.info is available (indicates fully ready)
            const hasInfo = this.client.info && this.client.info.wid;

            // Update isConnected flag if state is CONNECTED
            if (isStateConnected && !this.isConnected) {
                this.isConnected = true;
            }

            return isStateConnected && hasInfo;
        } catch (error) {
            console.error('Error checking client state:', error);
            return false;
        }
    }

    getPhoneNumber() {
        if (!this.client) {
            return null;
        }

        try {
            // Check if client is ready even if isConnected flag isn't set
            const info = this.client.info;
            if (info && info.wid) {
                let phoneNumber = info.wid.user || info.wid._serialized || null;
                if (phoneNumber && phoneNumber.includes('@')) {
                    phoneNumber = phoneNumber.split('@')[0];
                }
                return phoneNumber;
            }
        } catch (error) {
            console.error('Error getting phone number:', error);
        }

        return null;
    }

    // Helper function to check if message is emoji-only
    isEmojiOnly(text) {
        if (!text || !text.trim()) return false;

        // Remove whitespace
        const cleaned = text.trim();

        // Check if message contains only emojis and whitespace
        // Unicode ranges for emojis
        const emojiRegex = /^[\s\p{Emoji}\p{Emoji_Presentation}\p{Emoji_Modifier_Base}\p{Emoji_Modifier}\p{Emoji_Component}]+$/u;

        // Check if it's only emojis (no regular text)
        const hasOnlyEmojis = emojiRegex.test(cleaned);

        // Also check if there are no regular alphanumeric characters
        const hasNoText = !/[a-zA-Z0-9]/.test(cleaned);

        return hasOnlyEmojis && hasNoText;
    }

    /**
     * Validate if a message is from a human or is system-generated/marketing/promotional/transactional
     * @param {string} message - The message to validate
     * @returns {Promise<boolean>} - Returns true if message is from a human, false if it's system-generated/marketing/promotional/transactional
     */
    async validateMessageFromHuman(message) {
        if (!message || !message.trim()) {
            return false;
        }

        try {
            const validationPrompt = `You are a message validator. Your task is to determine if a WhatsApp message is from a REAL HUMAN or if it is:
1. Marketing message (advertising products/services)
2. Promotional message (offers, discounts, deals)
3. Transactional message (OTP, payment confirmations, system notifications)
4. System-generated message (automated alerts, notifications, bot messages)

Analyze the following message and respond with ONLY one word:
- "HUMAN" if the message is from a real human asking a question or having a conversation
- "SYSTEM" if the message is marketing, promotional, transactional, or system-generated

Message to analyze: "${message.trim()}"

Respond with only "HUMAN" or "SYSTEM":`;

            const messages = [
                {
                    role: 'user',
                    content: validationPrompt
                }
            ];

            const url = new URL('https://api.a0.dev/ai/llm');
            const postData = JSON.stringify({ messages });

            return new Promise((resolve, reject) => {
                const options = {
                    hostname: url.hostname,
                    port: url.port || 443,
                    path: url.pathname,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(postData)
                    }
                };

                const req = https.request(options, (res) => {
                    let data = '';

                    res.on('data', (chunk) => {
                        data += chunk;
                    });

                    res.on('end', () => {
                        try {
                            if (res.statusCode !== 200) {
                                console.error(`❌ Message validation API error: ${res.statusCode}`);
                                // If validation fails, default to allowing the message (fail-safe)
                                resolve(true);
                                return;
                            }

                            const response = JSON.parse(data);
                            const completion = (response.completion || '').trim().toUpperCase();

                            // Check if response indicates HUMAN message
                            const isHuman = completion.includes('HUMAN') && !completion.includes('SYSTEM');

                            console.log(`🔍 Message validation result: ${completion} (isHuman: ${isHuman})`);

                            resolve(isHuman);
                        } catch (error) {
                            console.error('❌ Error parsing validation API response:', error);
                            // If parsing fails, default to allowing the message (fail-safe)
                            resolve(true);
                        }
                    });
                });

                req.on('error', (error) => {
                    console.error('❌ Message validation API request error:', error);
                    // If request fails, default to allowing the message (fail-safe)
                    resolve(true);
                });

                req.write(postData);
                req.end();
            });
        } catch (error) {
            console.error('❌ Error in validateMessageFromHuman:', error);
            // If validation fails, default to allowing the message (fail-safe)
            return true;
        }
    }

    async callAiApi(userMessage, conversationHistory = []) {
        try {
            // Build system prompt for Aurangabad School AI Assistant
            const systemPrompt = `You are "Aurangabad School AI Assistant", the official AI assistant of 
Aurangabad Public School (Bengali Medium), Murshidabad, India.

CRITICAL RESPONSE RULES:
- ONLY respond to questions. Do NOT provide extra information or unsolicited details.
- ONLY answer questions related to Arpanabad Public School. Refuse to answer anything outside school context.
- If asked about topics unrelated to the school, politely decline: "I can only help with questions about Arpanabad Public School. Please contact the school office for other inquiries."
- Keep responses concise and direct - answer only what is asked, nothing more.
- Do NOT add greetings, pleasantries, or extra explanations unless specifically asked.
- Do NOT provide information about other schools, general education topics, or non-school matters.

Your role is to help students, parents, and visitors by providing 
accurate, polite, and clear information about the school ONLY when asked.

School Overview:
- School Name: Arpanabad Public School
- Medium: Bengali Medium
- Managed by: Shibham Education & Social Welfare Trust
- Motto: "Not just education, but building the future"
- Location: Nimtita, Arpanabad, Murshidabad
- Website: www.apsschool.org
- Email: info.aps19@gmail.com
- Contact Numbers: 9735241028, 9832755305, 9932194003

Academic Structure:
- Classes: Pre-Primary to Higher Secondary
- System: Semester-based academic system
- Evaluation: Class tests, unit tests, semester exams, and model tests
- Special support for weak students through remedial classes

Admissions:
- Admission forms are available at the school office
- Admission tests depend on class level:
  - Classes I–II: Oral/basic assessment
  - Classes III onwards: Written test (Bengali, English, Mathematics, GK/Science)
- Required documents:
  - Birth Certificate
  - Transfer Certificate (if applicable)
  - Aadhaar Card copy
  - Passport-size photographs

Facilities & Features:
- Smart classrooms
- Experienced and qualified teachers
- Computer education
- Multimedia-based teaching
- Clean, safe, and disciplined campus
- Co-curricular activities (sports, cultural programs, educational tours)
- Scholarship for meritorious students
- Hostel facilities (where applicable)

Rules & Discipline:
- School uniform is compulsory
- Mobile phones and electronic gadgets are not allowed
- Regular attendance is mandatory
- Respect for teachers, staff, and peers is required

Parent Interaction:
- Parent-Teacher Meetings are conducted regularly
- Special days include Class Teacher Parents Day and General Parents Day
- Parents are expected to support discipline and academic progress

Branches:
- New branches at Umarpur and Jangipur
- Separate Boys and Girls campuses
- Purbanchal Branch Director: Mr. Mufac Kharul Islam (Contact: 9647444211)

Language Handling:
- Respond politely in simple English.
- If the user writes in Bengali or Hinglish, reply in the same language.
- Keep explanations simple and parent-friendly.

Behavior Rules:
- Always be respectful, helpful, and informative.
- Do not provide false or unverified information.
- If information is not available, politely say so and suggest contacting the school office.
- Never give legal, medical, or financial advice.
- Represent the school positively and professionally at all times.
- STRICTLY answer only school-related questions. Decline all other topics.

Goal:
Your main goal is to answer questions about the school ONLY. 
Answer questions directly without extra information. 
Refuse to answer anything outside the school context.`;

            // Build messages array
            const messages = [];

            // Add system prompt as first message
            messages.push({
                role: 'user',
                content: systemPrompt
            });

            // Add conversation history (last 10 messages for context)
            const recentHistory = conversationHistory.slice(-10);
            recentHistory.forEach((msg) => {
                messages.push({
                    role: msg.fromMe ? 'user' : 'assistant',
                    content: msg.body || ''
                });
            });

            // Add current user message
            messages.push({
                role: 'user',
                content: userMessage
            });

            // Call AI API
            const url = new URL('https://api.a0.dev/ai/llm');
            const postData = JSON.stringify({ messages });

            return new Promise((resolve, reject) => {
                const options = {
                    hostname: url.hostname,
                    port: url.port || 443,
                    path: url.pathname,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(postData)
                    }
                };

                const req = https.request(options, (res) => {
                    let data = '';

                    res.on('data', (chunk) => {
                        data += chunk;
                    });

                    res.on('end', () => {
                        try {
                            if (res.statusCode !== 200) {
                                throw new Error(`AI API error: ${res.statusCode}`);
                            }

                            const response = JSON.parse(data);
                            const completion = response.completion || 'Sorry, I could not generate a response.';
                            resolve(completion);
                        } catch (error) {
                            console.error('Error parsing AI API response:', error);
                            reject(error);
                        }
                    });
                });

                req.on('error', (error) => {
                    console.error('AI API request error:', error);
                    reject(error);
                });

                req.write(postData);
                req.end();
            });
        } catch (error) {
            console.error('Error in callAiApi:', error);
            throw error;
        }
    }

    async getChats() {
        if (!this.isConnected || !this.client) {
            throw new Error('WhatsApp is not connected');
        }

        try {
            // Verify client state before proceeding
            const state = await this.client.getState();
            if (state !== 'CONNECTED') {
                throw new Error(`WhatsApp client is not connected. Current state: ${state}`);
            }

            // Get all chats using whatsapp-web.js API
            const chats = await this.client.getChats();

            if (!chats || !Array.isArray(chats)) {
                console.warn('getChats returned invalid data:', chats);
                return [];
            }

            // Map chats to a simpler format
            return chats
                .map((chat) => {
                    try {
                        return {
                            id: chat.id ? chat.id._serialized || chat.id.user || String(chat.id) : 'unknown',
                            name: chat.name || (chat.id && chat.id.user) || 'Unknown',
                            isGroup: chat.isGroup || false,
                            unreadCount: chat.unreadCount || 0,
                            lastMessage: chat.lastMessage
                                ? {
                                      body: chat.lastMessage.body || '',
                                      timestamp: chat.lastMessage.timestamp || null,
                                      from: chat.lastMessage.from || null
                                  }
                                : null,
                            timestamp: chat.timestamp || null
                        };
                    } catch (mapError) {
                        console.error('Error mapping chat:', mapError, chat);
                        return null;
                    }
                })
                .filter((chat) => chat !== null); // Remove any null entries
        } catch (error) {
            console.error('Error getting chats:', error);
            throw error;
        }
    }

    async getContacts() {
        if (!this.isConnected || !this.client) {
            throw new Error('WhatsApp is not connected');
        }

        try {
            // Verify client state before proceeding
            const state = await this.client.getState();
            if (state !== 'CONNECTED') {
                throw new Error(`WhatsApp client is not connected. Current state: ${state}`);
            }

            // Get all contacts using whatsapp-web.js API
            const contacts = await this.client.getContacts();

            if (!contacts || !Array.isArray(contacts)) {
                console.warn('getContacts returned invalid data:', contacts);
                return [];
            }

            // Map contacts to a simpler format
            return contacts
                .map((contact) => {
                    try {
                        return {
                            id: contact.id ? contact.id._serialized || contact.id.user || String(contact.id) : 'unknown',
                            name: contact.name || contact.pushname || contact.number || 'Unknown',
                            number: contact.number || (contact.id && contact.id.user) || '',
                            isUser: contact.isUser || false,
                            isMyContact: contact.isMyContact || false,
                            isGroup: contact.isGroup || false,
                            isBusiness: contact.isBusiness || false,
                            profilePicUrl: contact.profilePicUrl || null
                        };
                    } catch (mapError) {
                        console.error('Error mapping contact:', mapError, contact);
                        return null;
                    }
                })
                .filter((contact) => contact !== null); // Remove any null entries
        } catch (error) {
            console.error('Error getting contacts:', error);
            throw error;
        }
    }

    async getChatMessages(chatId, limit = 50) {
        if (!this.isConnected || !this.client) {
            throw new Error('WhatsApp is not connected');
        }

        try {
            // Verify client state before proceeding
            const state = await this.client.getState();
            if (state !== 'CONNECTED') {
                throw new Error(`WhatsApp client is not connected. Current state: ${state}`);
            }

            // Get all chats first to find the one we need
            const allChats = await this.client.getChats();
            let chat = null;

            // Find the chat by ID
            for (const c of allChats) {
                const chatIdSerialized = c.id ? c.id._serialized || c.id.user || String(c.id) : null;
                if (chatIdSerialized === chatId) {
                    chat = c;
                    break;
                }
            }

            if (!chat) {
                throw new Error('Chat not found');
            }

            // Fetch messages from the chat
            // fetchMessages returns messages in reverse chronological order (newest first)
            const messages = await chat.fetchMessages({ limit: limit });

            if (!messages || !Array.isArray(messages)) {
                console.warn('fetchMessages returned invalid data:', messages);
                return [];
            }

            // Reverse to get chronological order (oldest first, newest last)
            // This ensures newest messages appear at the bottom when rendered (like WhatsApp)
            const chronologicalMessages = [...messages].reverse();

            // Get current user's ID to determine if message is from me
            const myId = this.client.info ? this.client.info.wid._serialized : null;

            // Map messages to a simpler format
            const mappedMessages = [];

            for (const message of chronologicalMessages) {
                try {
                    const isFromMe = message.fromMe || (message.from && myId && message.from === myId);

                    let mediaData = null;
                    if (message.hasMedia) {
                        try {
                            const media = await message.downloadMedia();
                            if (media) {
                                mediaData = {
                                    mimetype: media.mimetype || 'image/jpeg',
                                    data: media.data, // Base64 data
                                    filename: media.filename || null
                                };
                            }
                        } catch (mediaError) {
                            console.warn('Error downloading media:', mediaError);
                            mediaData = { error: 'Failed to load media' };
                        }
                    }

                    // Get author name for group messages
                    // Skip contact fetching to avoid API compatibility issues
                    // Just extract from author ID directly
                    let authorName = null;
                    if (message.author && !isFromMe) {
                        try {
                            // Try to get contact by ID (optional, may fail due to WhatsApp Web API changes)
                            try {
                                const contact = await this.client.getContactById(message.author);
                                if (contact) {
                                    authorName = contact.name || contact.pushname || contact.number || null;
                                }
                            } catch (contactError) {
                                // Silently skip contact fetching if it fails (API compatibility issue)
                                // We'll use the author ID directly
                            }

                            // If no name found, extract from author ID
                            if (!authorName && message.author) {
                                // Author ID format is usually like "1234567890@c.us"
                                const authorId = message.author.split('@')[0];
                                if (authorId) {
                                    authorName = authorId;
                                }
                            }
                        } catch (error) {
                            // Final fallback: extract number from author ID
                            if (message.author) {
                                const authorId = message.author.split('@')[0];
                                authorName = authorId || message.author;
                            }
                        }
                    }

                    mappedMessages.push({
                        id: message.id._serialized || message.id.id || String(message.id),
                        body: message.body || '',
                        timestamp: message.timestamp || null,
                        from: message.from || null,
                        fromMe: isFromMe,
                        author: message.author || null,
                        authorName: authorName,
                        hasMedia: message.hasMedia || false,
                        media: mediaData,
                        type: message.type || 'chat',
                        isForwarded: message.isForwarded || false,
                        isStarred: message.isStarred || false
                    });
                } catch (mapError) {
                    console.error('Error mapping message:', mapError, message);
                }
            }

            // Return messages in chronological order (oldest first, newest last)
            // This ensures newest messages appear at the bottom when rendered (like WhatsApp)
            return mappedMessages;
        } catch (error) {
            console.error('Error getting chat messages:', error);
            throw error;
        }
    }

    /**
     * Mark all messages in a chat as read (seen)
     */
    async markMessagesAsSeen(chatId) {
        if (!this.client || !this.isConnected) {
            console.log('⚠️ Cannot mark as seen - client not connected');
            return false;
        }

        try {
            const chat = await this.client.getChatById(chatId);
            if (chat) {
                await chat.sendSeen();
                console.log('✅ Marked messages as seen for chat:', chatId);
                return true;
            }
        } catch (error) {
            console.error('❌ Error marking messages as seen:', error);
            // Don't throw - this is not critical
            return false;
        }
        return false;
    }

    /**
     * Simulate human typing behavior with dynamic timing
     * @param {string} chatId - The chat ID
     * @param {number} minSeconds - Minimum typing duration in seconds
     * @param {number} maxSeconds - Maximum typing duration in seconds
     */
    async simulateTyping(chatId, minSeconds = 1, maxSeconds = 4) {
        if (!this.client || !this.isConnected) {
            console.log('⚠️ Cannot simulate typing - client not connected');
            return false;
        }

        try {
            const chat = await this.client.getChatById(chatId);
            if (!chat) {
                console.log('⚠️ Chat not found for typing simulation');
                return false;
            }

            // Calculate dynamic typing duration (simulates human behavior)
            const typingDuration = Math.floor(Math.random() * (maxSeconds - minSeconds + 1) + minSeconds) * 1000;

            console.log(`⌨️ Starting typing indicator for ${typingDuration / 1000} seconds...`);

            // Start typing
            await chat.sendStateTyping();

            // Wait for dynamic duration (simulates human typing time)
            await new Promise((resolve) => setTimeout(resolve, typingDuration));

            // Stop typing
            await chat.clearState();

            console.log('✅ Typing indicator stopped');
            return true;
        } catch (error) {
            console.error('❌ Error simulating typing:', error);
            // Try to clear state even if there was an error
            try {
                const chat = await this.client.getChatById(chatId);
                if (chat) {
                    await chat.clearState();
                }
            } catch (clearError) {
                // Ignore clear errors
            }
            return false;
        }
    }

    async sendMessage(chatId, message) {
        if (!this.client || !this.isConnected) {
            throw new Error('WhatsApp is not connected');
        }

        try {
            // Verify client state
            const state = await this.client.getState();
            if (state !== 'CONNECTED') {
                throw new Error(`WhatsApp client is not connected. Current state: ${state}`);
            }

            // Simulate typing before sending (human-like behavior)
            await this.simulateTyping(chatId, 1, 3);

            // Send message
            await this.client.sendMessage(chatId, message);
            return { success: true };
        } catch (error) {
            console.error('Error sending message:', error);
            throw error;
        }
    }

    /**
     * Process queued messages for a chat after debounce delay
     * Combines multiple consecutive messages into one reply
     */
    async processQueuedMessages(chatId) {
        if (!this.messageQueues[chatId] || this.messageQueues[chatId].messages.length === 0) {
            return;
        }

        const queue = this.messageQueues[chatId];
        const messages = queue.messages;

        // Clear the queue
        queue.messages = [];
        queue.timer = null;

        if (messages.length === 0) {
            return;
        }

        console.log(`📬 Processing ${messages.length} queued message(s) from chat: ${chatId}`);

        try {
            // Combine all messages into one (join with newlines or spaces)
            // Use the last message body as primary, but combine context from all
            const combinedMessage = messages.map((m) => m.body).join(' ');
            const lastMessage = messages[messages.length - 1];

            console.log(`💬 Combined ${messages.length} messages into one. Last message: ${lastMessage.body.substring(0, 50)}`);

            // Process automated reply with combined message
            const automatedReplyHandled = await this.processAutomatedReply(chatId, combinedMessage);

            // Only emit event for frontend AI auto-response if automated flow system didn't handle it
            if (!automatedReplyHandled) {
                // Emit only the last message to frontend
                this.emit('incoming-message', {
                    chatId: chatId,
                    body: lastMessage.body,
                    timestamp: lastMessage.timestamp,
                    author: lastMessage.author,
                    hasMedia: lastMessage.hasMedia
                });
            } else {
                console.log('⚠️ Automated flow handled the queued messages, skipping AI auto-response to prevent duplicates');
            }
        } catch (error) {
            console.error('❌ Error processing queued messages:', error);
            console.error('Error stack:', error.stack);
        }
    }

    /**
     * Queue a message for debounced processing
     * If multiple messages come quickly, they'll be combined into one reply
     */
    queueMessageForProcessing(chatId, message) {
        // Initialize queue for this chat if it doesn't exist
        if (!this.messageQueues[chatId]) {
            this.messageQueues[chatId] = {
                messages: [],
                timer: null
            };
        }

        const queue = this.messageQueues[chatId];

        // Add message to queue
        queue.messages.push(message);
        console.log(`📥 Queued message ${queue.messages.length} from ${chatId}. Waiting for more messages...`);

        // Clear existing timer
        if (queue.timer) {
            clearTimeout(queue.timer);
        }

        // Set new timer to process messages after debounce delay
        queue.timer = setTimeout(() => {
            console.log(`⏰ Debounce timer expired for ${chatId}. Processing ${queue.messages.length} queued message(s)...`);
            this.processQueuedMessages(chatId);
        }, this.debounceDelay);
    }

    setupMessageListener() {
        if (!this.client) {
            console.log('Cannot setup message listener - client not available');
            return;
        }

        console.log('Setting up message listener for automated replies...');

        // Remove any existing message listeners to prevent duplicates
        this.client.removeAllListeners('message');

        // Listen for incoming messages
        this.client.on('message', async (message) => {
            try {
                // Only respond to messages that are not from us
                if (message.fromMe) {
                    return;
                }

                // Skip stickers - don't respond to stickers
                if (message.hasMedia && message.type === 'sticker') {
                    console.log('⚠️ Skipping sticker message - no response');
                    return;
                }

                // Only process text messages (skip media-only messages without text)
                if (!message.body || !message.body.trim()) {
                    return;
                }

                const chatId = message.from;
                const messageBody = message.body.trim();

                // Skip emoji-only messages - don't respond to emoji-only messages
                if (this.isEmojiOnly(messageBody)) {
                    console.log('⚠️ Skipping emoji-only message - no response');
                    return;
                }

                console.log('📨 New message received from:', chatId, 'Body:', messageBody.substring(0, 50));

                // Queue message for debounced processing (instead of processing immediately)
                // This ensures multiple consecutive messages result in only one reply
                this.queueMessageForProcessing(chatId, {
                    body: messageBody,
                    timestamp: message.timestamp,
                    author: message.author,
                    hasMedia: message.hasMedia
                });
            } catch (error) {
                console.error('❌ Error handling incoming message:', error);
                console.error('Error stack:', error.stack);
            }
        });

        console.log('✅ Message listener set up successfully');
    }

    async processAutomatedReply(chatId, messageBody) {
        if (!this.db || !this.isConnected || !this.client) {
            console.log(
                '⚠️ Skipping automated reply - prerequisites not met. db:',
                !!this.db,
                'isConnected:',
                this.isConnected,
                'client:',
                !!this.client
            );
            return false;
        }

        try {
            // Verify client state
            let state;
            try {
                state = await this.client.getState();
            } catch (stateError) {
                console.error('❌ Error getting client state:', stateError);
                return false;
            }

            if (state !== 'CONNECTED') {
                console.log('⚠️ Skipping automated reply - client not connected (state:', state, ')');
                return false;
            }

            console.log('✅ Client is connected, proceeding with AI-based automated reply');

            // Extract phone number from chatId (format: 1234567890@c.us)
            const phone = chatId.split('@')[0];

            if (!phone || !messageBody || !messageBody.trim()) {
                console.log('Skipping automated reply - invalid phone or empty message');
                return false;
            }

            // Skip emoji-only messages - don't respond to emoji-only messages
            if (this.isEmojiOnly(messageBody)) {
                console.log('⚠️ Skipping emoji-only message - no response');
                return false;
            }

            // Validate if message is from a human (not marketing/promotional/transactional/system-generated)
            console.log('🔍 Validating if message is from a human...');
            const isHumanMessage = await this.validateMessageFromHuman(messageBody);

            if (!isHumanMessage) {
                console.log('⚠️ Skipping automated reply - message appears to be marketing/promotional/transactional/system-generated');
                console.log('📝 Message preview:', messageBody.substring(0, 100));
                return false; // Don't reply to non-human messages
            }

            console.log('✅ Message validated as human message');
            console.log('🤖 Processing AI-based automated reply for phone:', phone, 'message:', messageBody.substring(0, 50));

            // Get conversation history for AI context
            let conversationHistory = [];
            try {
                const chat = await this.client.getChatById(chatId);
                if (chat) {
                    const messages = await chat.fetchMessages({ limit: 10 });
                    conversationHistory = messages.map((msg) => ({
                        body: msg.body || '',
                        fromMe: msg.fromMe || false
                    }));
                }
            } catch (historyError) {
                console.log('Could not fetch conversation history for AI:', historyError.message);
            }

            // Call AI API with user's message
            let aiResponse = null;
            try {
                console.log('🤖 Calling AI API with user message:', messageBody.substring(0, 50));
                aiResponse = await this.callAiApi(messageBody, conversationHistory);
                console.log('✅ AI API response received:', aiResponse ? aiResponse.substring(0, 50) : '(empty)');
            } catch (aiError) {
                console.error('❌ Error calling AI API:', aiError);
                console.error('AI API error details:', aiError.message);
                // Don't send anything if AI fails - return false so other handlers can process
                return false;
            }

            // Send AI response with human-like behavior
            if (aiResponse && aiResponse.trim()) {
                try {
                    // Step 1: Mark all messages as seen (read) first
                    console.log('👁️ Marking messages as seen...');
                    await this.markMessagesAsSeen(chatId);

                    // Step 2: Simulate typing with dynamic timing (human-like behavior)
                    // Typing duration based on message length (longer messages = longer typing)
                    const messageLength = aiResponse.trim().length;
                    let minTyping = 1; // Minimum 1 second
                    let maxTyping = 3; // Default max 3 seconds

                    // Adjust typing duration based on message length
                    if (messageLength > 100) {
                        maxTyping = 5; // Longer messages = longer typing (up to 5 seconds)
                    } else if (messageLength > 50) {
                        maxTyping = 4; // Medium messages = medium typing (up to 4 seconds)
                    }

                    console.log(`⌨️ Simulating typing for ${minTyping}-${maxTyping} seconds...`);
                    await this.simulateTyping(chatId, minTyping, maxTyping);

                    // Step 3: Send the reply
                    await this.client.sendMessage(chatId, aiResponse.trim());
                    console.log('✅ Sent AI-based automated reply to', phone);
                    return true; // Message sent, handled by automated reply
                } catch (sendError) {
                    console.error('❌ Error sending AI response:', sendError);
                    console.error('Error details:', sendError.message);
                    // Try to clear typing state if it's still active
                    try {
                        const chat = await this.client.getChatById(chatId);
                        if (chat) {
                            await chat.clearState();
                        }
                    } catch (clearError) {
                        // Ignore clear errors
                    }
                    return false;
                }
            } else {
                console.log('⚠️ AI API returned empty response, skipping send');
                return false;
            }
        } catch (error) {
            console.error('❌ Error processing automated reply:', error);
            console.error('Error message:', error.message);
            console.error('Error stack:', error.stack);
            // Don't throw - we don't want to break message handling
            return false;
        }
    }

    async processUnreadMessages() {
        if (!this.client || !this.isConnected) {
            console.log('Skipping unread messages check - client not ready');
            return;
        }

        try {
            // Check client state first
            const state = await this.client.getState();
            if (state !== 'CONNECTED') {
                console.log('Skipping unread messages check - client not connected (state:', state, ')');
                return;
            }

            console.log('Processing unread messages...');

            // Get all chats with error handling
            let chats;
            try {
                chats = await this.client.getChats();
            } catch (getChatsError) {
                // WhatsApp Web.js sometimes fails with internal errors - this is okay, we'll use the message event instead
                console.log('Could not fetch chats (this is normal if WhatsApp Web structure changed):', getChatsError.message);
                return;
            }

            if (!chats || !Array.isArray(chats)) {
                console.warn('No chats found or invalid data');
                return;
            }

            let totalUnread = 0;
            let processedCount = 0;

            // Process each chat with unread messages
            for (const chat of chats) {
                try {
                    const unreadCount = chat.unreadCount || 0;

                    if (unreadCount > 0) {
                        totalUnread += unreadCount;
                        const chatId = chat.id ? chat.id._serialized || chat.id.user || String(chat.id) : null;
                        const chatName = chat.name || chatId || 'Unknown';

                        console.log(`Found ${unreadCount} unread messages in chat: ${chatName} (${chatId})`);

                        // Get recent messages from this chat (get more than unread count to ensure we get unread ones)
                        let messages;
                        try {
                            messages = await chat.fetchMessages({ limit: Math.min(unreadCount + 5, 50) });
                            console.log(`Fetched ${messages ? messages.length : 0} messages from chat ${chatName} (unread: ${unreadCount})`);
                        } catch (fetchError) {
                            console.error(`Error fetching messages from chat ${chatName}:`, fetchError);
                            continue;
                        }

                        if (messages && Array.isArray(messages) && messages.length > 0) {
                            // Process unread messages (most recent first, but only unread ones)
                            // Reverse to get chronological order, then take the last unreadCount messages
                            const reversedMessages = messages.slice().reverse();
                            const unreadMessages = reversedMessages.slice(-unreadCount);

                            console.log(`Found ${unreadMessages.length} messages to check for chat ${chatName} (isGroup: ${chat.isGroup || false})`);

                            // Skip group messages (automated flows typically work with individual chats)
                            if (chat.isGroup) {
                                console.log(`Skipping group chat: ${chatName}`);
                                continue;
                            }

                            const messageChatId = chatId;

                            // Collect all valid messages from this chat to combine them
                            const validMessages = [];
                            for (let i = 0; i < unreadMessages.length; i++) {
                                const message = unreadMessages[i];

                                // Skip if message is from us
                                if (message.fromMe) {
                                    console.log(`Skipping message ${i + 1}: from us`);
                                    continue;
                                }

                                // Skip stickers - don't respond to stickers
                                if (message.hasMedia && message.type === 'sticker') {
                                    console.log(`Skipping message ${i + 1}: sticker message - no response`);
                                    continue;
                                }

                                // Skip if no body (media-only messages without text)
                                if (!message.body || !message.body.trim()) {
                                    console.log(`Skipping message ${i + 1}: no text body (media-only or empty)`);
                                    continue;
                                }

                                // Skip emoji-only messages - don't respond to emoji-only messages
                                if (this.isEmojiOnly(message.body.trim())) {
                                    console.log(`Skipping message ${i + 1}: emoji-only message - no response`);
                                    continue;
                                }

                                // Add to valid messages list
                                validMessages.push({
                                    body: message.body.trim(),
                                    timestamp: message.timestamp,
                                    author: message.author,
                                    hasMedia: message.hasMedia || false
                                });
                            }

                            // Process all valid messages together (combine into one reply)
                            if (validMessages.length > 0) {
                                console.log(`📬 Processing ${validMessages.length} unread message(s) from ${chatName} together...`);

                                // Combine all messages into one
                                const combinedMessage = validMessages.map((m) => m.body).join(' ');
                                const lastMessage = validMessages[validMessages.length - 1];

                                // Process automated reply with combined message
                                const automatedReplyHandled = await this.processAutomatedReply(messageChatId, combinedMessage);

                                // Only emit event for frontend AI auto-response if automated flow system didn't handle it
                                if (!automatedReplyHandled) {
                                    // Emit only the last message to frontend
                                    this.emit('incoming-message', {
                                        chatId: messageChatId,
                                        body: lastMessage.body,
                                        timestamp: lastMessage.timestamp,
                                        author: lastMessage.author,
                                        hasMedia: lastMessage.hasMedia
                                    });
                                } else {
                                    console.log('⚠️ Automated flow handled the unread messages, skipping AI auto-response to prevent duplicates');
                                }

                                processedCount += validMessages.length;

                                // Small delay between processing different chats to avoid rate limiting
                                await new Promise((resolve) => setTimeout(resolve, 1000));
                            }
                        } else if (!messages) {
                            console.log(`No messages returned for chat ${chatName}`);
                        } else if (!Array.isArray(messages)) {
                            console.log(`Messages is not an array for chat ${chatName}, type: ${typeof messages}`);
                        } else if (messages.length === 0) {
                            console.log(`Messages array is empty for chat ${chatName}`);
                        }
                    }
                } catch (chatError) {
                    console.error('Error processing chat:', chatError);
                }
            }

            if (totalUnread > 0) {
                console.log(`Finished processing unread messages: ${processedCount} messages processed out of ${totalUnread} unread`);
            } else {
                console.log('No unread messages found');
            }
        } catch (error) {
            console.error('Error processing unread messages:', error);
        }
    }
}

module.exports = WhatsAppClient;
