import {
  DEFAULT_CONFIG,
  c2cConvId,
  groupConvId,
  loadConfig,
  normalizeConvId,
  parseGroupIdFromConvId,
  saveConfig,
  trimBase,
} from './config.js';
import * as api from './api.js';
import { createWsClient } from './ws.js';
import { createLogger } from './logger.js';
import { initGroupTest } from './group-test.js';

const $ = (id) => document.getElementById(id);

const filters = { ws: true, rest: true, sys: true };
const logger = createLogger($('logList'), filters);

const ws = createWsClient({
  onMessage(data, dir) {
    const label = dir === 'out' ? 'WS ↑' : 'WS ↓';
    logger.log('ws', label, data, { dir });
    highlightFrame(data);
  },
  onStatus(state, text) {
    $('wsStatus').dataset.state = state;
    $('wsStatusText').textContent = text;
    $('btnWsConnect').disabled = state === 'on' || state === 'connecting';
    $('btnWsDisconnect').disabled = state === 'off';
    $('btnPing').disabled = state !== 'on';
    $('btnSend').disabled = state !== 'on';
  },
});

let currentUserId = null;

function getCurrentUserId() {
  return currentUserId;
}

function applyGroupTargets(groupId, convId) {
  const cid = normalizeConvId(convId);
  if (groupId) $('groupId').value = String(groupId);
  else if (cid) {
    const gid = parseGroupIdFromConvId(cid);
    if (gid) $('groupId').value = String(gid);
  }
  if (cid) $('convId').value = cid;
}

function getConfigFromForm() {
  return {
    userApi: $('userApi').value.trim(),
    gatewayWs: $('gatewayWs').value.trim(),
    convApi: $('convApi').value.trim(),
    msgApi: $('msgApi').value.trim(),
    groupApi: $('groupApi').value.trim(),
  };
}

function applyConfig(cfg) {
  $('userApi').value = cfg.userApi;
  $('gatewayWs').value = cfg.gatewayWs;
  $('convApi').value = cfg.convApi;
  $('msgApi').value = cfg.msgApi;
  $('groupApi').value = cfg.groupApi;
}

function token() {
  return $('token').value.trim();
}

function requireToken() {
  const t = token();
  if (!t) throw new Error('请先获取 dev-token');
  return t;
}

function highlightFrame(raw) {
  try {
    const frame = JSON.parse(raw);
    if (frame.type === 'auth_ok' && frame.user_id) {
      currentUserId = frame.user_id;
      $('currentUser').textContent = `#${frame.user_id}`;
    }
    if (frame.type === 'sent' && frame.seq) {
      $('readSeq').value = frame.seq;
    }
    if (frame.conv_id && (frame.type === 'message' || frame.type === 'badge')) {
      const cid = normalizeConvId(frame.conv_id);
      $('convId').value = cid;
      const gid = parseGroupIdFromConvId(cid);
      if (gid) {
        $('groupId').value = String(gid);
        const testGid = $('testGroupId');
        const testConv = $('testGroupConvId');
        if (testGid) testGid.value = String(gid);
        if (testConv) testConv.value = cid;
      }
    }
    if (frame.type === 'error') {
      const code = frame.code ? `[${frame.code}] ` : '';
      logger.log('sys', 'WS 错误', `${code}${frame.msg || JSON.stringify(frame)}`);
    }
  } catch {
    /* ignore */
  }
}

function wsSend(frame) {
  if (frame.conv_id) {
    frame = { ...frame, conv_id: normalizeConvId(frame.conv_id) };
  }
  ws.send(frame);
}

// —— 配置 ——
applyConfig(loadConfig());
logger.log(
  'sys',
  '就绪',
  'conv_id 格式：group_{id} / c2c_{小uid}_{大uid}。WS 在线即可收推送，无需 subscribe_group。',
);

$('btnSaveConfig').addEventListener('click', () => {
  const cfg = getConfigFromForm();
  saveConfig(cfg);
  logger.log('sys', '配置', '已保存到 localStorage');
});

$('btnResetConfig').addEventListener('click', () => {
  applyConfig({ ...DEFAULT_CONFIG });
  saveConfig(DEFAULT_CONFIG);
  logger.log('sys', '配置', '已恢复默认');
});

// —— 鉴权 ——
$('btnDevToken').addEventListener('click', async () => {
  const cfg = getConfigFromForm();
  const userId = $('userId').value;
  try {
    logger.log(
      'rest',
      'REST →',
      `POST ${trimBase(cfg.userApi)}/v1/auth/dev-token\n${JSON.stringify({ user_id: Number(userId) }, null, 2)}`,
    );
    const resp = await api.devToken(cfg.userApi, userId);
    $('token').value = resp.token;
    currentUserId = resp.user_id;
    $('currentUser').textContent = resp.user?.nickname
      ? `${resp.user.nickname} (#${resp.user_id})`
      : `#${resp.user_id}`;
    logger.log('rest', 'REST ←', JSON.stringify(resp, null, 2));
  } catch (e) {
    logger.log('rest', 'REST ✕', e.data ? JSON.stringify(e.data, null, 2) : e.message);
  }
});

