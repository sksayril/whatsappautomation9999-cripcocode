const { Client, LocalAuth, MessageMedia, List } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

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
        if (errorMessage.includes('browser has disconnected') || 
            errorMessage.includes('Target closed') ||
            errorMessage.includes('Protocol error') ||
            errorMessage.includes('Navigation failed')) {
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
        await new Promise(resolve => setTimeout(resolve, 1500));
        
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
              await new Promise(resolve => setTimeout(resolve, 500));
              
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
      if (errorMessage.includes('browser has disconnected') || 
          errorMessage.includes('Target closed') ||
          errorMessage.includes('Protocol error') ||
          errorMessage.includes('Navigation failed')) {
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
          await new Promise(resolve => setTimeout(resolve, 1000));
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
        if (index < contacts.length - 1) { // Don't delay after the last message
          let waitTime = delay || 5000;
          if (randomDelay) {
            const min = randomDelay.min || 1000; // Default 1 second
            const max = randomDelay.max || 9000; // Default 9 seconds
            waitTime = Math.floor(Math.random() * (max - min + 1)) + min;
          }

          // Wait before sending next message
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        // Pause after X messages
        if (pauseAfter && index > 0 && (index + 1) % pauseAfter === 0) {
          await new Promise(resolve => setTimeout(resolve, 30000)); // 30 second pause
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
      return chats.map(chat => {
        try {
          return {
            id: chat.id ? (chat.id._serialized || chat.id.user || String(chat.id)) : 'unknown',
            name: chat.name || (chat.id && chat.id.user) || 'Unknown',
            isGroup: chat.isGroup || false,
            unreadCount: chat.unreadCount || 0,
            lastMessage: chat.lastMessage ? {
              body: chat.lastMessage.body || '',
              timestamp: chat.lastMessage.timestamp || null,
              from: chat.lastMessage.from || null
            } : null,
            timestamp: chat.timestamp || null
          };
        } catch (mapError) {
          console.error('Error mapping chat:', mapError, chat);
          return null;
        }
      }).filter(chat => chat !== null); // Remove any null entries
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
      return contacts.map(contact => {
        try {
          return {
            id: contact.id ? (contact.id._serialized || contact.id.user || String(contact.id)) : 'unknown',
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
      }).filter(contact => contact !== null); // Remove any null entries
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
        const chatIdSerialized = c.id ? (c.id._serialized || c.id.user || String(c.id)) : null;
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

      // Send message
      await this.client.sendMessage(chatId, message);
      return { success: true };
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
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

        // Only process text messages (skip media-only messages without text)
        if (!message.body || !message.body.trim()) {
          return;
        }

        const chatId = message.from;
        const messageBody = message.body.trim();

        console.log('📨 New message received from:', chatId, 'Body:', messageBody.substring(0, 50));

        // Process automated reply first
        console.log('🤖 Processing automated reply...');
        const automatedReplyHandled = await this.processAutomatedReply(chatId, messageBody);

        // Only emit event for frontend AI auto-response if automated flow system didn't handle it
        // This prevents duplicate automated replies
        if (!automatedReplyHandled) {
          this.emit('incoming-message', {
            chatId: chatId,
            body: messageBody,
            timestamp: message.timestamp,
            author: message.author,
            hasMedia: message.hasMedia
          });
        } else {
          console.log('⚠️ Automated flow handled the message, skipping AI auto-response to prevent duplicates');
        }
      } catch (error) {
        console.error('❌ Error handling incoming message:', error);
        console.error('Error stack:', error.stack);
      }
    });

    console.log('✅ Message listener set up successfully');
  }

  async processAutomatedReply(chatId, messageBody) {
    if (!this.db || !this.isConnected || !this.client) {
      console.log('⚠️ Skipping automated reply - prerequisites not met. db:', !!this.db, 'isConnected:', this.isConnected, 'client:', !!this.client);
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
      
      console.log('✅ Client is connected, proceeding with automated reply');

      // Extract phone number from chatId (format: 1234567890@c.us)
      const phone = chatId.split('@')[0];
      
      if (!phone || !messageBody || !messageBody.trim()) {
        console.log('Skipping automated reply - invalid phone or empty message');
        return false;
      }
      
      console.log('Processing automated reply for phone:', phone, 'message:', messageBody.substring(0, 50));
      
      // Check if user is in an active flow
      const activeFlow = this.db.getActiveFlowForPhone(phone);
      console.log('Active flow check:', activeFlow ? 'Found flow ID: ' + activeFlow.flowId + ', StepId: ' + activeFlow.currentStepId : 'No active flow');
      
      // Check if there are active flows available
      let activeFlows;
      try {
        activeFlows = this.db.getActiveAutomatedMessages();
        console.log('Available active flows:', activeFlows ? activeFlows.length : 0);
      } catch (flowsError) {
        console.error('❌ Error getting active flows:', flowsError);
        activeFlows = [];
      }
      
      // Check if message is a trigger word that should restart the flow
      const triggerWords = ['hi', 'hello', 'start', 'hey', 'help', 'hola', 'namaste', 'hey there', 'restart', 'begin'];
      const lowerMessage = messageBody.toLowerCase().trim();
      const isTriggerWord = triggerWords.some(word => lowerMessage.includes(word));
      
      // If user has an active flow AND message is NOT a trigger word, process their response
      // If message IS a trigger word, restart the flow instead
      if (activeFlow && (activeFlow.flowId || activeFlow.id) && activeFlows && activeFlows.length > 0 && !isTriggerWord) {
        const flowId = activeFlow.flowId || activeFlow.id;
        console.log('User is in active flow, flowId:', flowId, 'processing response (not a trigger word)');
        // User is in a flow, process their response
        let result;
        try {
          result = this.db.processResponse(phone, messageBody);
          console.log('Process response result:', result ? (result.type || 'step') : 'null');
        } catch (processError) {
          console.error('❌ Error processing response:', processError);
          console.error('Error stack:', processError.stack);
          return false;
        }
        
        if (result && result.step) {
          // Send next question
          let replyMessage = result.step.question || '';
          console.log('Sending next step - Question:', replyMessage ? replyMessage.substring(0, 50) : '(empty)', 'Type:', result.type);
          
          // Check if question is empty - if so, skip sending or use a default message
          if (!replyMessage || !replyMessage.trim()) {
            console.log('⚠️ Step has no question text, skipping message send. Step ID:', result.step.id);
            // Don't send empty message, but still return true since we processed the response
            return true;
          }
          
          // Get options for this step if not already in result
          let stepOptions = result.options || [];
          if (!stepOptions || stepOptions.length === 0) {
            try {
              stepOptions = this.db.getStepOptions(result.step.id) || [];
            } catch (optError) {
              console.error('Error getting step options:', optError);
              stepOptions = [];
            }
          }
          console.log('Step options count:', stepOptions ? stepOptions.length : 0);
          
          // Double-check replyMessage is still valid before sending
          replyMessage = replyMessage.trim();
          if (!replyMessage) {
            console.log('⚠️ Reply message is empty after trim, skipping send. Step ID:', result.step.id);
            return true;
          }
          
          // If it's a form step, ask for the specific field
          if (result.step.isFormStep || result.type === 'form_next') {
            const formQuestion = result.step.question || '';
            if (!formQuestion || !formQuestion.trim()) {
              console.log('⚠️ Form step has no question text, skipping send. Step ID:', result.step.id);
              return true;
            }
            // Send plain text for form steps
            try {
              await this.client.sendMessage(chatId, formQuestion.trim());
              console.log('✅ Sent form question to', phone, '- Message sent successfully');
              return true; // Message sent, handled by automated flow
            } catch (sendError) {
              console.error('❌ Error sending form question:', sendError);
              console.error('Error details:', sendError.message, 'ChatId:', chatId);
              return false;
            }
          } else if (stepOptions && stepOptions.length > 0) {
            // Buttons are deprecated in WhatsApp, use plain text with numbered options
            console.log('Sending with options (plain text format), count:', stepOptions.length);
            
            // Send as plain text message with numbered options
            try {
              let textMessage = replyMessage + '\n\nPlease reply with one of the following:\n';
              stepOptions.forEach((opt, index) => {
                if (opt.optionUrl) {
                  textMessage += `${index + 1}. ${opt.optionText} (${opt.optionUrl})\n`;
                } else {
                  textMessage += `${index + 1}. ${opt.optionText}\n`;
                }
              });
              await this.client.sendMessage(chatId, textMessage);
              console.log('✅ Sent automated reply (plain text) to', phone, '- Message sent successfully');
              return true; // Message sent, handled by automated flow
            } catch (sendError) {
              console.error('❌ Error sending automated reply:', sendError);
              return false;
            }
          } else {
            // No options, just send the message - but verify it's not empty
            if (!replyMessage || !replyMessage.trim()) {
              console.log('⚠️ Cannot send empty message, skipping. Step ID:', result.step.id);
              return true;
            }
            try {
              await this.client.sendMessage(chatId, replyMessage);
              console.log('✅ Sent automated reply to', phone);
              return true; // Message sent, handled by automated flow
            } catch (sendError) {
              console.error('Error sending automated reply:', sendError);
              return false;
            }
          }
        } else if (result && (result.completed || result.type === 'form_completed')) {
          // Flow completed - form data already saved in processResponse
          try {
            await this.client.sendMessage(chatId, '✅ Thank you for completing the flow! Your information has been saved.');
            console.log('✅ Flow completed for', phone);
            return true; // Message sent, handled by automated flow
          } catch (sendError) {
            console.error('❌ Error sending completion message:', sendError);
            console.error('Error details:', sendError.message);
            return false;
          }
        } else if (result && result.type === 'no_match') {
          // No match found, ask again with buttons
          let replyMessage = result.step.question + '\n\n⚠️ Your response did not match any option. Please try again.';
          
          // Get options for the step
          let stepOptions = result.options || [];
          if (!stepOptions || stepOptions.length === 0) {
            try {
              stepOptions = this.db.getStepOptions(result.step.id) || [];
            } catch (optError) {
              console.error('Error getting step options for no_match:', optError);
              stepOptions = [];
            }
          }
          
          if (stepOptions && stepOptions.length > 0) {
            try {
              // Buttons are deprecated in WhatsApp, use plain text with numbered options
              let textMessage = replyMessage + '\n\nOptions:\n';
              stepOptions.forEach((opt, index) => {
                if (opt.optionUrl) {
                  textMessage += `${index + 1}. ${opt.optionText} (${opt.optionUrl})\n`;
                } else {
                  textMessage += `${index + 1}. ${opt.optionText}\n`;
                }
              });
              await this.client.sendMessage(chatId, textMessage);
              console.log('✅ Sent no-match message (plain text) to', phone);
              return true; // Message sent, handled by automated flow
            } catch (sendError) {
              console.error('❌ Error sending no-match message:', sendError);
              return false;
            }
          } else {
            try {
              await this.client.sendMessage(chatId, replyMessage);
              console.log('✅ Sent no-match message to', phone);
              return true; // Message sent, handled by automated flow
            } catch (sendError) {
              console.error('Error sending no-match message:', sendError);
              return false;
            }
          }
        }
      }
      
      // No active flow OR user sent a trigger message - start/restart a flow
      // Always start flow for any message if no active flow exists, or if message matches trigger
      if (activeFlows && activeFlows.length > 0) {
        // Start flow if:
        // 1. No active flow exists (start for ANY message)
        // 2. OR message matches trigger words (restart flow even if active)
        const shouldStart = !activeFlow || isTriggerWord || 
                           (lowerMessage.length <= 20 && /^[a-z\s]+$/i.test(lowerMessage));
        console.log('Flow start check - message:', lowerMessage, 'shouldStart:', shouldStart, 'hasActiveFlow:', !!activeFlow, 'isTriggerWord:', isTriggerWord);
        
        if (shouldStart) {
          // If user has an active flow and wants to restart, reset it to first step and send message
          if (activeFlow && isTriggerWord) {
            console.log('User has active flow but trigger matched, restarting flow from beginning');
            // Reset the existing flow to first step
            const flowToReset = activeFlows.find(f => f.id === activeFlow.flowId) || activeFlows[0];
            const firstStep = this.db.getFirstStepOfFlow(flowToReset.id);
            if (firstStep) {
              // Reset to first step using database method
              // We need to update the response directly
              try {
                const updateStmt = this.db.db.prepare(`
                  UPDATE automated_message_responses 
                  SET currentStepId = ?, lastInteractionAt = CURRENT_TIMESTAMP, formData = '{}', status = 'active'
                  WHERE id = ?
                `);
                updateStmt.run(firstStep.id, activeFlow.id);
                console.log('Flow reset to first step in database');
              } catch (updateError) {
                console.error('Error updating flow in database:', updateError);
              }
              console.log('Flow reset to first step:', firstStep.question.substring(0, 50));
              
              // Send first step message immediately
              let welcomeMessage = firstStep.question;
              let options = [];
              try {
                options = this.db.getStepOptions(firstStep.id) || [];
                console.log('First step options count:', options.length);
              } catch (optError) {
                console.error('Error getting first step options:', optError);
                options = [];
              }
              
              if (options && options.length > 0 && !firstStep.isFormStep) {
                // Buttons are deprecated in WhatsApp, use plain text with numbered options
                try {
                  let textMessage = welcomeMessage + '\n\nPlease reply with one of the following:\n';
                  options.forEach((opt, index) => {
                    if (opt.optionUrl) {
                      textMessage += `${index + 1}. ${opt.optionText} (${opt.optionUrl})\n`;
                    } else {
                      textMessage += `${index + 1}. ${opt.optionText}\n`;
                    }
                  });
                  await this.client.sendMessage(chatId, textMessage);
                  console.log('✅ Restarted flow (plain text) for', phone);
                  return true; // Exit early, message already sent - handled by automated flow
                } catch (sendError) {
                  console.error('❌ Error sending restart message:', sendError);
                  return false;
                }
              } else {
                // No options or form step, send plain text
                try {
                  await this.client.sendMessage(chatId, welcomeMessage);
                  console.log('✅ Restarted flow for', phone, '- Message sent successfully');
                  return true; // Exit early, message already sent - handled by automated flow
                } catch (sendError) {
                  console.error('❌ Error sending restart message:', sendError);
                  return false;
                }
              }
            }
          }
          
          // Start the first active flow (for new users or if restart didn't work)
          const flowToStart = activeFlows[0];
          const started = this.db.startFlowForPhone(flowToStart.id, phone);
          console.log('Flow start result:', started ? 'Started successfully - ID: ' + (started.id || 'unknown') : 'Failed or already active');
          
          if (started) {
              // Verify the flow was saved by checking again
              const verifyFlow = this.db.getActiveFlowForPhone(phone);
              console.log('Flow verification after start:', verifyFlow ? 'Flow found - ID: ' + verifyFlow.id + ', FlowId: ' + verifyFlow.flowId : 'Flow NOT found!');
              
              // Get first step
              let firstStep;
              try {
                firstStep = this.db.getFirstStepOfFlow(flowToStart.id);
                console.log('First step:', firstStep ? 'Found - ' + firstStep.question.substring(0, 50) : 'Not found');
              } catch (stepError) {
                console.error('❌ Error getting first step:', stepError);
                return false;
              }
              
              if (firstStep) {
                let welcomeMessage = firstStep.question;
                
                // Get options for first step
                const options = this.db.getStepOptions(firstStep.id);
                
                if (options && options.length > 0 && !firstStep.isFormStep) {
                  // Buttons are deprecated in WhatsApp, use plain text with numbered options
                  try {
                    let textMessage = welcomeMessage + '\n\nPlease reply with one of the following:\n';
                    options.forEach((opt, index) => {
                      if (opt.optionUrl) {
                        textMessage += `${index + 1}. ${opt.optionText} (${opt.optionUrl})\n`;
                      } else {
                        textMessage += `${index + 1}. ${opt.optionText}\n`;
                      }
                    });
                    await this.client.sendMessage(chatId, textMessage);
                    console.log('✅ Started automated flow (plain text) for', phone);
                    return true; // Message sent, handled by automated flow
                  } catch (sendError) {
                    console.error('❌ Error sending welcome message:', sendError);
                    console.error('Error details:', sendError.message);
                    return false;
                  }
                } else {
                  // No options or form step, send plain text
                  try {
                    await this.client.sendMessage(chatId, welcomeMessage);
                    console.log('✅ Started automated flow for', phone, '- Message sent successfully');
                    return true; // Message sent, handled by automated flow
                  } catch (sendError) {
                    console.error('❌ Error sending welcome message:', sendError);
                    console.error('Error details:', sendError.message);
                    console.error('ChatId:', chatId, 'Message length:', welcomeMessage.length);
                    return false;
                  }
                }
              } else {
                console.log('⚠️ First step not found for flow ID:', flowToStart.id);
                return false;
              }
            } else {
              console.log('⚠️ Flow start returned null or false. Flow ID:', flowToStart.id, 'Phone:', phone);
              return false;
            }
          } else {
            console.log('⚠️ Trigger check failed. Message:', messageBody.substring(0, 50), 'does not match trigger words');
            return false;
          }
        } else {
          console.log('⚠️ No active flows found. Make sure you have at least one active automated message flow.');
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
            const chatId = chat.id ? (chat.id._serialized || chat.id.user || String(chat.id)) : null;
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
              
              for (let i = 0; i < unreadMessages.length; i++) {
                const message = unreadMessages[i];
                
                // Skip if message is from us
                if (message.fromMe) {
                  console.log(`Skipping message ${i + 1}: from us`);
                  continue;
                }
                
                // Skip if no body (media-only messages without text)
                if (!message.body || !message.body.trim()) {
                  console.log(`Skipping message ${i + 1}: no text body (media-only or empty)`);
                  continue;
                }
                
                // Skip group messages (automated flows typically work with individual chats)
                if (chat.isGroup) {
                  console.log(`Skipping message ${i + 1}: from group chat`);
                  continue;
                }
                
                const messageChatId = message.from || chatId;
                
                console.log(`Processing unread message ${i + 1} from ${chatName}: ${message.body.substring(0, 50)}...`);
                
                // Process automated reply
                const automatedReplyHandled = await this.processAutomatedReply(messageChatId, message.body || '');
                
                // Only emit event for frontend AI auto-response if automated flow system didn't handle it
                // This prevents duplicate automated replies
                if (!automatedReplyHandled) {
                  this.emit('incoming-message', {
                    chatId: messageChatId,
                    body: message.body || '',
                    timestamp: message.timestamp,
                    author: message.author,
                    hasMedia: message.hasMedia || false
                  });
                } else {
                  console.log('⚠️ Automated flow handled the unread message, skipping AI auto-response to prevent duplicates');
                }
                
                processedCount++;
                
                // Small delay between processing messages to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));
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

