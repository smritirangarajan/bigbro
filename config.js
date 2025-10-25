// Configuration for API keys
// In production, these should be stored securely in chrome.storage
// For development, they're hardcoded here

const CONFIG = {
  CLAUDE_API_KEY: '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',
  GEMINI_API_KEY: 'AIzaSyAyL9mtisO5d6eFS0j260rsZaxfbYavWSE',
  LETTA_API_KEY: 'sk-let-OTY4NzFmYjQtYTRkNi00ODEwLTg3ZTktMjA3YzIxYjkwODY2OmEwN2MwZjFmLTczY2UtNGE3Zi05MDYyLTQ2YTRlMmVlZTZmMg==',
  LETTA_PROJECT: '0504569d-4b34-4dc1-92ad-deec931ff616',
  LETTA_AGENT_ID: 'agent-90ee73f6-e688-470d-977a-7f0e8f31c783'
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}
