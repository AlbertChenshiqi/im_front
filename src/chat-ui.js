import { c2cConvId, normalizeConvId } from './config.js';
import { normalizeMessage, previewText, messageFromWsFrame } from './message.js';
import { renderMessageParts } from './message-render.js';

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
    messagesByConv.set(
      normalizeConvId(convId),
      (list ?? []).map((m) => normalizeMessage(m)),
    );
  }

  function upsertConvMeta(conv) {
    const id = normalizeConvId(conv.id);
    convMeta.set(id, { ...convMeta.get(id), ...conv, id });
  }

  /** 服务端 badge.unread_total = 该 conv 在 Redis 中的当前未读数（非全局合计） */
  function applyBadgeUnread(conv, frame) {
    const id = normalizeConvId(frame.conv_id);
    if (id === activeConvId) {
      conv.unread = 0;
      return;
    }
    if (frame.unread_total != null && frame.unread_total !== '') {
      conv.unread = Math.max(0, Number(frame.unread_total) || 0);
    } else if (frame.unread_delta) {
      conv.unread = Math.max(0, (Number(conv.unread) || 0) + Number(frame.unread_delta));
    }
  }

  function sumUnread() {
    return conversations.reduce((s, c) => s + (Number(c.unread) || 0), 0);
  }

  function updateGlobalUnreadDisplay() {
    const el = $('globalUnread');
    if (!el) return;
    const total = sumUnread();
    if (total > 0) {
      el.textContent = total > 99 ? '99+' : String(total);
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
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
    updateGlobalUnreadDisplay();
  }

  function createBubble(msg, me) {
    const normalized = normalizeMessage(msg);
    const isSelf = normalized.sender_id === me;
    const wrap = document.createElement('div');
    wrap.className = `msg-row ${isSelf ? 'self' : 'other'}`;
    wrap.dataset.seq = String(normalized.seq ?? '');
    if (normalized.client_msg_id) wrap.dataset.clientMsgId = normalized.client_msg_id;

    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.textContent = isSelf ? '我' : String(normalized.sender_id ?? '?').slice(-1);

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.append(renderMessageParts(normalized));

    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    meta.textContent = normalized.seq ? `#${normalized.seq}` : '';
    if (normalized.ts) meta.textContent += (meta.textContent ? ' · ' : '') + formatTime(normalized.ts);

    const col = document.createElement('div');
    col.className = 'msg-col';
    col.append(bubble, meta);

    if (isSelf) wrap.append(col, avatar);
    else wrap.append(avatar, col);

    return wrap;
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

  function msgDedupeKey(msg) {
    const m = normalizeMessage(msg);
    if (m.seq) return `seq:${m.seq}`;
    if (m.client_msg_id) return `cid:${m.client_msg_id}`;
    if (m.id) return `id:${m.id}`;
    return null;
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
      if (conv) {
        conv.unread = 0;
        upsertConvMeta(conv);
        const idx = conversations.findIndex((c) => normalizeConvId(c.id) === activeConvId);
        if (idx >= 0) conversations[idx].unread = 0;
      }
      renderConvList();
      renderMessages();
      updateChatHeader();
    },

    loadHistory(convId, messages) {
      const id = normalizeConvId(convId);
      const sorted = [...(messages ?? [])]
        .map((m) => normalizeMessage(m))
        .sort((a, b) => (a.seq || 0) - (b.seq || 0));
      setMessages(id, sorted);
      if (id === activeConvId) renderMessages();
    },

    appendMessage(convId, msg) {
      const id = normalizeConvId(convId);
      const normalized = normalizeMessage(msg);
      const list = getMessages(id);
      const key = msgDedupeKey(normalized);
      if (key && list.some((m) => msgDedupeKey(m) === key)) return false;
      list.push(normalized);
      setMessages(id, list);
      if (id === activeConvId) {
        $('messageList')?.append(createBubble(normalized, getCurrentUserId()));
        scrollToBottom();
      }
      return true;
    },

    updateFromWsFrame(frame) {
      const id = normalizeConvId(frame.conv_id);
      if (!id) return;

      let conv = convMeta.get(id) ?? conversations.find((c) => normalizeConvId(c.id) === id);
      if (!conv) {
        conv = { id, type: frame.conv_type || 'c2c', last_seq: frame.seq, unread: 0 };
        conversations.push(conv);
      }

      if (frame.type === 'message') {
        const msg = messageFromWsFrame(frame);
        conv.last_preview = previewText(msg);
        conv.last_seq = frame.seq;
        if (id === activeConvId) conv.unread = 0;
        upsertConvMeta(conv);
        this.appendMessage(id, msg);
      }

      if (frame.type === 'badge') {
        conv.last_seq = frame.seq ?? conv.last_seq;
        applyBadgeUnread(conv, frame);
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

    updatePreview(convId, msgOrText, seq) {
      const id = normalizeConvId(convId);
      const conv = conversations.find((c) => normalizeConvId(c.id) === id);
      if (conv) {
        const preview =
          typeof msgOrText === 'string'
            ? msgOrText
            : previewText(normalizeMessage(msgOrText));
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
