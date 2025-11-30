const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Send messages to main process
  sendMessage: (channel, data) => {
    const validChannels = [
      'whatsapp-connect',
      'whatsapp-disconnect',
      'upload-csv',
      'save-template',
      'delete-template',
      'delete-contact',
      'start-campaign',
      'delete-automated-message'
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },

  // Receive messages from main process
  receiveMessage: (channel, func) => {
    const validChannels = [
      'qr-update',
      'connection-status',
      'csv-uploaded',
      'template-saved',
      'template-deleted',
      'contact-deleted',
      'campaign-started',
      'campaign-progress',
      'log-update',
      'incoming-message',
      'automated-message-deleted'
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },

  // Remove listeners
  removeListener: (channel, func) => {
    ipcRenderer.removeListener(channel, func);
  },

  // Invoke handlers (for async operations)
  invoke: (channel, data) => {
    const validChannels = [
      'get-templates',
      'get-contacts',
      'get-campaigns',
      'get-logs',
      'get-dashboard-stats',
      'select-csv-file',
      'select-media-file',
      'read-file',
      'get-phone-number',
      'get-whatsapp-chats',
      'get-whatsapp-contacts',
      'get-chat-messages',
      'send-whatsapp-message',
      'get-messages-sent-over-time',
      'get-success-rate-data',
      'can-start-campaign',
      'add-contact',
      'get-automated-messages',
      'get-automated-message',
      'save-automated-message',
      'get-collected-data',
      'get-automated-message-count'
    ];
    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, data);
    } else {
      console.warn('Invalid IPC channel:', channel);
      return Promise.resolve({ success: false, error: 'Invalid channel' });
    }
  }
});

