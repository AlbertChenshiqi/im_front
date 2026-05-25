import { parsePart, normalizeMessage } from './message.js';

const EMOJI_QUICK = ['😀', '👍', '❤️', '🎉', '😂', '🙏', '🔥', '✨'];

export { EMOJI_QUICK };

/** 渲染单段到 DOM */
export function renderPartEl(parsed) {
  const el = document.createElement('div');
  el.className = `msg-part msg-part--${parsed.kind}`;

  switch (parsed.kind) {
    case 'text':
      el.textContent = parsed.text;
      break;
    case 'image': {
      const img = document.createElement('img');
      img.className = 'msg-img';
      img.src = parsed.url || '';
      img.alt = '图片';
      img.loading = 'lazy';
      img.addEventListener('click', () => window.open(parsed.url, '_blank'));
      el.append(img);
      break;
    }
    case 'emoji':
      el.className += ' msg-part--emoji-large';
      el.textContent = parsed.emoji;
      break;
    case 'custom':
      el.append(renderCustomEl(parsed.type, parsed.data));
      break;
    default:
      el.className += ' msg-part--unknown';
      el.textContent = JSON.stringify(parsed.raw ?? parsed);
  }
  return el;
}

function renderCustomEl(type, data) {
  const wrap = document.createElement('div');
  wrap.className = `custom-card custom-card--${type}`;

  switch (type) {
    case 'red_packet': {
      wrap.innerHTML = `
        <div class="custom-card-icon">🧧</div>
        <div class="custom-card-body">
          <div class="custom-card-title">${escapeHtml(data.greeting || '红包')}</div>
          <div class="custom-card-sub">¥${escapeHtml(String(data.amount ?? '—'))}</div>
        </div>
      `;
      break;
    }
    case 'card': {
      wrap.innerHTML = `
        <div class="custom-card-icon">📋</div>
        <div class="custom-card-body">
          <div class="custom-card-title">${escapeHtml(data.title || '卡片')}</div>
          <div class="custom-card-sub">${escapeHtml(data.subtitle || '')}</div>
          ${data.order_id ? `<div class="custom-card-meta">${escapeHtml(data.order_id)}</div>` : ''}
        </div>
      `;
      break;
    }
    case 'link_share': {
      wrap.innerHTML = `
        <div class="link-share">
          ${data.thumb ? `<img class="link-share-thumb" src="${escapeAttr(data.thumb)}" alt="" />` : ''}
          <div class="link-share-body">
            <div class="custom-card-title">${escapeHtml(data.title || '分享')}</div>
            <div class="custom-card-sub">${escapeHtml(data.desc || '')}</div>
            <div class="link-share-url">${escapeHtml(data.url || '')}</div>
          </div>
        </div>
      `;
      wrap.addEventListener('click', () => {
        if (data.url) window.open(data.url, '_blank');
      });
      break;
    }
    case 'tag': {
      const tags = Array.isArray(data.tags) ? data.tags : [data.tags].filter(Boolean);
      wrap.className += ' custom-card--tags';
      for (const t of tags) {
        const tag = document.createElement('span');
        tag.className = 'msg-tag';
        tag.style.background = data.color || '#07c160';
        tag.textContent = String(t);
        wrap.append(tag);
      }
      break;
    }
    default:
      wrap.innerHTML = `<div class="custom-card-title">[${escapeHtml(type)}]</div>
        <pre class="custom-card-raw">${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
  }
  return wrap;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, '&#39;');
}

/** 渲染整条消息气泡内容 */
export function renderMessageParts(msg) {
  const normalized = normalizeMessage(msg);
  const container = document.createElement('div');
  container.className = 'msg-parts';
  const inputs = normalized.input ?? [];
  if (!inputs.length) {
    container.textContent = '(空消息)';
    return container;
  }
  for (const part of inputs) {
    try {
      container.append(renderPartEl(parsePart(part)));
    } catch (e) {
      const err = document.createElement('div');
      err.className = 'msg-part msg-part--error';
      err.textContent = `解析失败: ${e.message}`;
      container.append(err);
    }
  }
  return container;
}
