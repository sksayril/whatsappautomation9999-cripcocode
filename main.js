const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const WhatsAppClient = require('./backend/whatsapp');
const Database = require('./backend/database');

let mainWindow;
let whatsappClient;
let db;

// Get user data directory (AppData on Windows)
// This will be: C:\Users\[Username]\AppData\Roaming\Wapiea
function getUserDataPath() {
  // Wait for app to be ready to use app.getPath
  if (app.isReady()) {
    const appDataPath = app.getPath('appData'); // C:\Users\[Username]\AppData\Roaming
    const wapieaDataPath = path.join(appDataPath, 'Wapiea');
    
    // Ensure Wapiea directory exists
    if (!fs.existsSync(wapieaDataPath)) {
      fs.mkdirSync(wapieaDataPath, { recursive: true });
      console.log('✅ Created Wapiea data directory:', wapieaDataPath);
    }
    
    return wapieaDataPath;
  } else {
    // Fallback for when app is not ready yet
    const os = require('os');
    const appDataPath = path.join(os.homedir(), 'AppData', 'Roaming');
    const wapieaDataPath = path.join(appDataPath, 'Wapiea');
    
    if (!fs.existsSync(wapieaDataPath)) {
      fs.mkdirSync(wapieaDataPath, { recursive: true });
      console.log('✅ Created Wapiea data directory:', wapieaDataPath);
    }
    
    return wapieaDataPath;
  }
}

// Initialize user data paths
let userDataPath;
let sessionDir;
let dbPath;

// Temporary initialization for before app is ready
// This will be replaced when app.whenReady() runs
userDataPath = getUserDataPath();
sessionDir = path.join(userDataPath, 'session');
dbPath = path.join(userDataPath, 'database.db');

if (!fs.existsSync(sessionDir)) {
  fs.mkdirSync(sessionDir, { recursive: true });
}

// Initialize database (will be re-initialized in app.whenReady if needed)
try {
  db = new Database(dbPath);
  console.log('✅ Database initialized at:', dbPath);
} catch (error) {
  console.error('⚠️  Database initialization error:', error);
  // Fallback to old location for migration
  const oldDbPath = path.join(__dirname, 'database.db');
  if (fs.existsSync(oldDbPath)) {
    console.log('📦 Migrating database from old location...');
    try {
      fs.copyFileSync(oldDbPath, dbPath);
      console.log('✅ Database migrated to:', dbPath);
      db = new Database(dbPath);
    } catch (migError) {
      console.error('❌ Migration failed, using old location:', migError);
      db = new Database(oldDbPath);
    }
  } else {
    db = new Database(dbPath);
  }
}

// Initialize WhatsApp client
whatsappClient = new WhatsAppClient(sessionDir, db);

