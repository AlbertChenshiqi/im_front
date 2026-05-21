const STORAGE_KEY = 'im-debug-groups';
const MAX_GROUPS = 20;

import { normalizeConvId } from './config.js';

export function loadTestGroups() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return list.map((g) => ({
      ...g,
      conv_id: normalizeConvId(g.conv_id),
    }));
  } catch {
    return [];
  }
}

export function saveTestGroup(entry) {
  const list = loadTestGroups().filter((g) => g.id !== entry.id);
  list.unshift({
    id: entry.id,
    name: entry.name,
    conv_id: entry.conv_id,
    owner_id: entry.owner_id,
    savedAt: Date.now(),
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_GROUPS)));
}

export function parseUserIds(text) {
  return [...new Set(
    String(text || '')
      .split(/[,，\s]+/)
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0),
  )];
}
