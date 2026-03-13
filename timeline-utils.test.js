// timeline-utils.test.js - Unit tests for timeline grouping

const { formatTimeRange, groupByTimeline, getGroupColor, GROUP_COLORS } = require('./timeline-utils');

describe('formatTimeRange', () => {
  test('should show time range for today', () => {
    const now = new Date('2026-03-13T10:00:00').getTime();
    const startTime = new Date('2026-03-13T09:00:00').getTime();
    const endTime = new Date('2026-03-13T09:05:00').getTime();
    
    const result = formatTimeRange(startTime, endTime, now);
    expect(result).toBe('09:00-09:05');
  });
  
  test('should show date for non-today', () => {
    const now = new Date('2026-03-13T10:00:00').getTime();
    const startTime = new Date('2026-03-12T09:00:00').getTime();
    const endTime = new Date('2026-03-12T09:05:00').getTime();
    
    const result = formatTimeRange(startTime, endTime, now);
    expect(result).toBe('3/12');
  });
  
  test('should show date for yesterday', () => {
    const now = new Date('2026-03-13T10:00:00').getTime();
    const startTime = new Date('2026-03-12T23:58:00').getTime();
    const endTime = new Date('2026-03-12T23:59:00').getTime();
    
    const result = formatTimeRange(startTime, endTime, now);
    expect(result).toBe('3/12');
  });
  
  test('should handle different months', () => {
    const now = new Date('2026-03-01T10:00:00').getTime();
    const startTime = new Date('2026-02-28T09:00:00').getTime();
    const endTime = new Date('2026-02-28T09:05:00').getTime();
    
    const result = formatTimeRange(startTime, endTime, now);
    expect(result).toBe('2/28');
  });
  
  test('should use default now parameter (Date.now())', () => {
    // Test without passing now parameter - uses Date.now() as default
    const today = new Date();
    const startTime = new Date(today);
    startTime.setHours(9, 0, 0, 0);
    const endTime = new Date(today);
    endTime.setHours(9, 5, 0, 0);
    
    const result = formatTimeRange(startTime.getTime(), endTime.getTime());
    // Should show time range since it's today
    expect(result).toMatch(/^\d{2}:\d{2}-\d{2}:\d{2}$/);
  });
});

