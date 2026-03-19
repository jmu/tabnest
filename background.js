// background.js - Service worker

// Timeline tracking: store tab creation times (for tabs that haven't been activated yet)
const tabTimeline = new Map(); // tabId -> { createdAt, url, windowId, title }
let timelineLoaded = false;

// Load timeline data from storage on startup
async function loadTimelineFromStorage() {
  if (timelineLoaded) return;
  
  try {
    const result = await chrome.storage.local.get('tabTimeline');
    if (result.tabTimeline) {
      const entries = Object.entries(result.tabTimeline);
      for (const [tabId, data] of entries) {
        tabTimeline.set(parseInt(tabId), data);
      }
      console.log(`Loaded ${tabTimeline.size} timeline entries from storage`);
    }
  } catch (error) {
    console.error('Failed to load timeline from storage:', error);
  }
  timelineLoaded = true;
}

// Save timeline data to storage
async function saveTimelineToStorage() {
  try {
    const obj = {};
    for (const [tabId, data] of tabTimeline) {
      obj[tabId] = data;
    }
    await chrome.storage.local.set({ tabTimeline: obj });
  } catch (error) {
    console.error('Failed to save timeline to storage:', error);
  }
}

// Initialize on startup
loadTimelineFromStorage();

// Get tab creation time using native API (Chrome 121+) or fallback
function getTabCreatedAt(tab) {
  // Chrome 121+ provides lastAccessed (last time tab became active)
  // For a newly created tab that was immediately active, this ≈ creation time
  if (tab.lastAccessed && tab.lastAccessed > 0) {
    return tab.lastAccessed;
  }
  
  // Fallback: check our manual tracking
  const entry = tabTimeline.get(tab.id);
  if (entry && entry.createdAt) {
    return entry.createdAt;
  }
  
  // Last resort: use current time
  return Date.now();
}

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Received message:', message.action);
  
  (async () => {
    try {
      await loadTimelineFromStorage();
      
      if (message.action === 'groupAll') {
        await groupAllWindows();
        sendResponse({ success: true });
      } else if (message.action === 'groupCurrentWindow') {
        await groupCurrentWindow();
        sendResponse({ success: true });
      } else if (message.action === 'groupTimeline') {
        await groupByTimeline(message.windowId === 'all' ? null : message.windowId);
        sendResponse({ success: true });
      } else if (message.action === 'ungroupAll') {
        await ungroupAll();
        sendResponse({ success: true });
      } else if (message.action === 'debugTimeline') {
        const tabs = await chrome.tabs.query({});
        const data = tabs.map(t => ({
          id: t.id,
          url: t.url,
          lastAccessed: t.lastAccessed,
          lastAccessedStr: t.lastAccessed ? new Date(t.lastAccessed).toLocaleString() : 'N/A',
          tracked: tabTimeline.get(t.id)?.createdAt
        }));
        sendResponse({ success: true, tabs: data, tracked: tabTimeline.size });
      } else {
        sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Action failed:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  
  return true;
});

// Track pending auto-group to avoid duplicates
let pendingAutoGroup = null;

// Track tab creation for timeline grouping (fallback for tabs never activated)
chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id && tab.windowId) {
    // Only track if not already tracked (lastAccessed might be set)
    if (!tabTimeline.has(tab.id)) {
      const entry = {
        createdAt: Date.now(),
        url: tab.url || tab.pendingUrl || '',
        windowId: tab.windowId,
        title: tab.title || ''
      };
      tabTimeline.set(tab.id, entry);
      saveTimelineToStorage();
      console.log(`Tab ${tab.id} created at ${new Date(entry.createdAt).toLocaleString()}`);
    }
  }
});

