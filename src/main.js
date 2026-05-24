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
import { createChatUI } from './chat-ui.js';

const $ = (id) => document.getElementById(id);

const filters = { ws: true, rest: true, sys: true };
const logger = createLogger($('logList'), filters);

let currentUserId = null;

function getCurrentUserId() {
  return currentUserId;
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

function updateMeDisplay(name, uid) {
  $('currentUser').textContent = name || `#${uid}`;
  $('meUserIdHint').textContent = `user_id: ${uid}`;
  $('meAvatar').textContent = String(uid).slice(-1) || '?';
}

function applyGroupTargets(groupId, convId) {
  const cid = normalizeConvId(convId);
  if (groupId) $('groupId').value = String(groupId);
  else if (cid) {
    const gid = parseGroupIdFromConvId(cid);
    if (gid) $('groupId').value = String(gid);
  }
  if (cid) {
    $('convId').value = cid;
    openConversation(cid);
  }
}

async function loadConversationHistory(convId) {
  const cfg = getConfigFromForm();
  try {
    const data = await api.listMessages(cfg.msgApi, requireToken(), convId, 50);
    chatUi.loadHistory(convId, data?.messages ?? []);
    logger.log('rest', '历史消息', `${convId}: ${(data?.messages ?? []).length} 条`);
  } catch (e) {
    logger.log('rest', '历史 ✕', e.data ? JSON.stringify(e.data, null, 2) : e.message);
  }
}

async function markCurrentRead() {
  const convId = chatUi.getActiveConvId() || normalizeConvId($('convId').value.trim());
  if (!convId) return;
  const msgs = chatUi.getMessages(convId);
  const lastSeq = msgs.length ? msgs[msgs.length - 1].seq : Number($('readSeq').value);
  if (!lastSeq) return;
  const cfg = getConfigFromForm();
  try {
    await api.markRead(cfg.convApi, requireToken(), convId, lastSeq);
    $('readSeq').value = String(lastSeq);
    chatUi.markReadLocally(convId);
    logger.log('rest', '已读', `${convId} seq=${lastSeq}`);
  } catch (e) {
    logger.log('rest', '已读 ✕', e.data ? JSON.stringify(e.data, null, 2) : e.message);
  }
}

function openConversation(convId, conv) {
  const cid = normalizeConvId(convId);
  $('convId').value = cid;
  chatUi.selectConversation(cid, conv);
  document.getElementById('app')?.classList.add('chat-open');
  loadConversationHistory(cid).then(() => markCurrentRead());
}

const chatUi = createChatUI($, {
  getCurrentUserId,
  onSelectConv: (convId, conv) => openConversation(convId, conv),
});

function wsSend(frame) {
  if (frame.conv_id) {
    frame = { ...frame, conv_id: normalizeConvId(frame.conv_id) };
  }
  ws.send(frame);
}

function sendCurrentMessage() {
  const convId = chatUi.getActiveConvId() || normalizeConvId($('convId').value.trim());
  const content = $('content').value.trim();
  if (!convId) {
    openDrawer('login');
    logger.log('sys', '提示', '请先选择会话');
    return;
  }
  if (!content) return;
  if (!ws.connected) {
    openDrawer('login');
    logger.log('sys', '提示', '请先连接 WebSocket');
    return;
  }
  $('convId').value = convId;
  const clientMsgId = crypto.randomUUID();
  $('clientMsgId').value = clientMsgId;
  const me = getCurrentUserId();
  chatUi.appendMessage(convId, {
    conv_id: convId,
    sender_id: me,
    content,
    msg_type: 'text',
    client_msg_id: clientMsgId,
    ts: Date.now(),
  });
  chatUi.updatePreview(convId, content);
  try {
    wsSend({
      type: 'send',
      conv_id: convId,
      content,
      msg_type: 'text',
      client_msg_id: clientMsgId,
    });
    $('content').value = '';
    $('content').style.height = 'auto';
  } catch (e) {
    logger.log('sys', '发送失败', e.message);
  }
}

function highlightFrame(raw) {
  try {
    const frame = JSON.parse(raw);
    if (frame.type === 'auth_ok' && frame.user_id) {
      currentUserId = frame.user_id;
      updateMeDisplay(null, frame.user_id);
    }
    if (frame.type === 'sent' && frame.seq) {
      $('readSeq').value = frame.seq;
      const convId = chatUi.getActiveConvId();
      if (convId) {
        const msgs = chatUi.getMessages(convId);
        const last = msgs[msgs.length - 1];
        if (last && !last.seq) last.seq = frame.seq;
        chatUi.updatePreview(convId, last?.content, frame.seq);
        markCurrentRead();
      }
    }
    if (frame.conv_id && (frame.type === 'message' || frame.type === 'badge')) {
      chatUi.updateFromWsFrame(frame);
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
      if (frame.type === 'message' && cid === chatUi.getActiveConvId()) {
        markCurrentRead();
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

const ws = createWsClient({
  onMessage(data, dir) {
    const label = dir === 'out' ? 'WS ↑' : 'WS ↓';
    logger.log('ws', label, data, { dir });
    if (dir === 'in') highlightFrame(data);
  },
  onStatus(state, text) {
    $('wsStatus').dataset.state = state;
    $('wsStatusText').textContent = state === 'on' ? '在线' : state === 'connecting' ? '连接中' : '离线';
    $('btnWsConnect').disabled = state === 'on' || state === 'connecting';
    $('btnWsDisconnect').disabled = state === 'off';
    $('btnPing').disabled = state !== 'on';
    $('btnSend').disabled = state !== 'on';
  },
});

async function refreshConversations() {
  const cfg = getConfigFromForm();
  const raw = $('directDays').value.trim();
  const directDays = raw === '' ? undefined : Number(raw);
  try {
    const data = await api.listConversations(cfg.convApi, requireToken(), { directDays });
    chatUi.setConversations(data?.conversations ?? []);
    logger.log('rest', '会话列表', `${(data?.conversations ?? []).length} 个会话`);
  } catch (e) {
    logger.log('rest', '会话 ✕', e.data ? JSON.stringify(e.data, null, 2) : e.message);
  }
}

async function loginAndConnect() {
  const cfg = getConfigFromForm();
  const userId = $('userId').value;
  try {
    logger.log('rest', 'REST →', `POST ${trimBase(cfg.userApi)}/v1/auth/dev-token user_id=${userId}`);
    const resp = await api.devToken(cfg.userApi, userId);
    $('token').value = resp.token;
    currentUserId = resp.user_id;
    updateMeDisplay(
      resp.user?.nickname ? `${resp.user.nickname}` : null,
      resp.user_id,
    );
    logger.log('rest', 'REST ←', JSON.stringify(resp, null, 2));
    ws.connect(cfg.gatewayWs, resp.token);
    await refreshConversations();
    closeDrawer();
  } catch (e) {
    logger.log('rest', 'REST ✕', e.data ? JSON.stringify(e.data, null, 2) : e.message);
  }
}

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

// —— 抽屉 ——
function openDrawer(tab = 'login') {
  $('drawerBackdrop')?.classList.remove('hidden');
  $('drawer')?.classList.remove('hidden');
  switchDrawerTab(tab);
}

function closeDrawer() {
  $('drawerBackdrop')?.classList.add('hidden');
  $('drawer')?.classList.add('hidden');
}

function switchDrawerTab(tab) {
  document.querySelectorAll('.drawer-tab').forEach((t) => {
    const on = t.dataset.drawer === tab;
    t.classList.toggle('active', on);
  });
  document.querySelectorAll('.drawer-pane').forEach((p) => {
    const on = p.dataset.pane === tab;
    p.classList.toggle('active', on);
    p.hidden = !on;
  });
}

// —— 初始化 ——
applyConfig(loadConfig());
logger.log('sys', '就绪', '微信风格测试页。登录后自动拉会话列表并连接 WS。');

$('btnOpenSettings').addEventListener('click', () => openDrawer('login'));
$('btnLoginPrompt').addEventListener('click', () => openDrawer('login'));
$('btnCloseDrawer').addEventListener('click', closeDrawer);
$('drawerBackdrop').addEventListener('click', closeDrawer);

document.querySelectorAll('.drawer-tab').forEach((tab) => {
  tab.addEventListener('click', () => switchDrawerTab(tab.dataset.drawer));
});

$('btnSaveConfig').addEventListener('click', () => {
  saveConfig(getConfigFromForm());
  logger.log('sys', '配置', '已保存');
});

$('btnResetConfig').addEventListener('click', () => {
  applyConfig({ ...DEFAULT_CONFIG });
  saveConfig(DEFAULT_CONFIG);
  logger.log('sys', '配置', '已恢复默认');
});

$('btnDevToken').addEventListener('click', () => loginAndConnect());

$('btnWsConnect').addEventListener('click', () => {
  try {
    const cfg = getConfigFromForm();
    ws.connect(cfg.gatewayWs, requireToken());
    logger.log('sys', 'WS', `连接 ${cfg.gatewayWs}`);
  } catch (e) {
    logger.log('sys', '错误', e.message);
  }
});

$('btnWsDisconnect').addEventListener('click', () => ws.disconnect());
$('btnPing').addEventListener('click', () => {
  try { wsSend({ type: 'ping' }); } catch (e) { logger.log('sys', '错误', e.message); }
});

$('btnSend').addEventListener('click', sendCurrentMessage);

$('content').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && !ev.shiftKey) {
    ev.preventDefault();
    sendCurrentMessage();
  }
});

$('content').addEventListener('input', (ev) => {
  ev.target.style.height = 'auto';
  ev.target.style.height = `${Math.min(ev.target.scrollHeight, 120)}px`;
});

$('btnRefreshConv').addEventListener('click', () => refreshConversations());
$('btnLoadHistory').addEventListener('click', () => {
  const convId = chatUi.getActiveConvId();
  if (convId) loadConversationHistory(convId);
  else logger.log('sys', '提示', '请先选择会话');
});

$('btnMarkRead').addEventListener('click', () => markCurrentRead());
$('btnListConv').addEventListener('click', () => refreshConversations());

$('btnListMsg').addEventListener('click', () => {
  const convId = chatUi.getActiveConvId();
  if (convId) loadConversationHistory(convId);
});

$('btnBackList').addEventListener('click', () => {
  document.getElementById('app')?.classList.remove('chat-open');
});

$('btnQuickGroup1').addEventListener('click', () => {
  chatUi.ensureConv('group_1', { type: 'group', group_id: 1, group_name: '测试群' });
  openConversation('group_1', { id: 'group_1', type: 'group', group_id: 1, group_name: '测试群' });
});

$('btnQuickC2c2').addEventListener('click', () => {
  const id = chatUi.quickC2c(2);
  if (id) openConversation(id, { id, type: 'c2c', peer_user_id: 2 });
  else openDrawer('login');
});

$('btnQuickC2c3').addEventListener('click', () => {
  const id = chatUi.quickC2c(3);
  if (id) openConversation(id, { id, type: 'c2c', peer_user_id: 3 });
  else openDrawer('login');
});

$('convSearch').addEventListener('input', (ev) => {
  const q = ev.target.value.trim().toLowerCase();
  document.querySelectorAll('.conv-item').forEach((item) => {
    const text = item.textContent.toLowerCase();
    item.style.display = !q || text.includes(q) ? '' : 'none';
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

['filterWs', 'filterRest', 'filterSys'].forEach((id) => {
  $(id).addEventListener('change', (ev) => {
    const key = id.replace('filter', '').toLowerCase();
    filters[key] = ev.target.checked;
    logger.refresh();
  });
});

$('btnClearLog').addEventListener('click', () => logger.clear());

// 有 token 时可从 userId 恢复显示
if ($('token').value.trim()) {
  currentUserId = Number($('userId').value) || null;
  if (currentUserId) updateMeDisplay(null, currentUserId);
}
