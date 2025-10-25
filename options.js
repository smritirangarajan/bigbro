document.addEventListener('DOMContentLoaded', async () => {
  const startBtn = document.getElementById('start-recording-btn');
  const stopBtn = document.getElementById('stop-recording-btn');
  const statusBadge = document.getElementById('status-badge');
  const statsDisplay = document.getElementById('stats-display');

  let isRecording = false;

  // Load current status
  async function loadStatus() {
    const { isRecording: recording } = await chrome.storage.local.get(['isRecording']);
    if (recording) {
      isRecording = true;
      updateUI();
    }
  }

  function updateUI() {
    if (isRecording) {
      statusBadge.textContent = 'Recording';
      statusBadge.className = 'status-badge recording';
      startBtn.style.display = 'none';
      stopBtn.style.display = 'inline-block';
    } else {
      statusBadge.textContent = 'Not Recording';
      statusBadge.className = 'status-badge stopped';
      startBtn.style.display = 'inline-block';
      stopBtn.style.display = 'none';
    }
  }

  // Start recording
  startBtn.addEventListener('click', async () => {
    try {
      // Request screen recording
      const streamId = await new Promise((resolve, reject) => {
        chrome.desktopCapture.chooseDesktopMedia(
          ['screen', 'window'],
          (streamId) => {
            if (streamId) {
              resolve(streamId);
            } else {
              reject(new Error('User cancelled screen capture'));
            }
          }
        );
      });

      // Save stream ID
      await chrome.storage.local.set({
        isRecording: true,
        streamId: streamId,
        recordingStartTime: Date.now()
      });

      isRecording = true;
      updateUI();

      // Notify background script
      chrome.runtime.sendMessage({
        action: 'startRecording',
        streamId: streamId
      });

      updateStats();
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Could not start recording. Make sure you select a screen or window.');
    }
  });

  // Stop recording
  stopBtn.addEventListener('click', async () => {
    await chrome.storage.local.set({ isRecording: false });
    isRecording = false;
    updateUI();

    // Notify background script
    chrome.runtime.sendMessage({ action: 'stopRecording' });

    updateStats();
  });

  async function updateStats() {
    const { recordingStartTime, visualChecks } = await chrome.storage.local.get([
      'recordingStartTime',
      'visualChecks'
    ]);

    if (recordingStartTime) {
      const duration = Math.floor((Date.now() - recordingStartTime) / 1000);
      const minutes = Math.floor(duration / 60);
      const seconds = duration % 60;
      
      statsDisplay.innerHTML = `
        <p><strong>Recording Duration:</strong> ${minutes}m ${seconds}s</p>
        <p><strong>Visual Checks:</strong> ${visualChecks || 0}</p>
      `;
    }
  }

  await loadStatus();
  updateUI();
  updateStats();

  // Update stats every second
  setInterval(updateStats, 1000);
});
