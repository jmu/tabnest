// timeline-utils.js - Core logic for timeline grouping (extracted for testing)

/**
 * Format time range for group title
 * - Today: show time range like "09:00-09:05"
 * - Not today: show date like "3/12"
 */
export function formatTimeRange(startTime, endTime, now = Date.now()) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const nowDate = new Date(now);
  
  // Check if it's today
  const isToday = start.toDateString() === nowDate.toDateString();
  
  if (isToday) {
    // Today: show time range like "09:00-09:05"
    const formatTime = (date) => {
      return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      });
    };
    return `${formatTime(start)}-${formatTime(end)}`;
  } else {
    // Not today: show date like "3/12"
    const formatDate = (date) => {
      const month = date.getMonth() + 1;
      const day = date.getDate();
      return `${month}/${day}`;
    };
    return formatDate(start);
  }
}

/**
 * Group tabs by timeline
 * - First group by date
 * - Then within each date, group by time threshold
 * - Different dates are NEVER in the same group
 * 
 * @param {Array} tabs - Array of {id, createdAt} objects
 * @param {number} timeThresholdMs - Time threshold in milliseconds
 * @returns {Array} Array of {tabs, startTime, endTime} groups
 */
export function groupByTimeline(tabs, timeThresholdMs = 5 * 60 * 1000) {
  if (tabs.length === 0) return [];
  
  // Sort by creation time (earliest first)
  const sortedTabs = [...tabs].sort((a, b) => a.createdAt - b.createdAt);
  
  // Group by date first
  const dateGroups = new Map(); // date string -> array of tabs
  
  for (const tab of sortedTabs) {
    const dateKey = new Date(tab.createdAt).toDateString();
    if (!dateGroups.has(dateKey)) {
      dateGroups.set(dateKey, []);
    }
    dateGroups.get(dateKey).push(tab);
  }
  
  // Now group within each date by time threshold
  const timeGroups = [];
  
  for (const [dateKey, dateTabs] of dateGroups) {
    // Sort tabs within this date by time
    dateTabs.sort((a, b) => a.createdAt - b.createdAt);
    
    let currentGroup = [dateTabs[0]];
    let groupStartTime = dateTabs[0].createdAt;
    
    for (let i = 1; i < dateTabs.length; i++) {
      const tab = dateTabs[i];
      const prevTab = dateTabs[i - 1];
      const timeDiff = tab.createdAt - prevTab.createdAt;
      
      if (timeDiff <= timeThresholdMs) {
        // Same time window
        currentGroup.push(tab);
      } else {
        // New time window
        timeGroups.push({
          tabs: currentGroup,
          startTime: groupStartTime,
          endTime: dateTabs[i - 1].createdAt
        });
        currentGroup = [tab];
        groupStartTime = tab.createdAt;
      }
    }
    
    // Don't forget the last group for this date
    timeGroups.push({
      tabs: currentGroup,
      startTime: groupStartTime,
      endTime: currentGroup[currentGroup.length - 1].createdAt
    });
  }
  
  return timeGroups;
}

/**
 * Get group color based on group key
 */
export const GROUP_COLORS = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];

export function getGroupColor(groupKey) {
  let hash = 0;
  for (let i = 0; i < groupKey.length; i++) {
    hash = groupKey.charCodeAt(i) + ((hash << 5) - hash);
  }
  return GROUP_COLORS[Math.abs(hash) % GROUP_COLORS.length];
}