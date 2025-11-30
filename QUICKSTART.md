# Quick Start Guide

## Installation Steps

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start the Application**
   ```bash
   npm start
   ```

## First Run Checklist

### Step 1: Connect WhatsApp
- Open the app
- Go to **Connection** tab
- Click **"Connect WhatsApp"**
- Scan the QR code with your phone
- Wait for "Connected" status

### Step 2: Add Contacts
- Go to **Contacts** tab
- Click **"Upload CSV"**
- Select `sample-contacts.csv` (or your own CSV file)
- Format: `name,phone,customMessage`
- Click **"Save to Database"**

### Step 3: Create Template (Optional)
- Go to **Templates** tab
- Click **"New Template"**
- Enter title and message
- Use `{{name}}` for contact name variable
- Click **"Save"**

### Step 4: Start Campaign
- Go to **Campaign** tab
- Enter campaign name
- Select template (optional)
- Select contacts to send to
- Configure delays:
  - **Delay**: 5000ms (5 seconds) recommended
  - **Random Delay**: Enable with 5000-9000ms range
  - **Pause After**: 10 messages (optional)
- Optionally select media file (image/PDF)
- Click **"Start Campaign"**

### Step 5: Monitor Progress
- Watch real-time progress in Campaign tab
- Check **Logs** tab for detailed sending status
- View **Dashboard** for statistics

## CSV Format Example

```csv
name,phone,customMessage
John Doe,1234567890,Hello John!
Jane Smith,0987654321,Hi Jane!
```

**Note**: Phone numbers should include country code (e.g., 91 for India, 1 for USA)

## Tips

- **Anti-Block**: Always use random delays (5-9 seconds)
- **Pause**: Set pause after 10-20 messages to avoid rate limiting
- **Testing**: Test with 1-2 contacts first
- **Media**: Keep media files small (< 5MB recommended)

## Troubleshooting

**QR Code not showing?**
- Check console for errors
- Try disconnecting and reconnecting

**Messages not sending?**
- Verify WhatsApp is connected
- Check phone number format
- Review logs for errors

**App crashes?**
- Delete `session/` folder and reconnect
- Delete `database.db` to reset (loses all data)

