# WhatsApp Marketing Automation Desktop App

A powerful desktop application built with Electron.js for automating WhatsApp marketing campaigns. Features include CSV contact management, message templates, campaign tracking, and anti-block features.

## 🚀 Features

- **WhatsApp Integration**: QR code-based authentication with persistent session
- **CSV Contact Management**: Upload and manage contacts from CSV files
- **Message Templates**: Create reusable message templates with variables ({{name}})
- **Campaign Management**: Create and track marketing campaigns with real-time progress
- **Media Support**: Send images, PDFs, and documents
- **Anti-Block Features**: Random delays, pause after X messages, retry failed messages
- **SQLite Database**: Local data storage for contacts, templates, campaigns, and logs
- **Modern UI**: Beautiful, responsive interface built with React (CDN)

## 📋 Prerequisites

- Node.js (v16 or higher)
- npm or yarn

## 🛠️ Installation

1. Clone or download this repository

2. Install dependencies:
```bash
npm install
```

## 🎯 Usage

### Start the Application

```bash
npm start
```

### First Time Setup

1. **Connect WhatsApp**:
   - Go to the "Connection" tab
   - Click "Connect WhatsApp"
   - Scan the QR code with your WhatsApp mobile app
   - Wait for connection confirmation

2. **Upload Contacts**:
   - Go to the "Contacts" tab
   - Click "Upload CSV"
   - Select a CSV file with format: `name,phone,customMessage`
   - Preview and save to database

3. **Create Templates** (Optional):
   - Go to the "Templates" tab
   - Click "New Template"
   - Enter title and body (use `{{name}}` for variables)
   - Save template

4. **Start Campaign**:
   - Go to the "Campaign" tab
   - Enter campaign name
   - Select template (optional)
   - Select contacts
   - Configure delays and anti-block settings
   - Optionally attach media (image/PDF)
   - Click "Start Campaign"

## 📁 Project Structure

```
whatsappautomation9999/
├── main.js                 # Electron main process
├── preload.js             # IPC bridge (preload script)
├── package.json           # Dependencies and scripts
├── backend/
│   ├── database.js        # SQLite database operations
│   └── whatsapp.js        # WhatsApp client handler
├── renderer/
│   └── index.html         # React frontend (single HTML file)
├── session/               # WhatsApp session storage (auto-created)
└── database.db            # SQLite database (auto-created)
```

## 🗄️ Database Schema

### Contacts
- `id`, `name`, `phone`, `message`, `templateId`, `status`, `sentAt`, `createdAt`

### Templates
- `id`, `title`, `body`, `createdAt`, `updatedAt`

### Campaigns
- `id`, `name`, `totalContacts`, `sent`, `failed`, `createdAt`, `completedAt`

### Logs
- `id`, `campaignId`, `contactId`, `status`, `error`, `timestamp`

### Settings
- `key`, `value`

## ⚙️ Configuration

### Anti-Block Settings

- **Delay**: Fixed delay between messages (default: 5000ms)
- **Random Delay**: Enable random delay with min/max range (recommended: 5000-9000ms)
- **Pause After X Messages**: Automatic pause after sending X messages (30 second pause)

### CSV Format

```csv
name,phone,customMessage
John Doe,1234567890,Hello John!
Jane Smith,0987654321,Hi Jane, this is a custom message
```

## 📦 Building for Production

### Windows
```bash
npm run build:win
```

### macOS
```bash
npm run build:mac
```

### Linux
```bash
npm run build:linux
```

Built files will be in the `dist/` directory.

## 🔒 Security Notes

- WhatsApp session is stored locally in the `session/` directory
- Never share your session files
- Use this tool responsibly and in compliance with WhatsApp's Terms of Service
- Avoid sending spam messages to prevent account restrictions

## 🐛 Troubleshooting

### QR Code Not Showing
- Make sure WhatsApp Web is not already connected on another device
- Try disconnecting and reconnecting

### Messages Not Sending
- Verify WhatsApp connection status
- Check phone number format (should include country code)
- Review logs for error messages

### Database Errors
- Delete `database.db` to reset (will lose all data)
- Ensure write permissions in the application directory

## 📝 License

MIT License

## ⚠️ Disclaimer

This tool is for educational and legitimate marketing purposes only. Users are responsible for complying with WhatsApp's Terms of Service and applicable laws. The developers are not responsible for any misuse of this software.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📧 Support

For issues and questions, please open an issue on the repository.

---

**Built with ❤️ using Electron.js, React, and whatsapp-web.js**