function createWindow() {
  // Set icon path if it exists, otherwise use default
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  const iconExists = fs.existsSync(iconPath);
  
  // Check if app is packaged (production build)
  const isProduction = app.isPackaged;
  
  const windowOptions = {
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      devTools: !isProduction // Disable DevTools in production
    },
    titleBarStyle: 'default',
    backgroundColor: '#10b981',
    title: 'Wapiea - WhatsApp Marketing Automation',
    show: false // Don't show until ready
  };
  
  // Only set icon if file exists
  if (iconExists) {
    windowOptions.icon = iconPath;
  } else {
    console.log('⚠️  Icon file not found at:', iconPath);
    console.log('📝 To add Wapiea icon, run: npx electron-icon-maker --input=assets/icon.svg --output=assets');
  }
  
  mainWindow = new BrowserWindow(windowOptions);

  // Setup IPC handlers immediately (needed for file loading)
  setupIpcHandlers();

  // Load splash screen first
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'splash.html'));

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // After splash screen delay, load main app
  setTimeout(() => {
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
    
    // Only open DevTools in development mode (not in production)
    if (!isProduction) {
    mainWindow.webContents.openDevTools();
    }
    
    // Setup WhatsApp listeners after main app loads
    mainWindow.webContents.once('did-finish-load', () => {
      setupWhatsAppListeners();
    });
  }, 3000); // 3 second splash screen

  // Handle page load errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load page:', errorCode, errorDescription);
  });

  // Log when page is loaded
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Page loaded successfully');
  });

  // Prevent DevTools from opening via keyboard shortcuts in production
  if (isProduction) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      // Block common DevTools shortcuts: F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U
      if (input.key === 'F12' || 
          (input.control && input.shift && (input.key === 'I' || input.key === 'J')) ||
          (input.control && input.key === 'U')) {
        event.preventDefault();
      }
    });
  }

  // IPC handlers and WhatsApp listeners will be set up after main app loads

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function setupIpcHandlers() {
  // WhatsApp connection
  ipcMain.on('whatsapp-connect', () => {
    try {
      whatsappClient.connect();
    } catch (error) {
      console.error('Error connecting WhatsApp:', error);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('connection-status', { 
          status: 'error', 
          message: error.message || 'Failed to connect'
        });
      }
    }
  });

  ipcMain.on('whatsapp-disconnect', () => {
    whatsappClient.disconnect();
  });

  // CSV Upload
  ipcMain.handle('select-csv-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'CSV Files', extensions: ['csv'] }]
    });
    
    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      const csvData = fs.readFileSync(filePath, 'utf-8');
      return { canceled: false, csvData, filePath };
    }
    
    return { canceled: true };
  });

  ipcMain.on('upload-csv', async (event, csvData) => {
    try {
      const results = db.parseAndSaveCSV(csvData);
      event.reply('csv-uploaded', { 
        success: true, 
        added: results.added.length,
        skipped: results.skipped.length,
        errors: results.errors.length,
        total: results.total,
        details: results
      });
    } catch (error) {
      console.error('Error parsing CSV:', error);
      event.reply('csv-uploaded', { 
        success: false, 
        error: error.message || 'Failed to parse CSV file' 
      });
    }
  });

  // Templates
  ipcMain.handle('get-templates', () => {
    return db.getTemplates();
  });

  ipcMain.on('save-template', (event, template) => {
    try {
      const result = db.saveTemplate(template);
      event.reply('template-saved', { success: true, template: result });
    } catch (error) {
      event.reply('template-saved', { success: false, error: error.message });
    }
  });

  ipcMain.on('delete-template', (event, id) => {
    try {
      db.deleteTemplate(id);
      event.reply('template-deleted', { success: true });
    } catch (error) {
      event.reply('template-deleted', { success: false, error: error.message });
    }
  });

  // Contacts
  ipcMain.handle('get-contacts', () => {
    return db.getContacts();
  });

  ipcMain.on('delete-contact', (event, id) => {
    try {
      db.deleteContact(id);
      event.reply('contact-deleted', { success: true });
    } catch (error) {
      event.reply('contact-deleted', { success: false, error: error.message });
    }
  });

  // Add single contact
  ipcMain.handle('add-contact', async (event, contactData) => {
    try {
      const result = db.addContact(
        contactData.name,
        contactData.phone,
        contactData.message || ''
      );
      return result;
    } catch (error) {
      return { success: false, error: error.message || 'Failed to add contact' };
    }
  });

  // Campaigns
  ipcMain.handle('get-campaigns', () => {
    return db.getCampaigns();
  });

  ipcMain.on('start-campaign', async (event, campaignData) => {
    try {
      // Check if this is starting a new campaign or resuming existing one
      if (campaignData.campaignId) {
        // Resuming existing campaign - this would need contactIds stored
        // For now, we'll just create new campaigns
        event.reply('campaign-started', { success: false, error: 'Resuming campaigns not yet implemented. Please create a new campaign.' });
        return;
      } else {
        // Creating new campaign
        const canStartCheck = { canStart: true }; // Will be checked in startCampaign
        
        // Create campaign first
      const campaign = db.createCampaign(campaignData);
        
        // Immediately reply that campaign was created (so button can be blocked)
        event.reply('campaign-started', { success: true, campaign, created: true });
        
        // Check if can start (limits, etc.)
        const canStart = db.canStartCampaign(campaign.id);
        if (!canStart.canStart) {
          // Update status to show why it can't start
          db.updateCampaignStatus(campaign.id, 'pending');
          // Send update that campaign was created but can't start
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('campaign-started', { 
              success: false, 
              campaign,
              error: canStart.reason 
            });
          }
          return;
        }
        
        // Start the campaign asynchronously
      whatsappClient.startCampaign(campaign, campaignData, db, (progress) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('campaign-progress', progress);
          }
        }).catch((error) => {
          console.error('Campaign error:', error);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('campaign-progress', {
              campaignId: campaign.id,
              status: 'error',
              error: error.message
            });
            // Send error update
            mainWindow.webContents.send('campaign-started', {
              success: false,
              campaign,
              error: error.message
            });
          }
        });
      }
    } catch (error) {
      console.error('Error starting campaign:', error);
      event.reply('campaign-started', { success: false, error: error.message });
    }
  });

  // Pause campaign
  ipcMain.on('pause-campaign', async (event, campaignId) => {
    try {
      whatsappClient.pauseCampaign();
      db.updateCampaignStatus(campaignId, 'paused');
      event.reply('campaign-paused', { success: true });
    } catch (error) {
      event.reply('campaign-paused', { success: false, error: error.message });
    }
  });

  // Check if campaign can start
  ipcMain.handle('can-start-campaign', async (event, campaignId) => {
    try {
      return db.canStartCampaign(campaignId);
    } catch (error) {
      return { canStart: false, reason: error.message };
    }
  });

  ipcMain.handle('get-logs', (event, filters) => {
    return db.getLogs(filters);
  });

  // Dashboard stats
  ipcMain.handle('get-dashboard-stats', () => {
    return db.getDashboardStats();
  });

  // Chart data
  ipcMain.handle('get-campaigns-chart-data', () => {
    return db.getCampaignsChartData();
  });

  ipcMain.handle('get-campaign-status-distribution', () => {
    return db.getCampaignStatusDistribution();
  });

  ipcMain.handle('get-message-status-distribution', () => {
    return db.getMessageStatusDistribution();
  });

  ipcMain.handle('get-top-campaigns', () => {
    return db.getTopCampaigns();
  });

  ipcMain.handle('get-messages-sent-over-time', () => {
    return db.getMessagesSentOverTime();
  });

  ipcMain.handle('get-success-rate-data', () => {
    return db.getSuccessRateData();
  });

  // Get WhatsApp chats
  ipcMain.handle('get-whatsapp-chats', async (event) => {
    try {
      console.log('Getting WhatsApp chats...');
      
      if (!whatsappClient) {
        console.error('WhatsApp client not initialized');
        return { success: false, error: 'WhatsApp client not initialized' };
      }

      const isReady = await whatsappClient.isReady();
      if (!isReady) {
        console.warn('WhatsApp client is not ready');
        return { success: false, error: 'WhatsApp is not connected. Please connect first.' };
      }

      console.log('Client is ready, fetching chats...');
      const chats = await whatsappClient.getChats();
      console.log(`Successfully fetched ${chats ? chats.length : 0} chats`);
      
      return { success: true, chats: chats || [] };
    } catch (error) {
      console.error('Error getting chats:', error);
      return { 
        success: false, 
        error: error.message || 'Unknown error occurred',
        details: error.stack
      };
    }
  });

  // Get WhatsApp contacts
  ipcMain.handle('get-whatsapp-contacts', async (event) => {
    try {
      console.log('Getting WhatsApp contacts...');
      
      if (!whatsappClient) {
        console.error('WhatsApp client not initialized');
        return { success: false, error: 'WhatsApp client not initialized' };
      }

      const isReady = await whatsappClient.isReady();
      if (!isReady) {
        console.warn('WhatsApp client is not ready');
        return { success: false, error: 'WhatsApp is not connected. Please connect first.' };
      }

      console.log('Client is ready, fetching contacts...');
      const contacts = await whatsappClient.getContacts();
      console.log(`Successfully fetched ${contacts ? contacts.length : 0} contacts`);
      
      return { success: true, contacts: contacts || [] };
    } catch (error) {
      console.error('Error getting contacts:', error);
      return { 
        success: false, 
        error: error.message || 'Unknown error occurred',
        details: error.stack
      };
    }
  });

  // Get chat messages
  ipcMain.handle('get-chat-messages', async (event, chatId, limit) => {
    try {
      console.log('Getting messages for chat:', chatId);
      
      if (!whatsappClient) {
        console.error('WhatsApp client not initialized');
        return { success: false, error: 'WhatsApp client not initialized' };
      }

      const isReady = await whatsappClient.isReady();
      if (!isReady) {
        console.warn('WhatsApp client is not ready');
        return { success: false, error: 'WhatsApp is not connected. Please connect first.' };
      }

      console.log('Client is ready, fetching messages...');
      const messages = await whatsappClient.getChatMessages(chatId, limit || 50);
      console.log(`Successfully fetched ${messages ? messages.length : 0} messages`);
      
      return { success: true, messages: messages || [] };
    } catch (error) {
      console.error('Error getting chat messages:', error);
      return { 
        success: false, 
        error: error.message || 'Unknown error occurred',
        details: error.stack
      };
    }
  });

  // Send WhatsApp message
  ipcMain.handle('send-whatsapp-message', async (event, chatId, message) => {
    try {
      console.log('Sending message to chat:', chatId);
      
      if (!whatsappClient) {
        console.error('WhatsApp client not initialized');
        return { success: false, error: 'WhatsApp client not initialized' };
      }

      const isReady = await whatsappClient.isReady();
      if (!isReady) {
        console.warn('WhatsApp client is not ready');
        return { success: false, error: 'WhatsApp is not connected. Please connect first.' };
      }

      console.log('Client is ready, sending message...');
      const result = await whatsappClient.sendMessage(chatId, message);
      console.log('Message sent successfully');
      
      return result;
    } catch (error) {
      console.error('Error sending message:', error);
      return { 
        success: false, 
        error: error.message || 'Unknown error occurred',
        details: error.stack
      };
    }
  });

  // Get connected phone number
  ipcMain.handle('get-phone-number', () => {
    return whatsappClient.getPhoneNumber();
  });

  // ========== AUTOMATED MESSAGES IPC HANDLERS ==========

  // Get all automated messages
  ipcMain.handle('get-automated-messages', () => {
    return db.getAutomatedMessages();
  });

  // Get automated message by ID
  ipcMain.handle('get-automated-message', (event, id) => {
    return db.getAutomatedMessage(id);
  });

  // Save automated message
  ipcMain.handle('save-automated-message', (event, flowData) => {
    try {
      return db.saveAutomatedMessage(flowData);
    } catch (error) {
      console.error('Error saving automated message:', error);
      throw error;
    }
  });

  // Delete automated message
  ipcMain.on('delete-automated-message', (event, id) => {
    try {
      db.deleteAutomatedMessage(id);
      event.reply('automated-message-deleted', { success: true });
    } catch (error) {
      event.reply('automated-message-deleted', { success: false, error: error.message });
    }
  });

  // Get collected data
  ipcMain.handle('get-collected-data', (event, filters) => {
    return db.getCollectedData(filters || {});
  });

  // Get automated message count
  ipcMain.handle('get-automated-message-count', () => {
    return db.getAutomatedMessageCount();
  });

  // Media file selection
  ipcMain.handle('select-media-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif'] },
        { name: 'PDFs', extensions: ['pdf'] },
        { name: 'Documents', extensions: ['doc', 'docx', 'txt'] }
      ]
    });
    return result;
  });

  // Read file from renderer directory
  ipcMain.handle('read-file', async (event, filePath) => {
    try {
      const fullPath = path.join(__dirname, 'renderer', filePath);
      const content = fs.readFileSync(fullPath, 'utf-8');
      return { success: true, content };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

function setupWhatsAppListeners() {
  whatsappClient.on('qr', (qr) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('qr-update', qr);
    }
  });

  whatsappClient.on('ready', (phoneNumber) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('connection-status', { 
        status: 'connected',
        phoneNumber: phoneNumber || null
      });
    }
  });

  whatsappClient.on('authenticated', () => {
    console.log('Authenticated event received in main.js');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('connection-status', { 
        status: 'authenticated',
        message: 'Authentication successful. Connecting...',
        percent: 75
      });
      
      // Periodically check if ready event fires
      // This is a backup in case the ready event is delayed
      let checkAttempts = 0;
      const maxAttempts = 25; // Check for up to 25 seconds
      
      const checkReadyInterval = setInterval(async () => {
        checkAttempts++;
        
        if (checkAttempts > maxAttempts) {
          clearInterval(checkReadyInterval);
          console.warn('Max attempts reached waiting for ready event');
          return;
        }
        
        try {
          const isReady = await whatsappClient.isReady();
          if (isReady) {
            const phoneNumber = whatsappClient.getPhoneNumber();
            console.log('Client is ready (checked manually), sending connected status with phone:', phoneNumber);
            clearInterval(checkReadyInterval);
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('connection-status', { 
                status: 'connected',
                phoneNumber: phoneNumber || null
              });
            }
          } else {
            // Update progress while waiting
            if (mainWindow && !mainWindow.isDestroyed() && checkAttempts % 3 === 0) {
              const progress = Math.min(75 + Math.floor(checkAttempts * 1), 95);
              mainWindow.webContents.send('connection-status', { 
                status: 'authenticated',
                message: 'Authentication successful. Finalizing connection...',
                percent: progress
              });
            }
          }
        } catch (error) {
          console.error(`[Attempt ${checkAttempts}] Error checking connection status:`, error.message);
          // Continue checking on next interval
        }
      }, 1000); // Check every 1 second
    }
  });

  whatsappClient.on('auth_failure', (msg) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('connection-status', { status: 'auth_failure', message: msg });
    }
  });

  whatsappClient.on('disconnected', (reason) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      // If reason indicates reconnecting, show that status
      if (reason && reason.includes('Reconnecting')) {
        mainWindow.webContents.send('connection-status', { 
          status: 'reconnecting', 
          message: reason,
          percent: 0
        });
      } else {
        mainWindow.webContents.send('connection-status', { status: 'disconnected', reason });
      }
    }
  });

  whatsappClient.on('loading_screen', (percent, message) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('connection-status', { 
        status: 'loading', 
        percent: percent || 0, 
        message: message || 'Loading...' 
      });
    }
  });

  whatsappClient.on('error', (error) => {
    console.error('WhatsApp client error:', error);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('connection-status', { 
        status: 'error', 
        message: error.message || 'Unknown error'
      });
    }
  });

  // Listen for incoming messages for AI auto-response
  whatsappClient.on('incoming-message', async (messageData) => {
    try {
      console.log('Main process received incoming message:', messageData);
      // Send to renderer to handle AI auto-response
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('incoming-message', messageData);
        console.log('Sent incoming message to renderer');
      } else {
        console.warn('Main window not available to send message');
      }
    } catch (error) {
      console.error('Error handling incoming message event:', error);
    }
  });
}

