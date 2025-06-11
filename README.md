# GoEthena Auto Clicker Chrome Extension

This Chrome extension automatically navigates through GoEthena training modules by scrolling, clicking Continue buttons, and selecting answer options.

## Features

- 🔄 **Auto Scroll**: Automatically scrolls down pages to reveal content
- ▶️ **Continue Detection**: Finds and clicks "Continue" buttons automatically
- ✅ **Answer Selection**: Clicks through all available answer options one by one
- 📝 **Submit Handling**: Automatically submits answers when ready
- 🎯 **Smart Detection**: Works with various answer formats (A, B, C, D, etc.)
- 📱 **Visual Feedback**: Shows a green indicator when active

## Installation Instructions

### Method 1: Load as Unpacked Extension (Recommended for Local Development)

1. **Download the Extension Files**
   - Make sure you have all these files in a folder:
     - `manifest.json`
     - `content.js`
     - `popup.html`
     - `popup.js`
     - `README.md`

2. **Open Chrome Extensions Page**
   - Open Google Chrome
   - Navigate to `chrome://extensions/`
   - Or go to Chrome menu → More Tools → Extensions

3. **Enable Developer Mode**
   - Toggle the "Developer mode" switch in the top right corner

4. **Load the Extension**
   - Click "Load unpacked" button
   - Select the folder containing all the extension files
   - The extension should now appear in your extensions list

5. **Pin the Extension (Optional)**
   - Click the puzzle piece icon in Chrome toolbar
   - Find "GoEthena Auto Clicker" and pin it for easy access

## How to Use

1. **Navigate to GoEthena**
   - Go to `app.goethena.com` and log in
   - Start any training module

2. **Activate the Extension**
   - Click on the GoEthena Auto Clicker extension icon in your toolbar
   - Click "Start Auto Clicker" button
   - You'll see a green indicator appear on the page showing "GoEthena Auto Clicker Active"

3. **Let it Work**
   - The extension will automatically:
     - Scroll down to reveal content
     - Click "Continue" buttons when they appear
     - Click through answer options (A, B, C, D, etc.)
     - Submit answers automatically
     - Move to the next question/page

4. **Stop the Extension**
   - Click the extension icon and click "Stop Auto Clicker"
   - Or simply navigate away from the page

## How It Works

The extension runs in the background and continuously:

1. **Looks for Continue buttons** - Searches for buttons containing "Continue", "Next", or similar text
2. **Finds answer options** - Identifies clickable elements that start with "A.", "B.", "C.", "D.", etc.
3. **Clicks systematically** - Clicks one answer option at a time with delays between clicks
4. **Submits answers** - Finds and clicks "Submit Answer" buttons
5. **Scrolls when needed** - Scrolls down to reveal more content when no clickable elements are found

## Timing and Delays

- **Scroll Speed**: 1 second between scroll attempts
- **Click Delay**: 2 seconds between clicks
- These delays help ensure the page has time to load and respond

## Troubleshooting

### Extension Not Working
- Make sure you're on `app.goethena.com`
- Refresh the page and try again
- Check that the extension is enabled in `chrome://extensions/`

### No Buttons Being Clicked
- The extension might not recognize the button format
- Try manually scrolling to see if buttons become visible
- Check the browser console (F12) for error messages

### Extension Stops Working
- Refresh the page
- Disable and re-enable the extension
- Reload the extension from `chrome://extensions/`

## Customization

You can modify the timing by editing `content.js`:

```javascript
this.scrollSpeed = 1000; // milliseconds between scrolls
this.clickDelay = 2000;  // milliseconds between clicks
```

## Safety Notes

- This extension only works on `app.goethena.com` for security
- It will only click on recognized answer patterns
- The extension adds visual feedback so you know when it's active
- You can stop it at any time using the popup interface

## Files Description

- `manifest.json` - Extension configuration and permissions
- `content.js` - Main logic for page interaction
- `popup.html` - Extension popup interface
- `popup.js` - Popup functionality and controls
- `README.md` - This instruction file

## Browser Compatibility

- Google Chrome (recommended)
- Chromium-based browsers (Edge, Brave, etc.)

## Legal Notice

This extension is for educational and productivity purposes. Please ensure compliance with your organization's policies regarding automated tools. 