import { c2cConvId, normalizeConvId } from './config.js';

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const hm = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (d.toDateString() === now.toDateString()) return hm;
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

function convTitle(conv) {
  if (conv.type === 'group') return conv.group_name || `群聊 ${conv.group_id || ''}`.trim();
  if (conv.type === 'c2c') return conv.peer_user_id ? `用户 ${conv.peer_user_id}` : '私信';
  return conv.id || '会话';
}

function convAvatarText(conv) {
  if (conv.type === 'group') return '群';
  if (conv.peer_user_id) return String(conv.peer_user_id).slice(-1);
  return '?';
}

/** @param {(id: string) => HTMLElement | null} $ */
export function createChatUI($, { getCurrentUserId, onSelectConv }) {
  let conversations = [];
  let activeConvId = null;
  /** @type {Map<string, object[]>} */
  const messagesByConv = new Map();
  /** @type {Map<string, object>} */
  const convMeta = new Map();

  function getMessages(convId) {
    return messagesByConv.get(normalizeConvId(convId)) ?? [];
  }

  function setMessages(convId, list) {
    messagesByConv.set(normalizeConvId(convId), list);
  }

  function upsertConvMeta(conv) {
    const id = normalizeConvId(conv.id);
    convMeta.set(id, { ...convMeta.get(id), ...conv, id });
  }

  function renderConvList() {
    const el = $('convList');
    if (!el) return;
    el.innerHTML = '';
    if (!conversations.length) {
      el.innerHTML = '<div class="conv-empty">暂无会话，登录后点击刷新</div>';
      return;
    }
    const sorted = [...conversations].sort((a, b) => (b.last_seq || 0) - (a.last_seq || 0));
    for (const conv of sorted) {
      const id = normalizeConvId(conv.id);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `conv-item${id === activeConvId ? ' active' : ''}`;
      btn.dataset.convId = id;
      const unread = conv.unread > 0 ? `<span class="conv-badge">${conv.unread > 99 ? '99+' : conv.unread}</span>` : '';
      btn.innerHTML = `
        <div class="conv-avatar">${convAvatarText(conv)}</div>
        <div class="conv-body">
          <div class="conv-row">
            <span class="conv-name">${convTitle(conv)}</span>
          </div>
          <div class="conv-row">
            <span class="conv-preview">${conv.last_preview || ''}</span>
            ${unread}
          </div>
        </div>
      `;
      btn.addEventListener('click', () => onSelectConv?.(id, conv));
      el.append(btn);
    }
  }

  function renderMessages() {
    const listEl = $('messageList');
    if (!listEl) return;
    listEl.innerHTML = '';
    if (!activeConvId) {
      listEl.innerHTML = '<div class="chat-placeholder"><p>选择左侧会话开始聊天</p></div>';
      return;
    }
    const msgs = getMessages(activeConvId);
    const me = getCurrentUserId();
    if (!msgs.length) {
      listEl.innerHTML = '<div class="chat-placeholder"><p>暂无消息</p></div>';
      return;
    }
    for (const msg of msgs) {
      listEl.append(createBubble(msg, me));
    }
    scrollToBottom();
  }

  function createBubble(msg, me) {
    const isSelf = msg.sender_id === me;
    const wrap = document.createElement('div');
    wrap.className = `msg-row ${isSelf ? 'self' : 'other'}`;
    wrap.dataset.seq = String(msg.seq ?? '');
    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.textContent = isSelf ? '我' : String(msg.sender_id ?? '?').slice(-1);
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = msg.content ?? '';
    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    meta.textContent = msg.seq ? `#${msg.seq}` : '';
    if (msg.ts) meta.textContent += (meta.textContent ? ' · ' : '') + formatTime(msg.ts);
    if (isSelf) wrap.append(bubble, avatar);
    else wrap.append(avatar, bubble);
    wrap.append(meta);
    return wrap;
  }

  function scrollToBottom() {
    const el = $('messageScroll');
    if (el) el.scrollTop = el.scrollHeight;
  }

  function updateChatHeader() {
    const titleEl = $('chatTitle');
    const subEl = $('chatSubtitle');
    if (!titleEl) return;
    if (!activeConvId) {
      titleEl.textContent = 'IM 测试';
      if (subEl) subEl.textContent = '';
      return;
    }
    const conv = convMeta.get(activeConvId) ?? conversations.find((c) => normalizeConvId(c.id) === activeConvId);
    titleEl.textContent = conv ? convTitle(conv) : activeConvId;
    if (subEl) subEl.textContent = activeConvId;
  }

  return {
    getActiveConvId: () => activeConvId,
    getMessages,
    setMessages,

    setConversations(list) {
      conversations = (list ?? []).map((c) => ({ ...c, id: normalizeConvId(c.id) }));
      for (const c of conversations) upsertConvMeta(c);
      renderConvList();
    },

    selectConversation(convId, conv) {
      activeConvId = normalizeConvId(convId);
      if (conv) upsertConvMeta(conv);
      renderConvList();
      renderMessages();
      updateChatHeader();
    },

    loadHistory(convId, messages) {
      const id = normalizeConvId(convId);
      const sorted = [...(messages ?? [])].sort((a, b) => (a.seq || 0) - (b.seq || 0));
      setMessages(id, sorted);
      if (id === activeConvId) renderMessages();
    },

    appendMessage(convId, msg) {
      const id = normalizeConvId(convId);
      const list = getMessages(id);
      if (msg.seq && list.some((m) => m.seq === msg.seq)) return false;
      if (msg.client_msg_id && list.some((m) => m.client_msg_id === msg.client_msg_id)) return false;
      list.push(msg);
      setMessages(id, list);
      if (id === activeConvId) {
        const listEl = $('messageList');
        listEl?.append(createBubble(msg, getCurrentUserId()));
        scrollToBottom();
      }
      return true;
    },

    updateFromWsFrame(frame) {
      const id = normalizeConvId(frame.conv_id);
      if (!id) return;
      let conv = convMeta.get(id) ?? conversations.find((c) => normalizeConvId(c.id) === id);
      if (!conv) {
        conv = { id, type: frame.conv_type || 'c2c', last_seq: frame.seq, last_preview: frame.content, unread: 0 };
        conversations.push(conv);
      }
      if (frame.type === 'message') {
        conv.last_preview = frame.content;
        conv.last_seq = frame.seq;
        if (id !== activeConvId) conv.unread = (conv.unread || 0) + 1;
        upsertConvMeta(conv);
        this.appendMessage(id, {
          conv_id: id,
          sender_id: frame.sender_id,
          seq: frame.seq,
          msg_type: frame.msg_type,
          content: frame.content,
          ts: frame.ts,
          client_msg_id: frame.client_msg_id,
        });
      }
      if (frame.type === 'badge') {
        conv.last_seq = frame.seq ?? conv.last_seq;
        if (id !== activeConvId && frame.unread_delta) {
          conv.unread = (conv.unread || 0) + frame.unread_delta;
        }
        upsertConvMeta(conv);
      }
      const idx = conversations.findIndex((c) => normalizeConvId(c.id) === id);
      if (idx >= 0) conversations[idx] = { ...conversations[idx], ...convMeta.get(id) };
      else conversations.push(convMeta.get(id));
      renderConvList();
    },

    markReadLocally(convId) {
      const id = normalizeConvId(convId);
      const conv = conversations.find((c) => normalizeConvId(c.id) === id);
      if (conv) conv.unread = 0;
      renderConvList();
    },

    updatePreview(convId, preview, seq) {
      const id = normalizeConvId(convId);
      const conv = conversations.find((c) => normalizeConvId(c.id) === id);
      if (conv) {
        if (preview != null) conv.last_preview = preview;
        if (seq != null) conv.last_seq = seq;
        upsertConvMeta(conv);
        renderConvList();
      }
    },

    ensureConv(convId, meta = {}) {
      const id = normalizeConvId(convId);
      if (!conversations.some((c) => normalizeConvId(c.id) === id)) {
        conversations.push({ id, type: meta.type || 'c2c', ...meta });
      }
      upsertConvMeta({ id, ...meta });
      renderConvList();
    },

    quickC2c(peerUid) {
      const me = getCurrentUserId();
      if (!me) return null;
      const id = c2cConvId(me, peerUid);
      this.ensureConv(id, { type: 'c2c', peer_user_id: peerUid });
      return id;
    },

    refreshViews() {
      renderConvList();
      renderMessages();
      updateChatHeader();
    },
  };
}