// Helper function to copy directory recursively
function copyDirectoryRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

app.whenReady().then(() => {
  // Set app name and metadata
  app.setName('Wapiea');
  if (process.platform === 'darwin') {
    app.dock.setIcon(path.join(__dirname, 'assets', 'icon.png'));
  }

  // Re-initialize paths with proper app.getPath after app is ready
  userDataPath = getUserDataPath();
  sessionDir = path.join(userDataPath, 'session');
  dbPath = path.join(userDataPath, 'database.db');
  
  // Ensure session directory exists
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
    console.log('✅ Created session directory:', sessionDir);
  }
  
  // Re-initialize database with correct path
  if (db) {
    try {
      db.close();
    } catch (e) {
      // Ignore if already closed
    }
  }
  
  // Check if database exists in old location and migrate
  const oldDbPath = path.join(__dirname, 'database.db');
  if (fs.existsSync(oldDbPath) && !fs.existsSync(dbPath)) {
    console.log('📦 Migrating database from old location to AppData...');
    try {
      fs.copyFileSync(oldDbPath, dbPath);
      console.log('✅ Database migrated to:', dbPath);
    } catch (migError) {
      console.error('❌ Migration failed:', migError);
    }
  }
  
  // Check if session exists in old location and migrate
  const oldSessionDir = path.join(__dirname, 'session');
  if (fs.existsSync(oldSessionDir)) {
    try {
      const sessionFiles = fs.readdirSync(oldSessionDir);
      if (sessionFiles.length > 0) {
        console.log('📦 Migrating session data from old location to AppData...');
        sessionFiles.forEach(file => {
          const oldPath = path.join(oldSessionDir, file);
          const newPath = path.join(sessionDir, file);
          try {
            if (fs.statSync(oldPath).isDirectory()) {
              // Copy directory recursively
              copyDirectoryRecursive(oldPath, newPath);
            } else {
              fs.copyFileSync(oldPath, newPath);
            }
          } catch (copyError) {
            console.error('Error copying', file, ':', copyError);
          }
        });
        console.log('✅ Session data migrated to:', sessionDir);
      }
    } catch (migError) {
      console.error('❌ Session migration failed:', migError);
    }
  }
  
  // Initialize database
  db = new Database(dbPath);
  console.log('✅ Database initialized at:', dbPath);
  
  // Re-initialize WhatsApp client with new paths
  if (whatsappClient) {
    try {
      whatsappClient.disconnect();
    } catch (e) {
      // Ignore if not connected
    }
  }
  whatsappClient = new WhatsAppClient(sessionDir, db);
  console.log('✅ WhatsApp client initialized with session:', sessionDir);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Helper function to copy directory recursively
function copyDirectoryRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

app.on('window-all-closed', () => {
  if (whatsappClient) {
    whatsappClient.disconnect();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (whatsappClient) {
    whatsappClient.disconnect();
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  // Ignore EBUSY errors (file locking) - these are common on Windows and don't need to crash the app
  if (error && (error.code === 'EBUSY' || error.message.includes('EBUSY') || error.message.includes('resource busy'))) {
    console.log('File locked (EBUSY) - this is normal on Windows. Session preserved.');
    return;
  }
  console.error('Unhandled promise rejection:', error);
  // Don't crash the app, just log the error
});

