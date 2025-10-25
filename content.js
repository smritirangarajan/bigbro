// Content script placeholder
// This can be used for future enhancements like page analysis
console.log('Productivity Task Monitor loaded');

// Listen for strike alerts from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'showStrikeAlert') {
    const alertMessage = `⚠️ STRIKE ADDED!\n\nYou're not on a productive website.\n\nYou've been on ${message.hostname} for 30+ seconds.\n\nTotal strikes: ${message.strikes}`;
    alert(alertMessage);
    sendResponse({ success: true });
  }
  return true;
});
