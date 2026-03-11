// popup.js - Extension popup logic

document.addEventListener('DOMContentLoaded', async () => {
  await updateStats();

  // Group all tabs
  document.getElementById('groupAll').addEventListener('click', async () => {
    const btn = document.getElementById('groupAll');
    btn.textContent = '⏳ Grouping...';
    btn.disabled = true;
    
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.sendMessage(tab.id, { action: 'groupAll' });
      await updateStats();
    } catch (error) {
      console.error('Group all failed:', error);
    }
    
    btn.innerHTML = '<span class="icon">🔀</span> Group All Tabs';
    btn.disabled = false;
  });

  // Group current window
  document.getElementById('groupCurrent').addEventListener('click', async () => {
    const btn = document.getElementById('groupCurrent');
    btn.textContent = '⏳ Grouping...';
    btn.disabled = true;
    
    try {
      await chrome.runtime.sendMessage({ action: 'groupCurrentWindow' });
      await updateStats();
    } catch (error) {
      console.error('Group current window failed:', error);
    }
    
    btn.innerHTML = '<span class="icon">📌</span> Group Current Window';
    btn.disabled = false;
  });

  // Ungroup all
  document.getElementById('ungroupAll').addEventListener('click', async () => {
    try {
      await chrome.runtime.sendMessage({ action: 'ungroupAll' });
      await updateStats();
    } catch (error) {
      console.error('Ungroup failed:', error);
    }
  });

  // Settings
  document.getElementById('settings').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
});

async function updateStats() {
  const tabs = await chrome.tabs.query({});
  const groups = await chrome.tabGroups.query({});
  
  document.getElementById('tabCount').textContent = tabs.length;
  document.getElementById('groupCount').textContent = groups.length;
}