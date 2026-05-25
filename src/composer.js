import {
  partText,
  partImage,
  partEmoji,
  partPreviewLabel,
  CUSTOM_PRESETS,
} from './message.js';
import { EMOJI_QUICK } from './message-render.js';

/** @param {(id: string) => HTMLElement | null} $ */
export function initComposer($, { onModeChange }) {
  let mode = 'text';
  /** @type {Array<{msgType:string,content:string}>} */
  let draftParts = [];

  const MODES = [
    { id: 'text', label: '文本' },
    { id: 'image', label: '图片' },
    { id: 'emoji', label: '表情' },
    { id: 'red_packet', label: '红包' },
    { id: 'card', label: '卡片' },
    { id: 'link_share', label: '分享' },
    { id: 'tag', label: '标签' },
  ];

  const CAPTION_MODES = new Set(['text', 'image', 'emoji']);

  function getFields() {
    const tagsRaw = $('composerTagList')?.value?.trim();
    const tags = tagsRaw ? tagsRaw.split(/[,，]/).map((s) => s.trim()).filter(Boolean) : undefined;
    return {
      text: $('content')?.value ?? '',
      imageUrl: $('composerImageUrl')?.value,
      imageWidth: $('composerImageW')?.value,
      imageHeight: $('composerImageH')?.value,
      emoji: $('composerEmoji')?.value,
      amount: Number($('composerRpAmount')?.value) || 8.88,
      greeting: $('composerRpGreeting')?.value,
      title: $('composerCardTitle')?.value,
      subtitle: $('composerCardSub')?.value,
      order_id: $('composerCardOrder')?.value,
      linkTitle: $('composerLinkTitle')?.value,
      linkDesc: $('composerLinkDesc')?.value,
      linkUrl: $('composerLinkUrl')?.value,
      linkThumb: $('composerLinkThumb')?.value,
      tags,
      color: $('composerTagColor')?.value,
    };
  }

  function buildPartsForMode(m, fields) {
    switch (m) {
      case 'image': {
        const url = fields.imageUrl?.trim();
        return url ? [partImage(url, fields.imageWidth, fields.imageHeight)] : [];
      }
      case 'emoji': {
        const e = fields.emoji?.trim();
        return e ? [partEmoji(e)] : [];
      }
      case 'red_packet':
        return [CUSTOM_PRESETS.red_packet.build({ amount: fields.amount, greeting: fields.greeting })];
      case 'card':
        return [
          CUSTOM_PRESETS.card.build({
            title: fields.title,
            subtitle: fields.subtitle,
            order_id: fields.order_id || undefined,
          }),
        ];
      case 'link_share':
        return [
          CUSTOM_PRESETS.link_share.build({
            title: fields.linkTitle,
            desc: fields.linkDesc,
            url: fields.linkUrl,
            thumb: fields.linkThumb,
          }),
        ];
      case 'tag':
        return [CUSTOM_PRESETS.tag.build({ tags: fields.tags, color: fields.color })];
      default:
        return [];
    }
  }

  function renderDraftStrip() {
    const strip = $('draftStrip');
    const list = $('draftPartsList');
    if (!strip || !list) return;
    if (!draftParts.length) {
      strip.classList.add('hidden');
      list.innerHTML = '';
      return;
    }
    strip.classList.remove('hidden');
    list.innerHTML = '';
    draftParts.forEach((p, i) => {
      const li = document.createElement('li');
      li.className = 'draft-chip';
      li.innerHTML = `<span class="draft-type">${p.msgType}</span><span class="draft-label">${esc(partPreviewLabel(p))}</span>`;
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'draft-del';
      del.textContent = '×';
      del.title = '移除';
      del.addEventListener('click', () => {
        draftParts.splice(i, 1);
        renderDraftStrip();
      });
      li.append(del);
      list.append(li);
    });
    const count = $('draftCount');
    if (count) count.textContent = String(draftParts.length);
  }

  function renderFields() {
    const panel = $('composerFields');
    if (!panel) return;
    const f = getFields();

    const templates = {
      text: `<p class="composer-hint">单条消息可含多段 input，用「+ 片段」叠加图片/表情后再输入文字发送</p>`,
      image: `
        <label>图片 URL <input type="url" id="composerImageUrl" placeholder="https://picsum.photos/300/200" value="${esc(f.imageUrl)}" /></label>
        <div class="inline-fields">
          <label>宽 <input type="number" id="composerImageW" placeholder="可选" value="${esc(f.imageWidth)}" /></label>
          <label>高 <input type="number" id="composerImageH" placeholder="可选" value="${esc(f.imageHeight)}" /></label>
        </div>
        <p class="composer-hint">下方可输入配图说明，与图片作为<strong>一条消息</strong>发送</p>`,
      emoji: `
        <label>表情 <input type="text" id="composerEmoji" value="${esc(f.emoji)}" placeholder="😀" /></label>
        <div class="emoji-strip" id="emojiStrip"></div>
        <p class="composer-hint">可再加文字说明，一并发送</p>`,
      red_packet: `
        <label>金额 <input type="number" id="composerRpAmount" step="0.01" value="${f.amount}" /></label>
        <label>祝福语 <input type="text" id="composerRpGreeting" value="${esc(f.greeting || '恭喜发财，大吉大利')}" /></label>`,
      card: `
        <label>标题 <input type="text" id="composerCardTitle" value="${esc(f.title || '订单已发货')}" /></label>
        <label>副标题 <input type="text" id="composerCardSub" value="${esc(f.subtitle || '点击查看物流详情')}" /></label>
        <label>订单号 <input type="text" id="composerCardOrder" value="${esc(f.order_id || '')}" placeholder="自动生成" /></label>`,
      link_share: `
        <label>标题 <input type="text" id="composerLinkTitle" value="${esc(f.linkTitle || 'IM 平台上线公告')}" /></label>
        <label>描述 <input type="text" id="composerLinkDesc" value="${esc(f.linkDesc || '万人群即时通讯')}" /></label>
        <label>链接 <input type="url" id="composerLinkUrl" value="${esc(f.linkUrl || 'https://example.com')}" /></label>
        <label>缩略图 <input type="url" id="composerLinkThumb" value="${esc(f.linkThumb || 'https://picsum.photos/200/120')}" /></label>`,
      tag: `
        <label>标签（逗号分隔）<input type="text" id="composerTagList" value="${esc((f.tags || ['重要', '待办']).join(','))}" /></label>
        <label>颜色 <input type="color" id="composerTagColor" value="${f.color || '#07c160'}" /></label>`,
    };

    panel.innerHTML = templates[mode] || '';
    panel.classList.toggle('hidden', mode === 'text');

    if (mode === 'emoji') {
      const strip = $('emojiStrip');
      if (strip) {
        strip.innerHTML = '';
        for (const e of EMOJI_QUICK) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'emoji-btn';
          b.textContent = e;
          b.addEventListener('click', () => {
            const inp = $('composerEmoji');
            if (inp) inp.value = e;
          });
          strip.append(b);
        }
      }
    }

    const ta = $('content');
    if (ta) {
      const placeholders = {
        text: '输入文字，Enter 发送',
        image: '配图说明（可选，与图片同条发送）',
        emoji: '附加文字（可选）',
      };
      ta.placeholder = placeholders[mode] || '输入文字，Enter 发送';
    }

    onModeChange?.(mode);
  }

  function esc(v) {
    return String(v ?? '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function renderToolbar() {
    const bar = $('composerToolbar');
    if (!bar) return;
    bar.innerHTML = '';
    for (const m of MODES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `composer-mode${mode === m.id ? ' active' : ''}`;
      btn.dataset.mode = m.id;
      btn.textContent = m.label;
      btn.addEventListener('click', () => {
        mode = m.id;
        renderToolbar();
        renderFields();
      });
      bar.append(btn);
    }
  }

  /** 将当前模式内容加入待发送队列（不发送） */
  function addCurrentToDraft() {
    const fields = getFields();
    if (mode === 'text') {
      const t = fields.text?.trim();
      if (!t) return false;
      draftParts.push(partText(t));
      $('content').value = '';
      $('content').style.height = 'auto';
    } else {
      const parts = buildPartsForMode(mode, fields);
      if (!parts.length) return false;
      draftParts.push(...parts);
      if (mode === 'image') {
        $('composerImageUrl').value = '';
        $('composerImageW').value = '';
        $('composerImageH').value = '';
      }
      if (mode === 'emoji' && $('composerEmoji')) $('composerEmoji').value = '';
    }
    renderDraftStrip();
    return true;
  }

  /**
   * 组装 send 帧的 input[]：已排队片段 + 当前模式片段 + 输入框文字（一条消息）
   */
  function buildSendInput() {
    const fields = getFields();
    const parts = [...draftParts];

    if (mode === 'text') {
      const t = fields.text?.trim();
      if (t) parts.push(partText(t));
    } else {
      parts.push(...buildPartsForMode(mode, fields));
      if (CAPTION_MODES.has(mode)) {
        const caption = fields.text?.trim();
        if (caption) parts.push(partText(caption));
      }
    }

    return parts;
  }

  function clearAfterSend() {
    draftParts = [];
    renderDraftStrip();
    const ta = $('content');
    if (ta) {
      ta.value = '';
      ta.style.height = 'auto';
    }
    if ($('composerImageUrl')) $('composerImageUrl').value = '';
    if ($('composerImageW')) $('composerImageW').value = '';
    if ($('composerImageH')) $('composerImageH').value = '';
    if ($('composerEmoji')) $('composerEmoji').value = '';
  }

  function hasContentToSend() {
    return buildSendInput().length > 0;
  }

  renderToolbar();
  renderFields();
  renderDraftStrip();

  $('btnAddPart')?.addEventListener('click', () => {
    if (!addCurrentToDraft()) {
      alert(mode === 'text' ? '请先输入文字' : '请先填写当前类型内容');
    }
  });

  $('btnClearDraft')?.addEventListener('click', () => {
    draftParts = [];
    renderDraftStrip();
  });

  return {
    getMode: () => mode,
    buildSendInput,
    clearAfterSend,
    hasContentToSend,
    addCurrentToDraft,
    renderFields,
    getDraftCount: () => draftParts.length,
  };
}
