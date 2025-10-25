# Productivity Task Monitor

A Chrome extension and web app that monitors your productivity by tracking if you're on task, with AI-powered analysis and accountability features.

## Setup Instructions

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd cal-hacks-fall25
```

### 2. Configure API Keys

#### For Chrome Extension:

1. Copy the config template:
```bash
cp config_template.js config.js
```

2. Edit `config.js` and add your API keys:
   - Claude API Key
   - Gemini API Key
   - Letta API Key & Project & Agent ID
   - Vapi API Keys (Private Key, Phone Number ID, Assistant IDs)
   - Supabase URL & Anon Key

#### For Web App:

1. Copy the config template:
```bash
cp webapp/config_template.js webapp/config.js
```

2. Edit `webapp/config.js` and add your Supabase credentials

### 3. Install the Chrome Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the project directory
5. The extension should now be installed

### 4. Run the Web App

1. Navigate to the webapp directory:
```bash
cd webapp
```

2. Start a local server (you can use any method):
   - Python: `python -m http.server 8000`
   - Node.js: `npx http-server -p 8000`
   - Or use any web server of your choice

3. Open `http://localhost:8000` in your browser

## Security Notes

⚠️ **IMPORTANT**: The `config.js` and `webapp/config.js` files are in `.gitignore` and should **NEVER** be committed to version control. They contain sensitive API keys.

If you need to share the project:
1. Use the template files (`config_template.js` and `webapp/config_template.js`)
2. Or provide instructions for users to create their own `config.js` files

## Features

- AI-powered productivity monitoring using Claude, Gemini, and Letta
- Automatic strike system for unproductive behavior
- Phone call accountability after reaching strike threshold
- Web app dashboard for statistics and session management
- Supabase integration for user authentication and data storage
- Chrome extension for continuous monitoring across tabs

## Tech Stack

- **Frontend**: HTML, CSS, JavaScript
- **Chrome Extension**: Manifest V3
- **Backend/Storage**: Supabase
- **AI**: Claude, Gemini, Letta AI
- **Voice AI**: Vapi