describe('groupByTimeline', () => {
  // Helper to create timestamp
  const t = (dateStr) => new Date(dateStr).getTime();
  
  test('should return empty array for empty input', () => {
    const result = groupByTimeline([]);
    expect(result).toEqual([]);
  });
  
  test('should create single group for single tab', () => {
    const tabs = [{ id: 1, createdAt: t('2026-03-13T09:00:00') }];
    const result = groupByTimeline(tabs);
    
    expect(result.length).toBe(1);
    expect(result[0].tabs.length).toBe(1);
    expect(result[0].tabs[0].id).toBe(1);
  });
  
  test('should group tabs within time threshold', () => {
    const tabs = [
      { id: 1, createdAt: t('2026-03-13T09:00:00') },
      { id: 2, createdAt: t('2026-03-13T09:02:00') }, // 2 min gap
      { id: 3, createdAt: t('2026-03-13T09:04:00') }, // 2 min gap
    ];
    
    const result = groupByTimeline(tabs, 5 * 60 * 1000); // 5 min threshold
    
    expect(result.length).toBe(1);
    expect(result[0].tabs.length).toBe(3);
  });
  
  test('should split groups when time gap exceeds threshold', () => {
    const tabs = [
      { id: 1, createdAt: t('2026-03-13T09:00:00') },
      { id: 2, createdAt: t('2026-03-13T09:02:00') },
      { id: 3, createdAt: t('2026-03-13T09:20:00') }, // 18 min gap > 5 min
    ];
    
    const result = groupByTimeline(tabs, 5 * 60 * 1000);
    
    expect(result.length).toBe(2);
    expect(result[0].tabs.length).toBe(2);
    expect(result[0].tabs.map(t => t.id)).toEqual([1, 2]);
    expect(result[1].tabs.length).toBe(1);
    expect(result[1].tabs[0].id).toBe(3);
  });
  
  test('should NEVER group tabs from different dates together', () => {
    const tabs = [
      { id: 1, createdAt: t('2026-03-12T23:58:00') }, // Yesterday
      { id: 2, createdAt: t('2026-03-13T00:02:00') }, // Today (4 min gap)
    ];
    
    const result = groupByTimeline(tabs, 5 * 60 * 1000);
    
    // Should be 2 groups, even though time gap is only 4 minutes
    expect(result.length).toBe(2);
    expect(result[0].tabs.length).toBe(1);
    expect(result[0].tabs[0].id).toBe(1);
    expect(result[1].tabs.length).toBe(1);
    expect(result[1].tabs[0].id).toBe(2);
  });
  
  test('should handle multiple days', () => {
    const tabs = [
      { id: 1, createdAt: t('2026-03-10T09:00:00') },
      { id: 2, createdAt: t('2026-03-10T09:02:00') },
      { id: 3, createdAt: t('2026-03-11T10:00:00') },
      { id: 4, createdAt: t('2026-03-11T10:03:00') },
      { id: 5, createdAt: t('2026-03-13T11:00:00') },
    ];
    
    const result = groupByTimeline(tabs, 5 * 60 * 1000);
    
    // Should be 3 groups (one per date)
    expect(result.length).toBe(3);
    
    // Check each group has correct tabs
    const groupDates = result.map(g => new Date(g.startTime).toDateString());
    expect(groupDates).toContain('Tue Mar 10 2026');
    expect(groupDates).toContain('Wed Mar 11 2026');
    expect(groupDates).toContain('Fri Mar 13 2026');
  });
  
  test('should handle unsorted input', () => {
    const tabs = [
      { id: 3, createdAt: t('2026-03-13T09:10:00') },
      { id: 1, createdAt: t('2026-03-13T09:00:00') },
      { id: 2, createdAt: t('2026-03-13T09:02:00') },
    ];
    
    const result = groupByTimeline(tabs, 5 * 60 * 1000);
    
    // Should be 2 groups
    expect(result.length).toBe(2);
    
    // First group should have tabs 1 and 2 (sorted)
    expect(result[0].tabs.map(t => t.id)).toEqual([1, 2]);
    expect(result[1].tabs.map(t => t.id)).toEqual([3]);
  });
  
  test('should set correct startTime and endTime for groups', () => {
    const tabs = [
      { id: 1, createdAt: t('2026-03-13T09:00:00') },
      { id: 2, createdAt: t('2026-03-13T09:02:00') },
      { id: 3, createdAt: t('2026-03-13T09:04:00') },
    ];
    
    const result = groupByTimeline(tabs, 5 * 60 * 1000);
    
    expect(result[0].startTime).toBe(t('2026-03-13T09:00:00'));
    expect(result[0].endTime).toBe(t('2026-03-13T09:04:00'));
  });
  
  test('should handle midnight boundary correctly', () => {
    const tabs = [
      { id: 1, createdAt: t('2026-03-13T23:58:00') },
      { id: 2, createdAt: t('2026-03-14T00:02:00') }, // 4 min gap but different day
      { id: 3, createdAt: t('2026-03-14T00:04:00') }, // 2 min gap from tab 2
    ];
    
    const result = groupByTimeline(tabs, 5 * 60 * 1000);
    
    // Should be 2 groups
    expect(result.length).toBe(2);
    
    // First group: Mar 13
    expect(result[0].tabs.length).toBe(1);
    expect(result[0].tabs[0].id).toBe(1);
    
    // Second group: Mar 14
    expect(result[1].tabs.length).toBe(2);
    expect(result[1].tabs.map(t => t.id)).toEqual([2, 3]);
  });
  
  test('should handle large time threshold', () => {
    const tabs = [
      { id: 1, createdAt: t('2026-03-13T09:00:00') },
      { id: 2, createdAt: t('2026-03-13T09:30:00') }, // 30 min gap
    ];
    
    const result = groupByTimeline(tabs, 60 * 60 * 1000); // 1 hour threshold
    
    expect(result.length).toBe(1);
    expect(result[0].tabs.length).toBe(2);
  });
  
  test('should handle small time threshold', () => {
    const tabs = [
      { id: 1, createdAt: t('2026-03-13T09:00:00') },
      { id: 2, createdAt: t('2026-03-13T09:00:30') }, // 30 sec gap
      { id: 3, createdAt: t('2026-03-13T09:02:00') }, // 90 sec gap from tab 2
    ];
    
    const result = groupByTimeline(tabs, 60 * 1000); // 1 min threshold
    
    expect(result.length).toBe(2);
    expect(result[0].tabs.map(t => t.id)).toEqual([1, 2]);
    expect(result[1].tabs.map(t => t.id)).toEqual([3]);
  });
  
  test('should use default time threshold (5 minutes)', () => {
    // Test without passing timeThresholdMs - uses 5 min as default
    const tabs = [
      { id: 1, createdAt: t('2026-03-13T09:00:00') },
      { id: 2, createdAt: t('2026-03-13T09:03:00') }, // 3 min gap < 5 min
    ];
    
    const result = groupByTimeline(tabs); // No threshold passed
    
    expect(result.length).toBe(1);
    expect(result[0].tabs.length).toBe(2);
  });
});