// Update timeline when tab URL changes
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Update URL in timeline
  if (changeInfo.url && tabTimeline.has(tabId)) {
    const entry = tabTimeline.get(tabId);
    entry.url = changeInfo.url;
    saveTimelineToStorage();
  }
  
  // Update title
  if (changeInfo.title && tabTimeline.has(tabId)) {
    const entry = tabTimeline.get(tabId);
    entry.title = changeInfo.title;
    saveTimelineToStorage();
  }
  
  // Auto-group when tab is loaded
  if (changeInfo.status === 'complete' && tab.url) {
    const settings = await getSettings();
    if (settings.autoGroup) {
      clearTimeout(pendingAutoGroup);
      pendingAutoGroup = setTimeout(() => autoGroupTab(tab), 500);
    }
  }
});

// Clean up timeline when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabTimeline.has(tabId)) {
    tabTimeline.delete(tabId);
    saveTimelineToStorage();
    console.log(`Tab ${tabId} removed from timeline`);
  }
});

// ==================== Core Grouping Logic ====================

async function groupCurrentWindow() {
  console.log('Grouping current window...');
  const tabs = await chrome.tabs.query({ currentWindow: true });
  console.log(`Found ${tabs.length} tabs in current window`);
  
  await ungroupTabs(tabs);
  const groups = await analyzeAndGroup(tabs);
  await createGroups(groups);
}

async function groupAllWindows() {
  console.log('Grouping all windows...');
  
  const allTabs = await chrome.tabs.query({});
  const windowTabs = {};
  
  for (const tab of allTabs) {
    if (!windowTabs[tab.windowId]) {
      windowTabs[tab.windowId] = [];
    }
    windowTabs[tab.windowId].push(tab);
  }
  
  console.log(`Found ${allTabs.length} tabs in ${Object.keys(windowTabs).length} windows`);
  
  for (const [windowId, tabs] of Object.entries(windowTabs)) {
    console.log(`Processing window ${windowId} with ${tabs.length} tabs`);
    await ungroupTabs(tabs);
    const groups = await analyzeAndGroup(tabs);
    await createGroups(groups);
  }
}

// ==================== Timeline Grouping ====================

async function groupByTimeline(targetWindowId) {
  console.log('Grouping by timeline...', targetWindowId ? `window ${targetWindowId}` : 'all windows');
  
  const settings = await getSettings();
  const timeThresholdMs = (settings.timelineThreshold || 5) * 60 * 1000; // Default 5 minutes
  
  // Get tabs to group
  let tabs;
  if (targetWindowId) {
    tabs = await chrome.tabs.query({ windowId: targetWindowId });
  } else {
    tabs = await chrome.tabs.query({});
  }
  
  // Filter valid tabs and get creation time using native API
  const validTabs = [];
  
  for (const tab of tabs) {
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      continue;
    }
    
    const createdAt = getTabCreatedAt(tab);
    validTabs.push({
      ...tab,
      createdAt: createdAt
    });
    
    console.log(`Tab ${tab.id}: lastAccessed=${tab.lastAccessed}, createdAt=${new Date(createdAt).toLocaleString()}`);
  }
  
  console.log(`Found ${validTabs.length} valid tabs for timeline grouping`);
  
  if (validTabs.length === 0) {
    console.log('No valid tabs available for timeline grouping');
    return;
  }
  
  // Sort by creation time (earliest first)
  validTabs.sort((a, b) => a.createdAt - b.createdAt);
  
  // Group by date first, then by time within each date
  const dateGroups = new Map();
  
  for (const tab of validTabs) {
    const dateKey = new Date(tab.createdAt).toDateString();
    if (!dateGroups.has(dateKey)) {
      dateGroups.set(dateKey, []);
    }
    dateGroups.get(dateKey).push(tab);
  }
  
  console.log(`Found ${dateGroups.size} different dates`);
  
  // Group within each date by time threshold
  const timeGroups = [];
  
  for (const [dateKey, dateTabs] of dateGroups) {
    dateTabs.sort((a, b) => a.createdAt - b.createdAt);
    
    let currentGroup = [dateTabs[0]];
    let groupStartTime = dateTabs[0].createdAt;
    
    for (let i = 1; i < dateTabs.length; i++) {
      const tab = dateTabs[i];
      const prevTab = dateTabs[i - 1];
      const timeDiff = tab.createdAt - prevTab.createdAt;
      
      if (timeDiff <= timeThresholdMs) {
        currentGroup.push(tab);
      } else {
        if (currentGroup.length >= 1) {
          timeGroups.push({
            tabs: currentGroup,
            startTime: groupStartTime,
            endTime: dateTabs[i - 1].createdAt
          });
        }
        currentGroup = [tab];
        groupStartTime = tab.createdAt;
      }
    }
    
    if (currentGroup.length >= 1) {
      timeGroups.push({
        tabs: currentGroup,
        startTime: groupStartTime,
        endTime: currentGroup[currentGroup.length - 1].createdAt
      });
    }
  }
  
  console.log(`Created ${timeGroups.length} time groups across ${dateGroups.size} dates`);
  
  // Ungroup all first
  await ungroupTabs(tabs);
  
  // Create Chrome tab groups (process in reverse order so later groups end up on the right)
  const sortedGroups = [...timeGroups].sort((a, b) => b.startTime - a.startTime);
  
  for (const group of sortedGroups) {
    if (group.tabs.length >= 2) {
      const sortedTabs = [...group.tabs].sort((a, b) => a.createdAt - b.createdAt);
      const tabIds = sortedTabs.map(t => t.id);
      const title = formatTimeRange(group.startTime, group.endTime);
      
      try {
        const groupId = await chrome.tabs.group({ tabIds });
        await chrome.tabGroups.update(groupId, {
          title: title,
          color: getGroupColor(title)
        });
        console.log(`Created timeline group: ${title} with ${tabIds.length} tabs`);
      } catch (error) {
        console.error(`Failed to create timeline group: ${error.message}`);
      }
    }
  }
}

