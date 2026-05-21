import { trimBase } from './config.js';

async function request(base, path, options = {}) {
  const url = `${trimBase(base)}${path}`;
  const res = await fetch(url, options);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const err = new Error(typeof data === 'object' && data?.message ? data.message : res.statusText);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function devToken(userApi, userId) {
  return request(userApi, '/v1/auth/dev-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: Number(userId) }),
  });
}

export function listConversations(convApi, token, { directDays } = {}) {
  const q = new URLSearchParams();
  if (directDays !== undefined && directDays !== null && directDays !== '') {
    q.set('direct_days', String(directDays));
  }
  const qs = q.toString();
  return request(convApi, `/v1/conversations${qs ? `?${qs}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function listMessages(msgApi, token, convId, limit = 50) {
  const q = new URLSearchParams({ limit: String(limit) });
  return request(msgApi, `/v1/conversations/${encodeURIComponent(convId)}/messages?${q}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function markRead(convApi, token, convId, seq) {
  return request(convApi, `/v1/conversations/${encodeURIComponent(convId)}/read`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ seq: Number(seq) }),
  });
}

export function createGroup(groupApi, token, name, memberIds = []) {
  const body = { name };
  if (memberIds?.length) body.member_ids = memberIds;
  return request(groupApi, '/v1/groups', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

export function getGroup(groupApi, token, groupId) {
  return request(groupApi, `/v1/groups/${groupId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function listGroupMembers(groupApi, token, groupId, cursor = 0) {
  const q = cursor > 0 ? `?cursor=${cursor}` : '';
  return request(groupApi, `/v1/groups/${groupId}/members${q}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function addGroupMembers(groupApi, token, groupId, userIds) {
  return request(groupApi, `/v1/groups/${groupId}/members`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ user_ids: userIds }),
  });
}
