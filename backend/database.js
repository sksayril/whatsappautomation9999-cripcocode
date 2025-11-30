const Database = require('better-sqlite3');
const { parse } = require('csv-parse/sync');

class DatabaseManager {
  constructor(dbPath) {
    this.db = new Database(dbPath);
    this.initTables();
  }

  initTables() {
    // Contacts table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        message TEXT,
        templateId INTEGER,
        status TEXT DEFAULT 'pending',
        sentAt DATETIME,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create unique index on phone number to prevent duplicates
    // Note: This will fail if duplicates already exist, so we handle it gracefully
    try {
      this.db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone)
      `);
    } catch (error) {
      // If index creation fails due to existing duplicates, log and continue
      console.warn('Could not create unique index on phone. Duplicates may exist:', error.message);
      // Try to remove duplicates first (keep the oldest one)
      try {
        this.db.exec(`
          DELETE FROM contacts 
          WHERE id NOT IN (
            SELECT MIN(id) 
            FROM contacts 
            GROUP BY phone
          )
        `);
        // Try creating index again
        this.db.exec(`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone)
        `);
        console.log('Removed duplicates and created unique index');
      } catch (e) {
        console.warn('Could not remove duplicates:', e.message);
      }
    }

    // Templates table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Campaigns table - create with old schema first
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        totalContacts INTEGER DEFAULT 0,
        sent INTEGER DEFAULT 0,
        failed INTEGER DEFAULT 0,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        completedAt DATETIME
      )
    `);
    
    // Migrate campaigns table to add new columns if they don't exist
    this.migrateCampaignsTable();
    
    // Message tracking table for 24-hour limit
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS message_tracking (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        campaignId INTEGER,
        contactId INTEGER,
        sentAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create index on sentAt for faster 24-hour queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_message_tracking_sentAt ON message_tracking(sentAt)
    `);
  }

  migrateCampaignsTable() {
    try {
      // Check if columns exist by trying to query them
      const tableInfo = this.db.prepare("PRAGMA table_info(campaigns)").all();
      const columnNames = tableInfo.map(col => col.name);
      
      // Add status column if it doesn't exist
      if (!columnNames.includes('status')) {
        this.db.exec(`ALTER TABLE campaigns ADD COLUMN status TEXT DEFAULT 'pending'`);
        // Update existing campaigns to have 'pending' status if they don't have completedAt
        this.db.exec(`UPDATE campaigns SET status = 'completed' WHERE completedAt IS NOT NULL`);
        this.db.exec(`UPDATE campaigns SET status = 'pending' WHERE status IS NULL`);
      }
      
      // Add dailyLimit column if it doesn't exist
      if (!columnNames.includes('dailyLimit')) {
        this.db.exec(`ALTER TABLE campaigns ADD COLUMN dailyLimit INTEGER DEFAULT 1000`);
      }
      
      // Add totalLimit column if it doesn't exist
      if (!columnNames.includes('totalLimit')) {
        this.db.exec(`ALTER TABLE campaigns ADD COLUMN totalLimit INTEGER DEFAULT 1000`);
      }
      
      // Add startedAt column if it doesn't exist
      if (!columnNames.includes('startedAt')) {
        this.db.exec(`ALTER TABLE campaigns ADD COLUMN startedAt DATETIME`);
      }
      
      // Add pausedAt column if it doesn't exist
      if (!columnNames.includes('pausedAt')) {
        this.db.exec(`ALTER TABLE campaigns ADD COLUMN pausedAt DATETIME`);
      }
      
      // Update existing campaigns with default values
      // Set status for existing campaigns
      this.db.exec(`UPDATE campaigns SET status = 'completed' WHERE completedAt IS NOT NULL AND (status IS NULL OR status = '')`);
      this.db.exec(`UPDATE campaigns SET status = 'pending' WHERE status IS NULL OR status = ''`);
      
      // Set default limits for existing campaigns
      this.db.exec(`UPDATE campaigns SET dailyLimit = 1000 WHERE dailyLimit IS NULL`);
      this.db.exec(`UPDATE campaigns SET totalLimit = 1000 WHERE totalLimit IS NULL`);
      
      // Update existing campaigns with default values
      // Set status for existing campaigns
      this.db.exec(`UPDATE campaigns SET status = 'completed' WHERE completedAt IS NOT NULL AND (status IS NULL OR status = '')`);
      this.db.exec(`UPDATE campaigns SET status = 'pending' WHERE status IS NULL OR status = ''`);
      
      // Set default limits for existing campaigns
      this.db.exec(`UPDATE campaigns SET dailyLimit = 1000 WHERE dailyLimit IS NULL`);
      this.db.exec(`UPDATE campaigns SET totalLimit = 1000 WHERE totalLimit IS NULL`);
      
      console.log('Campaigns table migration completed successfully');
    } catch (error) {
      console.error('Error migrating campaigns table:', error);
      // Re-throw to prevent silent failures - this is critical for app functionality
      throw new Error(`Database migration failed: ${error.message}. Please restart the application.`);
    }

    // Logs table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        campaignId INTEGER,
        contactId INTEGER,
        status TEXT,
        error TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Settings table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);

    // Automated Messages (flows) table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS automated_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        isActive INTEGER DEFAULT 1,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Automated Message Steps (questions with options) table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS automated_message_steps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        flowId INTEGER NOT NULL,
        stepOrder INTEGER NOT NULL,
        question TEXT NOT NULL,
        stepType TEXT DEFAULT 'question',
        isFormStep INTEGER DEFAULT 0,
        formFieldName TEXT,
        formFieldType TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (flowId) REFERENCES automated_messages(id) ON DELETE CASCADE
      )
    `);

    // Step Options (for question steps with multiple choice)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS automated_message_options (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stepId INTEGER NOT NULL,
        optionText TEXT NOT NULL,
        optionUrl TEXT,
        nextStepId INTEGER,
        optionOrder INTEGER NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (stepId) REFERENCES automated_message_steps(id) ON DELETE CASCADE,
        FOREIGN KEY (nextStepId) REFERENCES automated_message_steps(id) ON DELETE SET NULL
      )
    `);
    
    // Add URL column if it doesn't exist (migration)
    try {
      const tableInfo = this.db.prepare("PRAGMA table_info(automated_message_options)").all();
      const columnNames = tableInfo.map(col => col.name);
      if (!columnNames.includes('optionUrl')) {
        this.db.exec(`ALTER TABLE automated_message_options ADD COLUMN optionUrl TEXT`);
      }
    } catch (error) {
      console.log('Option URL column migration:', error.message);
    }

    // User Response Tracking (tracks where each user is in a flow)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS automated_message_responses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        flowId INTEGER NOT NULL,
        phone TEXT NOT NULL,
        currentStepId INTEGER,
        status TEXT DEFAULT 'active',
        formData TEXT,
        startedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        lastInteractionAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        completedAt DATETIME,
        FOREIGN KEY (flowId) REFERENCES automated_messages(id) ON DELETE CASCADE,
        FOREIGN KEY (currentStepId) REFERENCES automated_message_steps(id) ON DELETE SET NULL
      )
    `);
    
    // Add formData column if it doesn't exist (migration)
    try {
      const tableInfo = this.db.prepare("PRAGMA table_info(automated_message_responses)").all();
      const columnNames = tableInfo.map(col => col.name);
      if (!columnNames.includes('formData')) {
        this.db.exec(`ALTER TABLE automated_message_responses ADD COLUMN formData TEXT`);
      }
    } catch (error) {
      console.log('Form data column migration:', error.message);
    }

    // Form Fields Definition (fields to collect in forms)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS form_fields (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        flowId INTEGER NOT NULL,
        fieldName TEXT NOT NULL,
        fieldLabel TEXT NOT NULL,
        fieldType TEXT DEFAULT 'text',
        isRequired INTEGER DEFAULT 1,
        fieldOrder INTEGER NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (flowId) REFERENCES automated_messages(id) ON DELETE CASCADE
      )
    `);

    // Collected Data (form responses)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS collected_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        flowId INTEGER NOT NULL,
        phone TEXT NOT NULL,
        name TEXT,
        email TEXT,
        mobile TEXT,
        customData TEXT,
        isInterested INTEGER DEFAULT 0,
        submittedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (flowId) REFERENCES automated_messages(id) ON DELETE CASCADE
      )
    `);

    // Create indexes for better performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_responses_phone ON automated_message_responses(phone)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_responses_flow ON automated_message_responses(flowId)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_collected_phone ON collected_data(phone)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_collected_flow ON collected_data(flowId)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_steps_flow ON automated_message_steps(flowId)
    `);
  }

  // Normalize phone number for comparison (remove spaces, dashes, etc.)
  normalizePhone(phone) {
    if (!phone) return '';
    // Remove all non-digit characters except + at the start
    let normalized = phone.toString().trim();
    // Remove spaces, dashes, parentheses, dots
    normalized = normalized.replace(/[\s\-\(\)\.]/g, '');
    return normalized;
  }

  // Validate phone number format
  validatePhone(phone) {
    if (!phone) return { valid: false, error: 'Phone number is required' };
    
    const normalized = this.normalizePhone(phone);
    
    // Check if it's empty after normalization
    if (!normalized || normalized.length === 0) {
      return { valid: false, error: 'Phone number cannot be empty' };
    }
    
    // Check if it contains only digits (and optional + at start)
    if (!/^\+?[0-9]+$/.test(normalized)) {
      return { valid: false, error: 'Phone number contains invalid characters' };
    }
    
    // Check minimum length (at least 10 digits)
    const digitsOnly = normalized.replace(/^\+/, '');
    if (digitsOnly.length < 10) {
      return { valid: false, error: 'Phone number is too short (minimum 10 digits)' };
    }
    
    // Check maximum length (15 digits max for international numbers)
    if (digitsOnly.length > 15) {
      return { valid: false, error: 'Phone number is too long (maximum 15 digits)' };
    }
    
    return { valid: true, normalized };
  }

  // Check if contact exists by phone number
  contactExists(phone) {
    const normalized = this.normalizePhone(phone);
    const existing = this.db.prepare('SELECT id, name, phone FROM contacts WHERE phone = ?').get(normalized);
    return existing || null;
  }

  parseAndSaveCSV(csvData) {
    const records = parse(csvData, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    const insertStmt = this.db.prepare(`
      INSERT INTO contacts (name, phone, message)
      VALUES (?, ?, ?)
    `);

    const results = {
      added: [],
      skipped: [],
      errors: [],
      total: records.length
    };

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const rowNumber = i + 2; // +2 because row 1 is header, and arrays are 0-indexed
      
      const name = (record.name || '').trim();
      const phone = (record.phone || '').trim();
      const message = (record.customMessage || record.message || '').trim();

      // Validate name
      if (!name) {
        results.errors.push({
          row: rowNumber,
          name: name || '(empty)',
          phone: phone || '(empty)',
          error: 'Name is required'
        });
        continue;
      }

      // Validate phone
      const phoneValidation = this.validatePhone(phone);
      if (!phoneValidation.valid) {
        results.errors.push({
          row: rowNumber,
          name: name,
          phone: phone || '(empty)',
          error: phoneValidation.error
        });
        continue;
      }

      const normalizedPhone = phoneValidation.normalized;

      // Check for duplicate
      const existing = this.contactExists(normalizedPhone);
      if (existing) {
        results.skipped.push({
          row: rowNumber,
          name: name,
          phone: phone,
          normalizedPhone: normalizedPhone,
          reason: 'Duplicate phone number',
          existingContact: {
            id: existing.id,
            name: existing.name,
            phone: existing.phone
          }
        });
        continue;
      }

      // Try to insert
      try {
        const info = insertStmt.run(name, normalizedPhone, message);
        results.added.push({
          id: info.lastInsertRowid,
          name: name,
          phone: normalizedPhone,
          message: message
        });
      } catch (error) {
        // Handle unique constraint violation (in case index wasn't created)
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.message.includes('UNIQUE constraint')) {
          results.skipped.push({
            row: rowNumber,
            name: name,
            phone: phone,
            normalizedPhone: normalizedPhone,
            reason: 'Duplicate phone number (database constraint)'
          });
        } else {
          results.errors.push({
            row: rowNumber,
            name: name,
            phone: phone,
            error: error.message || 'Unknown error'
          });
        }
      }
    }

    return results;
  }

  getContacts() {
    return this.db.prepare('SELECT * FROM contacts ORDER BY createdAt DESC').all();
  }

  deleteContact(id) {
    this.db.prepare('DELETE FROM contacts WHERE id = ?').run(id);
  }

  getTemplates() {
    return this.db.prepare('SELECT * FROM templates ORDER BY updatedAt DESC').all();
  }

  saveTemplate(template) {
    if (template.id) {
      // Update
      this.db.prepare(`
        UPDATE templates 
        SET title = ?, body = ?, updatedAt = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(template.title, template.body, template.id);
      return { ...template, updatedAt: new Date().toISOString() };
    } else {
      // Insert
      const info = this.db.prepare(`
        INSERT INTO templates (title, body)
        VALUES (?, ?)
      `).run(template.title, template.body);
      return {
        id: info.lastInsertRowid,
        title: template.title,
        body: template.body,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    }
  }

  deleteTemplate(id) {
    this.db.prepare('DELETE FROM templates WHERE id = ?').run(id);
  }

  getTemplate(id) {
    return this.db.prepare('SELECT * FROM templates WHERE id = ?').get(id);
  }

  createCampaign(campaignData) {
    const { name, contactIds, dailyLimit, totalLimit } = campaignData;
    const totalContacts = contactIds.length;
    
    // Validate limits (1-1000)
    const dailyLimitValue = Math.min(Math.max(1, dailyLimit || 1000), 1000);
    const totalLimitValue = Math.min(Math.max(1, totalLimit || 1000), 1000);

    const info = this.db.prepare(`
      INSERT INTO campaigns (name, totalContacts, dailyLimit, totalLimit, status)
      VALUES (?, ?, ?, ?, 'pending')
    `).run(name, totalContacts, dailyLimitValue, totalLimitValue);

    return {
      id: info.lastInsertRowid,
      name,
      totalContacts,
      sent: 0,
      failed: 0,
      status: 'pending',
      dailyLimit: dailyLimitValue,
      totalLimit: totalLimitValue,
      createdAt: new Date().toISOString()
    };
  }
  
  // Get messages sent in last 24 hours (global)
  getMessagesLast24Hours() {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const result = this.db.prepare(`
      SELECT COUNT(*) as count 
      FROM message_tracking 
      WHERE sentAt >= ?
    `).get(twentyFourHoursAgo);
    return result.count || 0;
  }
  
  // Get messages sent in last 24 hours for a campaign
  getCampaignMessagesLast24Hours(campaignId) {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const result = this.db.prepare(`
      SELECT COUNT(*) as count 
      FROM message_tracking 
      WHERE campaignId = ? AND sentAt >= ?
    `).get(campaignId, twentyFourHoursAgo);
    return result.count || 0;
  }
  
  // Track a sent message
  trackMessage(campaignId, contactId) {
    this.db.prepare(`
      INSERT INTO message_tracking (campaignId, contactId)
      VALUES (?, ?)
    `).run(campaignId, contactId);
  }
  
  // Update campaign status
  updateCampaignStatus(campaignId, status) {
    if (status === 'running') {
      this.db.prepare(`
        UPDATE campaigns 
        SET status = ?, startedAt = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(status, campaignId);
    } else if (status === 'paused') {
      this.db.prepare(`
        UPDATE campaigns 
        SET status = ?, pausedAt = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(status, campaignId);
    } else {
      this.db.prepare(`
        UPDATE campaigns 
        SET status = ?
        WHERE id = ?
      `).run(status, campaignId);
    }
  }
  
  // Check if campaign can start
  canStartCampaign(campaignId) {
    const campaign = this.db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
    if (!campaign) return { canStart: false, reason: 'Campaign not found' };
    
    if (campaign.status === 'completed') {
      return { canStart: false, reason: 'Campaign is already completed' };
    }
    
    if (campaign.status === 'running') {
      return { canStart: false, reason: 'Campaign is already running' };
    }
    
    // Check 24-hour limit for this campaign
    const messagesLast24h = this.getCampaignMessagesLast24Hours(campaignId);
    if (messagesLast24h >= campaign.dailyLimit) {
      return { 
        canStart: false, 
        reason: `24-hour limit reached (${messagesLast24h}/${campaign.dailyLimit} messages)` 
      };
    }
    
    // Check total limit
    if (campaign.sent >= campaign.totalLimit) {
      return { 
        canStart: false, 
        reason: `Total limit reached (${campaign.sent}/${campaign.totalLimit} messages)` 
      };
    }
    
    // Check global 24-hour limit (1000 messages max)
    const globalMessages24h = this.getMessagesLast24Hours();
    if (globalMessages24h >= 1000) {
      return { 
        canStart: false, 
        reason: `Global 24-hour limit reached (${globalMessages24h}/1000 messages)` 
      };
    }
    
    return { canStart: true };
  }
  
  // Get campaign by ID
  getCampaign(id) {
    return this.db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
  }

  updateCampaignProgress(campaignId, sent, failed) {
    this.db.prepare(`
      UPDATE campaigns 
      SET sent = ?, failed = ?
      WHERE id = ?
    `).run(sent, failed, campaignId);
    
    // Check if total limit reached
    const campaignInfo = this.getCampaign(campaignId);
    if (campaignInfo && sent >= campaignInfo.totalLimit) {
      this.updateCampaignStatus(campaignId, 'completed');
      this.db.prepare(`
        UPDATE campaigns 
        SET completedAt = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(campaignId);
    }
  }

  completeCampaign(campaignId) {
    this.db.prepare(`
      UPDATE campaigns 
      SET completedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(campaignId);
  }

  getCampaigns() {
    return this.db.prepare('SELECT * FROM campaigns ORDER BY createdAt DESC').all();
  }

  updateContactStatus(contactId, status, sentAt = null) {
    this.db.prepare(`
      UPDATE contacts 
      SET status = ?, sentAt = ?
      WHERE id = ?
    `).run(status, sentAt, contactId);
  }

  addLog(campaignId, contactId, status, error = null) {
    this.db.prepare(`
      INSERT INTO logs (campaignId, contactId, status, error)
      VALUES (?, ?, ?, ?)
    `).run(campaignId, contactId, status, error);
  }

  getLogs(filters = {}) {
    let query = 'SELECT l.*, c.name, c.phone FROM logs l LEFT JOIN contacts c ON l.contactId = c.id WHERE 1=1';
    const params = [];

    if (filters.campaignId) {
      query += ' AND l.campaignId = ?';
      params.push(filters.campaignId);
    }

    if (filters.status) {
      query += ' AND l.status = ?';
      params.push(filters.status);
    }

    if (filters.search) {
      query += ' AND (c.phone LIKE ? OR c.name LIKE ?)';
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm);
    }

    query += ' ORDER BY l.timestamp DESC LIMIT 1000';

    return this.db.prepare(query).all(...params);
  }

  getDashboardStats() {
    const totalContacts = this.db.prepare('SELECT COUNT(*) as count FROM contacts').get().count;
    const totalCampaigns = this.db.prepare('SELECT COUNT(*) as count FROM campaigns').get().count;
    const lastCampaign = this.db.prepare('SELECT * FROM campaigns ORDER BY createdAt DESC LIMIT 1').get();
    const pendingContacts = this.db.prepare("SELECT COUNT(*) as count FROM contacts WHERE status = 'pending'").get().count;
    const sentContacts = this.db.prepare("SELECT COUNT(*) as count FROM contacts WHERE status = 'sent'").get().count;

    return {
      totalContacts,
      totalCampaigns,
      lastCampaign,
      pendingContacts,
      sentContacts
    };
  }

  // Get chart data for campaigns over time
  getCampaignsChartData() {
    // Get last 7 days of campaigns
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const campaigns = this.db.prepare(`
      SELECT 
        DATE(createdAt) as date,
        COUNT(*) as count,
        SUM(sent) as totalSent,
        SUM(failed) as totalFailed
      FROM campaigns 
      WHERE createdAt >= ?
      GROUP BY DATE(createdAt)
      ORDER BY date ASC
    `).all(sevenDaysAgo);
    
    return campaigns;
  }

  // Get campaign status distribution
  getCampaignStatusDistribution() {
    const statuses = this.db.prepare(`
      SELECT 
        COALESCE(status, 'pending') as status,
        COUNT(*) as count
      FROM campaigns
      GROUP BY status
    `).all();
    
    return statuses;
  }

  // Get message status distribution
  getMessageStatusDistribution() {
    const statuses = this.db.prepare(`
      SELECT 
        COALESCE(status, 'pending') as status,
        COUNT(*) as count
      FROM contacts
      GROUP BY status
    `).all();
    
    return statuses;
  }

  // Get top performing campaigns
  getTopCampaigns(limit = 5) {
    return this.db.prepare(`
      SELECT 
        name,
        sent,
        failed,
        totalContacts,
        (sent * 100.0 / NULLIF(totalContacts, 0)) as successRate
      FROM campaigns
      WHERE totalContacts > 0
      ORDER BY sent DESC
      LIMIT ?
    `).all(limit);
  }

  // Get messages sent over time (last 7 days)
  getMessagesSentOverTime() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const messages = this.db.prepare(`
      SELECT 
        DATE(sentAt) as date,
        COUNT(*) as sentCount
      FROM contacts
      WHERE status = 'sent' AND sentAt >= ?
      GROUP BY DATE(sentAt)
      ORDER BY date ASC
    `).all(sevenDaysAgo);
    
    return messages;
  }

  // Get success rate data
  getSuccessRateData() {
    const totalSent = this.db.prepare("SELECT COUNT(*) as count FROM contacts WHERE status = 'sent'").get().count || 0;
    const totalFailed = this.db.prepare("SELECT COUNT(*) as count FROM contacts WHERE status = 'failed'").get().count || 0;
    const totalPending = this.db.prepare("SELECT COUNT(*) as count FROM contacts WHERE status = 'pending'").get().count || 0;
    const total = totalSent + totalFailed + totalPending;
    
    return {
      sent: totalSent,
      failed: totalFailed,
      pending: totalPending,
      total: total,
      successRate: total > 0 ? ((totalSent / total) * 100).toFixed(2) : 0
    };
  }

  getContactsByIds(ids) {
    const placeholders = ids.map(() => '?').join(',');
    return this.db.prepare(`SELECT * FROM contacts WHERE id IN (${placeholders})`).all(...ids);
  }

  // Add a single contact with validation
  addContact(name, phone, message = '') {
    // Validate name
    if (!name || !name.trim()) {
      return { success: false, error: 'Name is required' };
    }

    // Validate phone
    const phoneValidation = this.validatePhone(phone);
    if (!phoneValidation.valid) {
      return { success: false, error: phoneValidation.error };
    }

    const normalizedPhone = phoneValidation.normalized;

    // Check for duplicate
    const existing = this.contactExists(normalizedPhone);
    if (existing) {
      return { 
        success: false, 
        error: 'Contact with this phone number already exists',
        existingContact: existing
      };
    }

    // Insert contact
    try {
      const info = this.db.prepare(`
        INSERT INTO contacts (name, phone, message)
        VALUES (?, ?, ?)
      `).run(name.trim(), normalizedPhone, message.trim());

      return {
        success: true,
        contact: {
          id: info.lastInsertRowid,
          name: name.trim(),
          phone: normalizedPhone,
          message: message.trim()
        }
      };
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.message.includes('UNIQUE constraint')) {
        return { 
          success: false, 
          error: 'Contact with this phone number already exists' 
        };
      }
      return { success: false, error: error.message || 'Failed to add contact' };
    }
  }

  // ========== AUTOMATED MESSAGES METHODS ==========

  // Get all automated message flows
  getAutomatedMessages() {
    return this.db.prepare('SELECT * FROM automated_messages ORDER BY createdAt DESC').all();
  }

  // Get automated message by ID with all steps
  getAutomatedMessage(id) {
    const flow = this.db.prepare('SELECT * FROM automated_messages WHERE id = ?').get(id);
    if (!flow) return null;

    const steps = this.db.prepare(`
      SELECT * FROM automated_message_steps 
      WHERE flowId = ? 
      ORDER BY stepOrder ASC
    `).all(id);

    // Create a map of stepId to stepOrder for converting nextStepId to step number
    const stepIdToOrderMap = {};
    steps.forEach(step => {
      stepIdToOrderMap[step.id] = step.stepOrder;
    });

    // Get options for each step
    const stepsWithOptions = steps.map(step => {
      const options = this.db.prepare(`
        SELECT * FROM automated_message_options 
        WHERE stepId = ? 
        ORDER BY optionOrder ASC
      `).all(step.id);
      
      // Convert nextStepId to nextStepNumber for UI
      const optionsWithStepNumber = options.map(opt => {
        let nextStepNumber = null;
        if (opt.nextStepId) {
          // Find which step order this nextStepId corresponds to
          const targetStep = steps.find(s => s.id === opt.nextStepId);
          if (targetStep) {
            nextStepNumber = targetStep.stepOrder;
          }
        }
        return { ...opt, nextStepNumber };
      });
      
      return { ...step, options: optionsWithStepNumber };
    });

    return { ...flow, steps: stepsWithOptions };
  }

  // Create or update automated message flow
  saveAutomatedMessage(flowData) {
    const { id, name, description, isActive, steps } = flowData;

    if (id) {
      // Update existing flow
      this.db.prepare(`
        UPDATE automated_messages 
        SET name = ?, description = ?, isActive = ?, updatedAt = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(name, description, isActive ? 1 : 0, id);

      // Delete old steps and options
      this.db.prepare('DELETE FROM automated_message_options WHERE stepId IN (SELECT id FROM automated_message_steps WHERE flowId = ?)').run(id);
      this.db.prepare('DELETE FROM automated_message_steps WHERE flowId = ?').run(id);
    } else {
      // Create new flow
      const info = this.db.prepare(`
        INSERT INTO automated_messages (name, description, isActive)
        VALUES (?, ?, ?)
      `).run(name, description, isActive ? 1 : 0);
      flowData.id = info.lastInsertRowid;
    }

    // Insert steps first to get their IDs
    const stepIdMap = {}; // Maps step order (1, 2, 3...) to step ID
    
    if (steps && Array.isArray(steps)) {
      steps.forEach((step, index) => {
        const stepInfo = this.db.prepare(`
          INSERT INTO automated_message_steps (flowId, stepOrder, question, stepType, isFormStep, formFieldName, formFieldType)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          flowData.id,
          index + 1,
          step.question,
          step.stepType || 'question',
          step.isFormStep ? 1 : 0,
          step.formFieldName || null,
          step.formFieldType || null
        );

        const stepId = stepInfo.lastInsertRowid;
        stepIdMap[index + 1] = stepId; // Map step number to step ID

        // Insert options if this is a question step
        if (step.options && Array.isArray(step.options)) {
          step.options.forEach((option, optIndex) => {
            // Convert nextStepNumber to nextStepId
            let nextStepId = null;
            if (option.nextStepNumber) {
              if (option.nextStepNumber === 'end') {
                nextStepId = null; // null means end of flow
              } else {
                // Find the step ID for the selected step number
                const targetStepNumber = parseInt(option.nextStepNumber);
                if (stepIdMap[targetStepNumber]) {
                  nextStepId = stepIdMap[targetStepNumber];
                }
              }
            } else if (option.nextStepId) {
              // Keep existing nextStepId if provided
              nextStepId = option.nextStepId;
            }
            
            this.db.prepare(`
              INSERT INTO automated_message_options (stepId, optionText, optionUrl, nextStepId, optionOrder)
              VALUES (?, ?, ?, ?, ?)
            `).run(stepId, option.text, option.url || null, nextStepId, optIndex + 1);
          });
        }
      });
    }

    return this.getAutomatedMessage(flowData.id);
  }

  // Delete automated message flow
  deleteAutomatedMessage(id) {
    // Cascade delete will handle steps and options
    this.db.prepare('DELETE FROM automated_messages WHERE id = ?').run(id);
  }

  // Get active flow for a phone number (if user is in a conversation)
  getActiveFlowForPhone(phone) {
    const normalized = this.normalizePhone(phone);
    const result = this.db.prepare(`
      SELECT r.*, r.flowId, f.name as flowName, s.question, s.stepType, s.isFormStep
      FROM automated_message_responses r
      JOIN automated_messages f ON r.flowId = f.id
      LEFT JOIN automated_message_steps s ON r.currentStepId = s.id
      WHERE r.phone = ? AND r.status = 'active'
      ORDER BY r.lastInteractionAt DESC
      LIMIT 1
    `).get(normalized);
    
    // Parse formData JSON if it exists
    if (result && result.formData) {
      try {
        result.formData = JSON.parse(result.formData);
      } catch (e) {
        result.formData = {};
      }
    } else if (result) {
      result.formData = {};
    }
    
    return result;
  }

  // Start a flow for a phone number
  startFlowForPhone(flowId, phone) {
    const normalized = this.normalizePhone(phone);
    
    // Get first step of the flow first
    const firstStep = this.db.prepare(`
      SELECT * FROM automated_message_steps 
      WHERE flowId = ? 
      ORDER BY stepOrder ASC 
      LIMIT 1
    `).get(flowId);

    if (!firstStep) {
      console.log('No first step found for flow:', flowId);
      return null;
    }
    
    // Check if user already completed this flow recently (prevent duplicates)
    const recentlyCompleted = this.db.prepare(`
      SELECT * FROM automated_message_responses 
      WHERE flowId = ? AND phone = ? AND status = 'completed'
      AND completedAt > datetime('now', '-7 days')
      ORDER BY completedAt DESC
      LIMIT 1
    `).get(flowId, normalized);
    
    if (recentlyCompleted) {
      console.log('User already completed this flow recently, not starting again');
      return null; // Don't start duplicate flow
    }
    
    // Check if there's already an active flow for this user (any flow)
    const existing = this.getActiveFlowForPhone(normalized);
    if (existing) {
      // If same flow, return existing
      if (existing.flowId === flowId) {
        console.log('User already has this flow active, returning existing');
        return existing;
      }
      // If different flow, update to new flow
      console.log('User has different flow active, switching to new flow');
      // Update existing
      this.db.prepare(`
        UPDATE automated_message_responses 
        SET flowId = ?, currentStepId = ?, lastInteractionAt = CURRENT_TIMESTAMP, formData = '{}', status = 'active'
        WHERE id = ?
      `).run(flowId, firstStep.id, existing.id);
      const updated = Object.assign({}, existing);
      updated.currentStepId = firstStep.id;
      updated.flowId = flowId;
      return updated;
    }

    // Create new response with empty form data
    const info = this.db.prepare(`
      INSERT INTO automated_message_responses (flowId, phone, currentStepId, formData)
      VALUES (?, ?, ?, '{}')
    `).run(flowId, normalized, firstStep.id);

    return {
      id: info.lastInsertRowid,
      flowId,
      phone: normalized,
      currentStepId: firstStep.id,
      status: 'active',
      formData: '{}'
    };
  }

  // Process user response and move to next step
  processResponse(phone, responseText) {
    const normalized = this.normalizePhone(phone);
    const activeFlow = this.getActiveFlowForPhone(normalized);
    
    console.log('processResponse - phone:', normalized, 'activeFlow:', activeFlow ? 'Found - ID: ' + activeFlow.id + ', FlowId: ' + activeFlow.flowId + ', StepId: ' + activeFlow.currentStepId : 'Not found');
    
    if (!activeFlow || !activeFlow.currentStepId) {
      console.log('processResponse - No active flow or no currentStepId');
      return null;
    }

    const currentStep = this.db.prepare('SELECT * FROM automated_message_steps WHERE id = ?').get(activeFlow.currentStepId);
    if (!currentStep) {
      console.log('processResponse - Current step not found for stepId:', activeFlow.currentStepId);
      return null;
    }
    console.log('processResponse - Current step found:', currentStep.question.substring(0, 50), 'isFormStep:', currentStep.isFormStep);

    // If it's a form step, save the data to formData JSON
    if (currentStep.isFormStep) {
      // Get current form data
      const formDataStr = activeFlow.formData || '{}';
      let formData = {};
      try {
        formData = JSON.parse(formDataStr);
      } catch (e) {
        formData = {};
      }
      
      // Save the response to form data
      const fieldName = currentStep.formFieldName || 'field_' + currentStep.id;
      formData[fieldName] = responseText.trim();
      
      // Update form data in database
      this.db.prepare(`
        UPDATE automated_message_responses 
        SET formData = ?, lastInteractionAt = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(JSON.stringify(formData), activeFlow.id);
      
      // Move to next step
      const nextStep = this.db.prepare(`
        SELECT * FROM automated_message_steps 
        WHERE flowId = ? AND stepOrder > ?
        ORDER BY stepOrder ASC 
        LIMIT 1
      `).get(activeFlow.flowId, currentStep.stepOrder);
      
      if (nextStep) {
        this.db.prepare(`
          UPDATE automated_message_responses 
          SET currentStepId = ?, lastInteractionAt = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(nextStep.id, activeFlow.id);
        return { type: 'form_next', step: nextStep, formData };
      } else {
        // Form completed
        this.db.prepare(`
          UPDATE automated_message_responses 
          SET status = 'completed', completedAt = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(activeFlow.id);
        return { type: 'form_completed', formData };
      }
    }

    // Find matching option
    const options = this.db.prepare(`
      SELECT * FROM automated_message_options 
      WHERE stepId = ? 
      ORDER BY optionOrder ASC
    `).all(currentStep.id);

    // Try to match response with option (case insensitive, partial match)
    const matchedOption = options.find(opt => 
      opt.optionText.toLowerCase().includes(responseText.toLowerCase().trim()) ||
      responseText.toLowerCase().trim().includes(opt.optionText.toLowerCase())
    );

    if (!matchedOption) {
      // No match found, stay on current step
      console.log('processResponse - No option matched for response:', responseText.substring(0, 50));
      return { type: 'no_match', step: currentStep, options };
    }

    console.log('processResponse - Option matched:', matchedOption.optionText, 'nextStepId:', matchedOption.nextStepId);

    // Move to next step
    let nextStepId = matchedOption.nextStepId;
    
    // If no explicit next step, get next step by order
    if (!nextStepId) {
      const nextStep = this.db.prepare(`
        SELECT * FROM automated_message_steps 
        WHERE flowId = ? AND stepOrder > ?
        ORDER BY stepOrder ASC 
        LIMIT 1
      `).get(activeFlow.flowId, currentStep.stepOrder);
      nextStepId = nextStep ? nextStep.id : null;
      console.log('processResponse - Auto next step:', nextStepId ? 'Found' : 'Not found (end of flow)');
    }

    if (nextStepId) {
      // Update to next step
      this.db.prepare(`
        UPDATE automated_message_responses 
        SET currentStepId = ?, lastInteractionAt = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(nextStepId, activeFlow.id);
      
      // Get the next step and its options
      const nextStep = this.db.prepare('SELECT * FROM automated_message_steps WHERE id = ?').get(nextStepId);
      const nextStepOptions = this.db.prepare(`
        SELECT * FROM automated_message_options 
        WHERE stepId = ? 
        ORDER BY optionOrder ASC
      `).all(nextStepId);
      
      console.log('processResponse - Moved to next step:', nextStep ? nextStep.question.substring(0, 50) : 'Not found', 'Options:', nextStepOptions.length);
      
      return { type: 'next_step', step: nextStep, options: nextStepOptions };
    } else {
      // Flow completed - save form data if any
      const formDataStr = activeFlow.formData || '{}';
      let formData = {};
      try {
        formData = JSON.parse(formDataStr);
      } catch (e) {
        formData = {};
      }
      
      // Mark as completed
      this.db.prepare(`
        UPDATE automated_message_responses 
        SET status = 'completed', completedAt = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(activeFlow.id);
      
      // Save collected data
      if (Object.keys(formData).length > 0 || activeFlow.flowId) {
        const contact = this.getContactByPhone(normalized);
        const collectedData = {
          name: contact ? contact.name : null,
          email: formData.email || null,
          mobile: normalized,
          isInterested: true,
          customData: formData
        };
        this.saveFormData(activeFlow.flowId, normalized, collectedData);
      }
    }

    const nextStep = nextStepId ? this.db.prepare('SELECT * FROM automated_message_steps WHERE id = ?').get(nextStepId) : null;
    const nextStepOptions = nextStep ? this.db.prepare(`
      SELECT * FROM automated_message_options 
      WHERE stepId = ? 
      ORDER BY optionOrder ASC
    `).all(nextStep.id) : [];

    return {
      type: 'next',
      step: nextStep,
      options: nextStepOptions,
      completed: !nextStepId
    };
  }

  // Save form data
  saveFormData(flowId, phone, formData) {
    const normalized = this.normalizePhone(phone);
    
    // Check if data already exists
    const existing = this.db.prepare('SELECT * FROM collected_data WHERE flowId = ? AND phone = ?').get(flowId, normalized);
    
    if (existing) {
      // Update existing
      this.db.prepare(`
        UPDATE collected_data 
        SET name = ?, email = ?, mobile = ?, customData = ?, isInterested = ?, submittedAt = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        formData.name || null,
        formData.email || null,
        formData.mobile || normalized,
        JSON.stringify(formData.customData || {}),
        formData.isInterested ? 1 : 0,
        existing.id
      );
      return existing.id;
    } else {
      // Insert new
      const info = this.db.prepare(`
        INSERT INTO collected_data (flowId, phone, name, email, mobile, customData, isInterested)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        flowId,
        normalized,
        formData.name || null,
        formData.email || null,
        formData.mobile || normalized,
        JSON.stringify(formData.customData || {}),
        formData.isInterested ? 1 : 0
      );
      return info.lastInsertRowid;
    }
  }

  // Get collected data (interested leads)
  getCollectedData(filters = {}) {
    let query = 'SELECT * FROM collected_data WHERE 1=1';
    const params = [];

    if (filters.flowId) {
      query += ' AND flowId = ?';
      params.push(filters.flowId);
    }

    if (filters.isInterested !== undefined) {
      query += ' AND isInterested = ?';
      params.push(filters.isInterested ? 1 : 0);
    }

    if (filters.search) {
      query += ' AND (name LIKE ? OR email LIKE ? OR phone LIKE ? OR mobile LIKE ?)';
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    query += ' ORDER BY submittedAt DESC';

    const results = this.db.prepare(query).all(...params);
    
    // Parse customData JSON
    return results.map(row => ({
      ...row,
      customData: row.customData ? JSON.parse(row.customData) : {}
    }));
  }

  // Get form fields for a flow
  getFormFields(flowId) {
    return this.db.prepare(`
      SELECT * FROM form_fields 
      WHERE flowId = ? 
      ORDER BY fieldOrder ASC
    `).all(flowId);
  }

  // Save form fields for a flow
  saveFormFields(flowId, fields) {
    // Delete existing fields
    this.db.prepare('DELETE FROM form_fields WHERE flowId = ?').run(flowId);

    // Insert new fields
    if (fields && Array.isArray(fields)) {
      fields.forEach((field, index) => {
        this.db.prepare(`
          INSERT INTO form_fields (flowId, fieldName, fieldLabel, fieldType, isRequired, fieldOrder)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          flowId,
          field.fieldName,
          field.fieldLabel,
          field.fieldType || 'text',
          field.isRequired ? 1 : 0,
          index + 1
        );
      });
    }
  }

  // Get count of automated messages created
  getAutomatedMessageCount() {
    const result = this.db.prepare('SELECT COUNT(*) as count FROM automated_messages').get();
    return result.count || 0;
  }

  // Get active automated message flows
  getActiveAutomatedMessages() {
    return this.db.prepare(`
      SELECT * FROM automated_messages 
      WHERE isActive = 1 
      ORDER BY createdAt DESC
    `).all();
  }

  // Get automated message by ID (simple version for internal use)
  getAutomatedMessageById(id) {
    return this.db.prepare('SELECT * FROM automated_messages WHERE id = ?').get(id);
  }

  // Get contact by phone
  getContactByPhone(phone) {
    const normalized = this.normalizePhone(phone);
    return this.db.prepare('SELECT name FROM contacts WHERE phone = ?').get(normalized);
  }

  // Get step by ID
  getStepById(stepId) {
    return this.db.prepare('SELECT * FROM automated_message_steps WHERE id = ?').get(stepId);
  }

  // Get first step of a flow
  getFirstStepOfFlow(flowId) {
    return this.db.prepare(`
      SELECT * FROM automated_message_steps
      WHERE flowId = ? 
      ORDER BY stepOrder ASC 
      LIMIT 1
    `).get(flowId);
  }

  // Get options for a step
  getStepOptions(stepId) {
    return this.db.prepare(`
      SELECT * FROM automated_message_options 
      WHERE stepId = ? 
      ORDER BY optionOrder ASC
    `).all(stepId);
  }
}

module.exports = DatabaseManager;