function formatTimeRange(startTime, endTime) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const now = new Date();
  
  const isToday = start.toDateString() === now.toDateString();
  
  if (isToday) {
    const formatTime = (date) => {
      return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      });
    };
    return `${formatTime(start)}-${formatTime(end)}`;
  } else {
    const month = start.getMonth() + 1;
    const day = start.getDate();
    return `${month}/${day}`;
  }
}

// ==================== Helpers ====================

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
  
  if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
    return;
  }
  
  try {
    const settings = await getSettings();
    const groupKey = await getGroupKey(tab, settings);
    
    const existingGroups = await chrome.tabGroups.query({ windowId: tab.windowId });
    const matchingGroup = existingGroups.find(g => g.title === groupKey || g.title?.includes(groupKey));
    
    if (matchingGroup) {
      await chrome.tabs.group({ tabIds: tab.id, groupId: matchingGroup.id });
      console.log(`Added tab to existing group: ${groupKey}`);
    } else {
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
  
  if (settings.useUrlHierarchy && urlInfo.pathSegments.length > 1) {
    if (isCodeHostingSite(urlInfo.domain)) {
      const projectPath = urlInfo.pathSegments.slice(0, 2).join('/');
      return `${urlInfo.domain}/${projectPath}`;
    }
    
    if (isDocsSite(urlInfo.domain)) {
      return `${urlInfo.domain}/${urlInfo.pathSegments[0]}`;
    }
  }
  
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

// ==================== Color Helpers ====================

const GROUP_COLORS = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];

function getGroupColor(groupKey) {
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

// ==================== Settings ====================

async function getSettings() {
  const result = await chrome.storage.sync.get({
    useUrlHierarchy: true,
    useContentAnalysis: false,
    autoGroup: false,
    timelineThreshold: 5,
    llmEnabled: false,
    llmApiKey: '',
    llmApiUrl: 'https://api.openai.com/v1/chat/completions',
    llmModel: 'gpt-4o-mini'
  });
  return result;
}