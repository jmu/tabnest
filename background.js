// background.js - Service worker

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Received message:', message.action);
  
  (async () => {
    try {
      if (message.action === 'groupAll') {
        await groupAllWindows();
        sendResponse({ success: true });
      } else if (message.action === 'groupCurrentWindow') {
        await groupCurrentWindow();
        sendResponse({ success: true });
      } else if (message.action === 'ungroupAll') {
        await ungroupAll();
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Action failed:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  
  return true; // Keep message channel open for async response
});

// Track pending auto-group to avoid duplicates
let pendingAutoGroup = null;

// Auto-group when tab is updated (loaded)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const settings = await getSettings();
    if (settings.autoGroup) {
      // Debounce rapid updates
      clearTimeout(pendingAutoGroup);
      pendingAutoGroup = setTimeout(() => autoGroupTab(tab), 500);
    }
  }
});

// ==================== Core Grouping Logic ====================

async function groupCurrentWindow() {
  console.log('Grouping current window...');
  const tabs = await chrome.tabs.query({ currentWindow: true });
  console.log(`Found ${tabs.length} tabs in current window`);
  
  // First ungroup all tabs
  await ungroupTabs(tabs);
  
  const groups = await analyzeAndGroup(tabs);
  await createGroups(groups);
}

async function groupAllWindows() {
  console.log('Grouping all windows...');
  
  // Get all tabs grouped by window
  const allTabs = await chrome.tabs.query({});
  const windowTabs = {};
  
  for (const tab of allTabs) {
    if (!windowTabs[tab.windowId]) {
      windowTabs[tab.windowId] = [];
    }
    windowTabs[tab.windowId].push(tab);
  }
  
  console.log(`Found ${allTabs.length} tabs in ${Object.keys(windowTabs).length} windows`);
  
  // Group each window separately (Chrome groups must be in same window)
  for (const [windowId, tabs] of Object.entries(windowTabs)) {
    console.log(`Processing window ${windowId} with ${tabs.length} tabs`);
    
    // First ungroup tabs in this window
    await ungroupTabs(tabs);
    
    const groups = await analyzeAndGroup(tabs);
    await createGroups(groups);
  }
}

async function ungroupTabs(tabs) {
  for (const tab of tabs) {
    if (tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
      try {
        await chrome.tabs.ungroup(tab.id);
      } catch (error) {
        console.error(`Failed to ungroup tab ${tab.id}:`, error);
      }
    }
  }
}

async function createGroups(groups) {
  for (const [groupKey, tabIds] of Object.entries(groups)) {
    if (tabIds.length > 1) {
      try {
        const groupId = await chrome.tabs.group({ tabIds });
        await chrome.tabGroups.update(groupId, {
          title: truncateTitle(groupKey, 25),
          color: getGroupColor(groupKey)
        });
        console.log(`Created group: ${groupKey} with ${tabIds.length} tabs`);
      } catch (error) {
        console.error(`Failed to create group ${groupKey}:`, error);
      }
    }
  }
}

async function ungroupAll() {
  console.log('Ungrouping all tabs...');
  const tabs = await chrome.tabs.query({});
  await ungroupTabs(tabs);
}