describe('getGroupColor', () => {
  test('should return a valid color', () => {
    const color = getGroupColor('test');
    expect(GROUP_COLORS).toContain(color);
  });
  
  test('should return consistent color for same key', () => {
    const color1 = getGroupColor('github.com/user/repo');
    const color2 = getGroupColor('github.com/user/repo');
    expect(color1).toBe(color2);
  });
  
  test('should return different colors for different keys', () => {
    const colors = new Set();
    const keys = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
    
    for (const key of keys) {
      colors.add(getGroupColor(key));
    }
    
    // Should have some variety
    expect(colors.size).toBeGreaterThan(1);
  });
});

describe('Edge cases', () => {
  const t = (dateStr) => new Date(dateStr).getTime();
  
  test('should handle tabs with exact same timestamp', () => {
    const timestamp = t('2026-03-13T09:00:00');
    const tabs = [
      { id: 1, createdAt: timestamp },
      { id: 2, createdAt: timestamp },
      { id: 3, createdAt: timestamp },
    ];
    
    const result = groupByTimeline(tabs, 5 * 60 * 1000);
    
    expect(result.length).toBe(1);
    expect(result[0].tabs.length).toBe(3);
  });
  
  test('should handle single tab', () => {
    const tabs = [{ id: 1, createdAt: t('2026-03-13T09:00:00') }];
    const result = groupByTimeline(tabs);
    
    expect(result.length).toBe(1);
    expect(result[0].startTime).toBe(t('2026-03-13T09:00:00'));
    expect(result[0].endTime).toBe(t('2026-03-13T09:00:00'));
  });
  
  test('should handle year boundary', () => {
    const tabs = [
      { id: 1, createdAt: t('2025-12-31T23:58:00') },
      { id: 2, createdAt: t('2026-01-01T00:02:00') },
    ];
    
    const result = groupByTimeline(tabs, 5 * 60 * 1000);
    
    expect(result.length).toBe(2);
  });
  
  test('should handle month boundary', () => {
    const tabs = [
      { id: 1, createdAt: t('2026-02-28T23:58:00') },
      { id: 2, createdAt: t('2026-03-01T00:02:00') },
    ];
    
    const result = groupByTimeline(tabs, 5 * 60 * 1000);
    
    expect(result.length).toBe(2);
  });
});