/**
 * 消息 input[] 构建与解析（对齐 docs/frontend-integration.md）
 */

/** @typedef {{ msgType: string, content: string }} MessageInput */

export function partText(text) {
  return { msgType: 'text', content: JSON.stringify({ text: String(text || '').trim() }) };
}

export function partImage(url, width, height) {
  const body = { url: String(url || '').trim() };
  if (width) body.width = Number(width);
  if (height) body.height = Number(height);
  return { msgType: 'image', content: JSON.stringify(body) };
}

export function partEmoji(emoji) {
  return { msgType: 'emoji', content: JSON.stringify({ emoji: String(emoji || '').trim() }) };
}

export function partCustom(type, data = {}) {
  return {
    msgType: 'custom',
    content: JSON.stringify({ type: String(type), data }),
  };
}

/** 自定义消息预设 */
export const CUSTOM_PRESETS = {
  red_packet: {
    label: '红包',
    build: (opts = {}) =>
      partCustom('red_packet', {
        amount: opts.amount ?? 8.88,
        greeting: opts.greeting ?? '恭喜发财，大吉大利',
        packet_id: opts.packet_id ?? `rp_${Date.now()}`,
      }),
  },
  card: {
    label: '卡片',
    build: (opts = {}) =>
      partCustom('card', {
        title: opts.title ?? '订单已发货',
        subtitle: opts.subtitle ?? '点击查看物流详情',
        action: opts.action ?? 'view_order',
        order_id: opts.order_id ?? 'ORD-' + Date.now(),
      }),
  },
  link_share: {
    label: '图文分享',
    build: (opts = {}) =>
      partCustom('link_share', {
        title: opts.title ?? 'IM 平台上线公告',
        desc: opts.desc ?? '万人群即时通讯，欢迎体验',
        url: opts.url ?? 'https://example.com/article/1',
        thumb: opts.thumb ?? 'https://picsum.photos/200/120',
      }),
  },
  tag: {
    label: '标签',
    build: (opts = {}) =>
      partCustom('tag', {
        tags: opts.tags ?? ['重要', '待办'],
        color: opts.color ?? '#07c160',
      }),
  },
};

export function parsePartContent(part) {
  try {
    return JSON.parse(part.content);
  } catch {
    return { _raw: part.content };
  }
}

/** 片段预览文案（编辑器待发送列表） */
export function partPreviewLabel(part) {
  try {
    const p = parsePart(part);
    switch (p.kind) {
      case 'text':
        return p.text.length > 24 ? `${p.text.slice(0, 24)}…` : p.text;
      case 'image':
        return `[图片] ${(p.url || '').replace(/^https?:\/\//, '').slice(0, 28)}`;
      case 'emoji':
        return p.emoji;
      case 'custom': {
        const labels = { red_packet: '[红包]', card: '[卡片]', link_share: '[分享]', tag: '[标签]' };
        return labels[p.type] || `[${p.type}]`;
      }
      default:
        return part.msgType || '?';
    }
  } catch {
    return part.msgType || '?';
  }
}

export function parsePart(part) {
  const body = parsePartContent(part);
  switch (part.msgType) {
    case 'text':
      return { kind: 'text', text: body.text ?? '' };
    case 'image':
      return { kind: 'image', url: body.url, width: body.width, height: body.height };
    case 'emoji':
      return { kind: 'emoji', emoji: body.emoji ?? '' };
    case 'custom':
      return { kind: 'custom', type: body.type, data: body.data ?? {} };
    default:
      return { kind: 'unknown', msgType: part.msgType, raw: body };
  }
}

/** 将 REST/WS 消息规范为含 input[] */
export function normalizeMessage(msg) {
  if (!msg) return msg;
  if (Array.isArray(msg.input) && msg.input.length) return msg;
  if (msg.content != null && msg.content !== '') {
    const mt = msg.msg_type || msg.msgType || 'text';
    if (mt === 'text' && typeof msg.content === 'string' && !msg.content.startsWith('{')) {
      return { ...msg, input: [partText(msg.content)] };
    }
    try {
      const parsed = JSON.parse(msg.content);
      if (mt === 'custom') {
        return { ...msg, input: [partCustom(parsed.type || 'unknown', parsed.data ?? parsed)] };
      }
      return { ...msg, input: [{ msgType: mt, content: msg.content }] };
    } catch {
      return { ...msg, input: [partText(String(msg.content))] };
    }
  }
  return { ...msg, input: [] };
}

/** 会话列表预览文案 */
export function previewText(msg) {
  const m = normalizeMessage(msg);
  const parts = (m.input ?? []).map(parsePart);
  if (!parts.length) return '';
  return parts
    .map((p) => {
      switch (p.kind) {
        case 'text':
          return p.text;
        case 'image':
          return '[图片]';
        case 'emoji':
          return p.emoji;
        case 'custom': {
          const labels = {
            red_packet: '[红包]',
            card: '[卡片]',
            link_share: '[链接]',
            tag: '[标签]',
          };
          return labels[p.type] || `[${p.type}]`;
        }
        default:
          return `[${p.msgType || '消息'}]`;
      }
    })
    .filter(Boolean)
    .join(' ');
}

/** 从 WS message 帧构建存储消息 */
export function messageFromWsFrame(frame) {
  return normalizeMessage({
    conv_id: frame.conv_id,
    sender_id: frame.sender_id,
    seq: frame.seq,
    id: frame.msg_id,
    input: frame.input,
    client_msg_id: frame.client_msg_id,
    ts: frame.ts,
  });
}

/** 根据当前 composer 模式构建 input[] */
export function buildInputFromComposer(mode, fields) {
  const parts = [];
  switch (mode) {
    case 'text': {
      const t = fields.text?.trim();
      if (t) parts.push(partText(t));
      break;
    }
    case 'image': {
      const url = fields.imageUrl?.trim();
      if (url) parts.push(partImage(url, fields.imageWidth, fields.imageHeight));
      break;
    }
    case 'emoji': {
      const e = fields.emoji?.trim();
      if (e) parts.push(partEmoji(e));
      break;
    }
    case 'red_packet':
      parts.push(CUSTOM_PRESETS.red_packet.build(fields));
      break;
    case 'card':
      parts.push(CUSTOM_PRESETS.card.build(fields));
      break;
    case 'link_share':
      parts.push(CUSTOM_PRESETS.link_share.build(fields));
      break;
    case 'tag':
      parts.push(CUSTOM_PRESETS.tag.build(fields));
      break;
    case 'mixed':
      return fields.mixedParts ?? [];
    default:
      break;
  }
  return parts;
}
