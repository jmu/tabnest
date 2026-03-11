// popup.js - Extension popup logic

document.addEventListener('DOMContentLoaded', async () => {
  await updateStats();

  // Group all tabs (all windows)
  document.getElementById('groupAll').addEventListener('click', async () => {
    const btn = document.getElementById('groupAll');
    const originalContent = btn.innerHTML;
    btn.innerHTML = '<span class="icon">⏳</span> Grouping...';
    btn.disabled = true;
    
    try {
      const response = await chrome.runtime.sendMessage({ action: 'groupAll' });
      if (response && !response.success) {
        alert('Error: ' + (response.error || 'Unknown error'));
      }
      await updateStats();
    } catch (error) {
      console.error('Group all failed:', error);
      alert('Error: ' + error.message);
    }
    
    btn.innerHTML = originalContent;
    btn.disabled = false;
  });

  // Group current window only
  document.getElementById('groupCurrent').addEventListener('click', async () => {
    const btn = document.getElementById('groupCurrent');
    const originalContent = btn.innerHTML;
    btn.innerHTML = '<span class="icon">⏳</span> Grouping...';
    btn.disabled = true;
    
    try {
      const response = await chrome.runtime.sendMessage({ action: 'groupCurrentWindow' });
      if (response && !response.success) {
        alert('Error: ' + (response.error || 'Unknown error'));
      }
      await updateStats();
    } catch (error) {
      console.error('Group current window failed:', error);
      alert('Error: ' + error.message);
    }
    
    btn.innerHTML = originalContent;
    btn.disabled = false;
  });

  // Ungroup all
  document.getElementById('ungroupAll').addEventListener('click', async () => {
    const btn = document.getElementById('ungroupAll');
    const originalContent = btn.innerHTML;
    btn.innerHTML = '<span class="icon">⏳</span> Ungrouping...';
    btn.disabled = true;
    
    try {
      const response = await chrome.runtime.sendMessage({ action: 'ungroupAll' });
      if (response && !response.success) {
        alert('Error: ' + (response.error || 'Unknown error'));
      }
      await updateStats();
    } catch (error) {
      console.error('Ungroup failed:', error);
      alert('Error: ' + error.message);
    }
    
    btn.innerHTML = originalContent;
    btn.disabled = false;
  });

  // Settings
  document.getElementById('settings').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
});

async function updateStats() {
  try {
    const tabs = await chrome.tabs.query({});
    const groups = await chrome.tabGroups.query({});
    
    document.getElementById('tabCount').textContent = tabs.length;
    document.getElementById('groupCount').textContent = groups.length;
  } catch (error) {
    console.error('Update stats failed:', error);
  }
}