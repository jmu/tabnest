// background.js - Service worker

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'groupCurrentWindow') {
    groupCurrentWindow();
  } else if (message.action === 'ungroupAll') {
    ungroupAll();
  }
});

// Auto-group when new tab is created (optional, can be toggled in settings)
chrome.tabs.onCreated.addListener(async (tab) => {
  const settings = await getSettings();
  if (settings.autoGroup) {
    // Debounce - wait a bit before grouping
    setTimeout(() => autoGroupTab(tab), 1000);
  }
});

// ==================== Core Grouping Logic ====================

async function groupCurrentWindow() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const groups = await analyzeAndGroup(tabs);
  
  for (const [groupKey, tabIds] of Object.entries(groups)) {
    if (tabIds.length > 1) {
      const groupId = await chrome.tabs.group({ tabIds });
      await chrome.tabGroups.update(groupId, {
        title: groupKey,
        color: getGroupColor(groupKey)
      });
    }
  }
}

async function groupAllWindows() {
  const tabs = await chrome.tabs.query({});
  const groups = await analyzeAndGroup(tabs);
  
  for (const [groupKey, tabIds] of Object.entries(groups)) {
    if (tabIds.length > 1) {
      const groupId = await chrome.tabs.group({ tabIds });
      await chrome.tabGroups.update(groupId, {
        title: groupKey,
        color: getGroupColor(groupKey)
      });
    }
  }
}

async function ungroupAll() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
      await chrome.tabs.ungroup(tab.id);
    }
  }
}

async function autoGroupTab(tab) {
  if (!tab.id || !tab.url) return;
  
  const groupInfo = await analyzeTab(tab);
  if (!groupInfo) return;
  
  // Find existing group with same key
  const existingGroups = await chrome.tabGroups.query({ windowId: tab.windowId });
  const matchingGroup = existingGroups.find(g => g.title === groupInfo.key);
  
  if (matchingGroup) {
    await chrome.tabs.group({ tabIds: tab.id, groupId: matchingGroup.id });
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

async function analyzeTab(tab) {
  const settings = await getSettings();
  const key = await getGroupKey(tab, settings);
  return { key, tab };
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
    'confluence.atlassian.com',
    'readthedocs.io',
    'docs.python.org',
    'developer.mozilla.org'
  ];
  return docsSites.some(d => domain.includes(d));
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

async function saveSettings(settings) {
  await chrome.storage.sync.set(settings);
}