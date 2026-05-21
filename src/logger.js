const MAX_LOG = 200;

export function createLogger(listEl, filters) {
  const entries = [];

  function render() {
    listEl.innerHTML = '';
    const visible = entries.filter((e) => filters[e.kind]);
    for (const e of visible) {
      const li = document.createElement('li');
      li.className = `log-item log-${e.kind} log-${e.dir || 'sys'}`;
      li.dataset.type = e.frameType || '';

      const meta = document.createElement('div');
      meta.className = 'log-meta';
      meta.innerHTML = `<time>${e.time}</time><span class="log-badge">${e.label}</span>`;

      const body = document.createElement('pre');
      body.className = 'log-body';
      body.textContent = e.body;

      li.append(meta, body);
      listEl.append(li);
    }
    listEl.scrollTop = listEl.scrollHeight;
  }

  function push(entry) {
    entries.push(entry);
    if (entries.length > MAX_LOG) entries.shift();
    render();
  }

  return {
    log(kind, label, body, extra = {}) {
      const now = new Date();
      const time = now.toLocaleTimeString('zh-CN', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0');
      let frameType = extra.frameType;
      if (!frameType && typeof body === 'string') {
        try {
          frameType = JSON.parse(body)?.type;
        } catch {
          /* ignore */
        }
      }
      push({
        time,
        kind,
        label,
        body: typeof body === 'string' ? body : JSON.stringify(body, null, 2),
        dir: extra.dir,
        frameType,
      });
    },
    clear() {
      entries.length = 0;
      render();
    },
    refresh: render,
  };
}
