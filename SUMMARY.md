# Productivity Monitor Extension - Summary

## Features

### 1. Real-Time Tab Display
- Shows current tab URL
- Productivity status (Productive/Unproductive) 
- Live countdown until strike (if unproductive)
- Updates every second

### 2. AI-Powered Analysis
- **Primary:** Claude Vision API (analyzes screenshots)
- **Fallback:** Gemini API (text-only analysis)
- **Immediate Status:** Shows productivity immediately
- **Delayed Strike:** Only adds strike after 30 seconds on unproductive site

### 3. Image Analysis
- Claude analyzes actual screenshots
- Sees what's on the screen, not just the URL
- More accurate than text-only analysis

### 4. Draggable Overlay (New!)
- Open overlay with `overlay.html`
- Drag it anywhere on screen
- Always stays open
- Shows real-time status
- Close button to minimize

### 5. Smart Strike System
- 30-second delay before strike
- Prevents false positives from quick tab switches
- Countdown shows time remaining
- Status updates immediately

### 6. Settings
- **Stop Monitoring:** Pauses tracking, preserves stats
- **Stop Recording:** Completely resets everything
- Stats persist when pausing

## How It Works

1. User sets task and starts monitoring
2. Extension captures screenshot of current tab
3. Claude Vision analyzes the image + URL/title
4. Status updates immediately (Productive/Unproductive)
5. If unproductive for 30+ seconds → Add strike
6. Real-time display in popup or overlay

## Analysis Method

**Claude Vision:**
- Captures screenshot of browser tab
- Analyzes the actual content on screen
- More accurate than URL-only checking
- Can see if you're on an educational page vs social media

## Files

- `background.js` - Core logic, AI analysis
- `popup.html/js/css` - Extension popup
- `overlay.html/js` - Draggable always-on overlay
- `content.js` - Content script for alerts
- `manifest.json` - Extension configuration

## Current Status

✅ Status updates instantly
✅ Screenshots analyzed by Claude Vision
✅ 30-second strike delay
✅ Real-time countdown
✅ Draggable overlay window
✅ Stats and tracking
✅ AI-powered analysis