async function autoGroupTab(tab) {
  if (!tab.id || !tab.url) return;
  
  // Skip chrome:// and extension pages
  if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
    return;
  }
  
  try {
    const settings = await getSettings();
    const groupKey = await getGroupKey(tab, settings);
    
    // Find existing group with same key in same window
    const existingGroups = await chrome.tabGroups.query({ windowId: tab.windowId });
    const matchingGroup = existingGroups.find(g => g.title === groupKey || g.title?.includes(groupKey));
    
    if (matchingGroup) {
      // Add to existing group
      await chrome.tabs.group({ tabIds: tab.id, groupId: matchingGroup.id });
      console.log(`Added tab to existing group: ${groupKey}`);
    } else {
      // Check if there are other tabs with same key to create a new group
      const otherTabs = await chrome.tabs.query({ windowId: tab.windowId });
      const similarTabs = [];
      
      for (const otherTab of otherTabs) {
        if (otherTab.id !== tab.id && otherTab.url) {
          const otherKey = await getGroupKey(otherTab, settings);
          if (otherKey === groupKey) {
            similarTabs.push(otherTab.id);
          }
        }
      }
      
      if (similarTabs.length > 0) {
        // Create new group with similar tabs
        const allTabIds = [tab.id, ...similarTabs];
        const groupId = await chrome.tabs.group({ tabIds: allTabIds });
        await chrome.tabGroups.update(groupId, {
          title: truncateTitle(groupKey, 25),
          color: getGroupColor(groupKey)
        });
        console.log(`Created new group: ${groupKey} with ${allTabIds.length} tabs`);
      }
    }
  } catch (error) {
    console.error('Auto-group failed:', error);
  }
}

// ==================== Analysis Engine ====================

async function analyzeAndGroup(tabs) {
  const groups = {};
  const settings = await getSettings();
  
  for (const tab of tabs) {
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      continue;
    }
    
    const groupKey = await getGroupKey(tab, settings);
    
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(tab.id);
  }
  
  return groups;
}

async function getGroupKey(tab, settings) {
  const urlInfo = parseUrl(tab.url);
  
  // Strategy 1: Domain + Path Level (e.g., github.com/owner/repo)
  if (settings.useUrlHierarchy && urlInfo.pathSegments.length > 1) {
    // For GitHub, GitLab, etc. - group by owner/repo
    if (isCodeHostingSite(urlInfo.domain)) {
      const projectPath = urlInfo.pathSegments.slice(0, 2).join('/');
      return `${urlInfo.domain}/${projectPath}`;
    }
    
    // For docs sites - group by first path segment
    if (isDocsSite(urlInfo.domain)) {
      return `${urlInfo.domain}/${urlInfo.pathSegments[0]}`;
    }
  }
  
  // Strategy 2: Domain only
  return urlInfo.domain;
}

// ==================== URL Parsing ====================

function parseUrl(url) {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    const pathSegments = urlObj.pathname
      .split('/')
      .filter(s => s.length > 0);
    
    return { domain, pathSegments, fullUrl: url };
  } catch {
    return { domain: 'unknown', pathSegments: [], fullUrl: url };
  }
}

function isCodeHostingSite(domain) {
  const codeSites = [
    'github.com',
    'gitlab.com',
    'bitbucket.org',
    'gitee.com',
    'codeberg.org'
  ];
  return codeSites.includes(domain);
}

function isDocsSite(domain) {
  // Exact match or subdomain match
  const docsSites = [
    'docs.google.com',
    'notion.so',
    'atlassian.net',
    'atlassian.com',
    'readthedocs.io',
    'docs.python.org',
    'developer.mozilla.org',
    'react.dev',
    'vuejs.org',
    'tailwindcss.com'
  ];
  return docsSites.some(d => domain === d || domain.endsWith('.' + d));
}

// ==================== Helpers ====================

const GROUP_COLORS = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];

function getGroupColor(groupKey) {
  // Generate consistent color based on group key
  let hash = 0;
  for (let i = 0; i < groupKey.length; i++) {
    hash = groupKey.charCodeAt(i) + ((hash << 5) - hash);
  }
  return GROUP_COLORS[Math.abs(hash) % GROUP_COLORS.length];
}

function truncateTitle(title, maxLength) {
  if (title.length <= maxLength) return title;
  return title.substring(0, maxLength - 2) + '..';
}

async function getSettings() {
  const result = await chrome.storage.sync.get({
    useUrlHierarchy: true,
    useContentAnalysis: false,
    autoGroup: false,
    llmEnabled: false,
    llmApiKey: '',
    llmApiUrl: 'https://api.openai.com/v1/chat/completions',
    llmModel: 'gpt-4o-mini'
  });
  return result;
}