// —— WebSocket ——
$('btnWsConnect').addEventListener('click', () => {
  try {
    const cfg = getConfigFromForm();
    const t = requireToken();
    logger.log('sys', 'WS', `连接 ${cfg.gatewayWs}`);
    ws.connect(cfg.gatewayWs, t);
  } catch (e) {
    logger.log('sys', '错误', e.message);
  }
});

$('btnWsDisconnect').addEventListener('click', () => ws.disconnect());

$('btnPing').addEventListener('click', () => {
  try {
    wsSend({ type: 'ping' });
  } catch (e) {
    logger.log('sys', '错误', e.message);
  }
});

// —— 发消息 ——
$('btnSend').addEventListener('click', () => {
  const convId = normalizeConvId($('convId').value.trim());
  if (!convId) {
    $('convId').focus();
    logger.log('sys', '错误', '请填写 conv_id（如 group_1、c2c_1_2）');
    return;
  }
  $('convId').value = convId;
  const content = $('content').value;
  const frame = {
    type: 'send',
    conv_id: convId,
    content,
    msg_type: $('msgType').value.trim() || 'text',
  };
  let cid = $('clientMsgId').value.trim();
  if (!cid) {
    cid = crypto.randomUUID();
    $('clientMsgId').value = cid;
  }
  frame.client_msg_id = cid;
  try {
    wsSend(frame);
  } catch (e) {
    logger.log('sys', '错误', e.message);
  }
});

$('btnGenClientId').addEventListener('click', () => {
  $('clientMsgId').value = crypto.randomUUID();
});

document.querySelectorAll('.chip[data-conv]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const cid = normalizeConvId(btn.dataset.conv);
    $('convId').value = cid;
    const gid = parseGroupIdFromConvId(cid);
    if (gid) $('groupId').value = String(gid);
  });
});

document.querySelectorAll('.chip[data-c2c]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const peer = Number(btn.dataset.c2c);
    const me = currentUserId ?? Number($('userId').value);
    $('convId').value = c2cConvId(me, peer);
  });
});

document.querySelectorAll('.chip[data-group-id]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const gid = Number(btn.dataset.groupId);
    $('convId').value = groupConvId(gid);
    $('groupId').value = String(gid);
  });
});

// —— REST ——
async function restCall(label, fn) {
  try {
    const data = await fn();
    logger.log('rest', label, JSON.stringify(data, null, 2));
    return data;
  } catch (e) {
    logger.log('rest', `${label} ✕`, e.data ? JSON.stringify(e.data, null, 2) : e.message);
    return null;
  }
}

$('btnListConv').addEventListener('click', () => {
  const cfg = getConfigFromForm();
  const raw = $('directDays').value.trim();
  const directDays = raw === '' ? undefined : Number(raw);
  restCall('会话列表', () => api.listConversations(cfg.convApi, requireToken(), { directDays }));
});

$('btnListMsg').addEventListener('click', () => {
  const convId = normalizeConvId($('convId').value.trim());
  if (!convId) {
    logger.log('sys', '错误', '请填写 conv_id');
    return;
  }
  const cfg = getConfigFromForm();
  restCall('历史消息', () => api.listMessages(cfg.msgApi, requireToken(), convId));
});

$('btnMarkRead').addEventListener('click', () => {
  const convId = normalizeConvId($('convId').value.trim());
  if (!convId) {
    logger.log('sys', '错误', '请填写 conv_id');
    return;
  }
  const cfg = getConfigFromForm();
  const seq = $('readSeq').value;
  restCall('标记已读', () => api.markRead(cfg.convApi, requireToken(), convId, seq));
});

// —— Tab 切换 ——
const views = { msg: $('viewMsg'), group: $('viewGroup') };
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const key = tab.dataset.tab;
    document.querySelectorAll('.tab').forEach((t) => {
      const on = t.dataset.tab === key;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    Object.entries(views).forEach(([k, el]) => {
      const on = k === key;
      el.classList.toggle('active', on);
      el.hidden = !on;
    });
  });
});

initGroupTest({
  $,
  getConfig: getConfigFromForm,
  requireToken,
  restCall,
  applyGroupTargets,
  wsSend,
  wsConnected: () => ws.connected,
  getCurrentUserId,
  logger,
});

// —— 日志过滤 ——
['filterWs', 'filterRest', 'filterSys'].forEach((id) => {
  $(id).addEventListener('change', (ev) => {
    const key = id.replace('filter', '').toLowerCase();
    filters[key] = ev.target.checked;
    logger.refresh();
  });
});

$('btnClearLog').addEventListener('click', () => logger.clear());
