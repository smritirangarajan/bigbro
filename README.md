# BigBro

## Inspiration
We've all been there - opening our laptop with the best intentions to study or work, only to find ourselves two hours deep into YouTube, Reddit, or endlessly scrolling social media. Traditional productivity apps rely on self-reporting or simple website blockers that are easy to bypass. We wanted to create something different: a system that truly knows when you're slacking off and holds you accountable in ways you can't ignore.

The idea came from a simple truth: we're accountable to others in ways we aren't to ourselves. If someone else knows you're wasting time, you're far more likely to get back on track. BigBro brings that external accountability into the digital workspace, using cutting-edge AI and computer vision to monitor both what you're doing and whether you're actually paying attention.

## What it does
BigBro is a comprehensive productivity monitoring system that watches you work in two powerful ways:

**Task Monitoring**: BigBro continuously captures screenshots of your current browser tab and sends it to Claude AI along with the URL and your stated task. Claude analyzes whether you're actually working toward your goal or if you've drifted off-task. If you're caught slacking for more than a few seconds, you accumulate strikes.

**Attention Monitoring**: Using your webcam, BigBro tracks your face in real-time using MediaPipe and OpenCV. It detects three critical states:
- **Sleeping**: If your eyes close for more than a few seconds, an aggressive AI-generated wake-up message plays through Fish Audio's text-to-speech
- **Looking Away**: If you turn your head away from the screen for more than a few seconds, you get a strike
- **Not Present**: If you leave your desk for more than a few seconds, BigBro calls your phone via Vapi to bring you back

**The Strike System**: Accumulate 2 strikes, and BigBro escalates. It automatically calls your accountability partner (yes, your mom) via Vapi's phone API to report that you're off-task. This creates real consequences that can't be dismissed with a click.

**Analytics Dashboard**: A web interface shows your productivity stats, strike history, and session summaries, helping you understand your focus patterns over time.

## How we built it
BigBro combines multiple cutting-edge technologies into a cohesive monitoring pipeline:

### Chrome Extension (Frontend)
- Built with Manifest V3 to access browser tabs and capture screenshots
- Background service orchestrates tab monitoring and coordinates with the vision server
- Popup interface for task setting and real-time status viewing

### Vision Analysis System (Python/Flask)
- Flask server running on port 8080 handles all computer vision processing
- MediaPipe Face Mesh detects 468 3D facial landmarks in real-time
- OpenCV solves the Perspective-n-Point problem to calculate precise head orientation
  - Takes 6 key landmarks from MediaPipe (nose, chin, eyes, mouth)
  - Maps 2D pixel coordinates to a 3D face model
  - Computes yaw and pitch angles using Rodrigues transformation
- Eye Aspect Ratio (EAR) calculated from MediaPipe landmarks to detect eye closure
- State machine with four states: focused, sleeping, looking_away, not_present

### AI Integration
- **Claude (Anthropic)**: Primary AI for sophisticated task analysis, handles nuanced "on-task" vs "off-task" decisions

### Alert Systems
- **Fish Audio**: Text-to-speech for immediate local wake-up calls
- **Vapi**: Phone call automation that contacts accountability partners with actual phone calls

### Data Layer
- **Supabase (PostgreSQL)**: Real-time database storing user settings, strikes, sessions, and events
- REST API for seamless integration across extension, vision server, and dashboard
- Row-level security for data protection
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

### 5. Run the Vision Server

1. Navigate to the vision directory:
```bash
cd vision
```

2. Activate the virtual environment:
```bash
source venv/bin/activate
```

3. Start the vision server:
```bash
python vision_server.py
```

The server will run on `http://localhost:8080`

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
- **Computer Vision**: MediaPipe, OpenCV
- **Backend**: Python, Flask
