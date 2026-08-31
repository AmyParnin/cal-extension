# Smart Calendar Chrome Extension

A Chrome extension that lets you create Google Calendar events by:
- **Selecting text** on any webpage → right-click → "Create Calendar event"
- **Clicking the extension icon** → describe the event in plain English → AI fills in the details

## Project structure

```
cal-extension/
├── manifest.json        # Extension config (permissions, files, OAuth)
├── icons/               # Extension icons (16, 48, 128px)
└── src/
    ├── background.js    # Service worker: context menu, auth, Calendar API calls
    ├── content.js       # Injected into pages: shows the event preview bubble
    ├── popup.html       # The popup UI when you click the extension icon
    └── popup.js         # Popup logic: AI parse + create event
```

## How to load the extension in Chrome (for local testing)

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top right)
3. Click **Load unpacked**
4. Select the `cal-extension/` folder

After any code change, click the ↺ refresh button on the extension card to reload.

## Key concepts

**Manifest V3** — the current Chrome extension standard. Key differences from older extensions:
- Background scripts are now *service workers* (no persistent state, no DOM)
- Stricter content security policy (no inline scripts in HTML files)
- `host_permissions` are separate from `permissions`

**Message passing** — the three parts of an extension (background, content script, popup) can't share memory. They communicate by sending messages:
```js
// From popup or content script → background
chrome.runtime.sendMessage({ type: "CREATE_EVENT", event: {...} }, (response) => { ... });

// Background listens
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => { ... });
```

**OAuth / Google Sign-in** — the extension uses `chrome.identity.getAuthToken()` to get a Google OAuth token. This requires:
1. A Google Cloud project with the Calendar API enabled
2. An OAuth 2.0 Client ID configured for a Chrome extension
3. The client ID added to `manifest.json` under `oauth2.client_id`

## Before the extension works end-to-end

You need to set up a Google Cloud project:
1. Go to https://console.cloud.google.com
2. Create a new project (e.g. "Smart Calendar Extension")
3. Enable the **Google Calendar API** (APIs & Services → Library)
4. Create an **OAuth 2.0 Client ID** (APIs & Services → Credentials → Create Credentials)
   - Application type: **Chrome extension**
   - Extension ID: find it on `chrome://extensions` after loading unpacked
5. Copy the Client ID into `manifest.json` → `oauth2.client_id`

## Using Claude Code to build this

[Claude Code](https://docs.anthropic.com/en/docs/claude-code) is a terminal tool that lets you ask Claude to read, write, and edit your project files. It's the best way to iterate on this extension.

### Install Claude Code
```bash
npm install -g @anthropic/claude-code
```

### Open this project in Claude Code
```bash
cd path/to/cal-extension
claude
```

### Example prompts to use with Claude Code

**Adding real AI parsing:**
```
Replace the heuristic parseEventFromText() in background.js with a real call 
to the Claude API. The function should take raw text and return a structured 
calendar event object with summary, start, end, location, and description fields.
Use the Anthropic SDK and store the API key in chrome.storage.local.
```

**Improving the popup UI:**
```
Redesign the popup UI in popup.html and popup.js to look more polished — 
add a duration picker with common options (30 min, 1 hr, 2 hrs), show a 
preview of the parsed event before creating it, and add a loading spinner.
```

**Adding event suggestions from the page:**
```
When the popup opens, have content.js send the current page title and 
meta description to the background, then suggest a default event title 
and description based on that context.
```

**Handling errors better:**
```
Add proper error handling for when the user hasn't granted calendar 
permissions yet. Show a clear "Sign in with Google" step in the popup 
instead of silently failing.
```

**Preparing for the Chrome Web Store:**
```
Review the extension for Chrome Web Store policy compliance. Check for:
- required privacy policy
- permissions justification
- no remotely hosted code
- proper use of the minimum necessary permissions
```

## Chrome Web Store checklist (when you're ready to publish)

- [ ] Replace placeholder icons with real designed icons
- [ ] Write a privacy policy (required if you use OAuth)
- [ ] Add a `homepage_url` and support URL to manifest.json
- [ ] Test on multiple websites and Chrome versions
- [ ] Create promotional screenshots (1280×800 or 640×400)
- [ ] Pay the one-time $5 developer registration fee
- [ ] Submit for review (usually takes 1–3 business days)

## Useful docs

- Chrome Extension docs: https://developer.chrome.com/docs/extensions
- Google Calendar API: https://developers.google.com/calendar/api/v3/reference
- Manifest V3 migration: https://developer.chrome.com/docs/extensions/mv3/intro
- Claude API docs: https://docs.anthropic.com
