export function createWsClient({ onMessage, onStatus }) {
  let socket = null;

  function setStatus(state, text) {
    onStatus?.(state, text);
  }

  return {
    get connected() {
      return socket?.readyState === WebSocket.OPEN;
    },

    connect(wsBase, token) {
      this.disconnect();
      const sep = wsBase.includes('?') ? '&' : '?';
      const url = `${wsBase}${sep}token=${encodeURIComponent(token)}`;
      setStatus('connecting', '连接中…');

      socket = new WebSocket(url);

      socket.addEventListener('open', () => {
        setStatus('on', '已连接');
      });

      socket.addEventListener('message', (ev) => {
        onMessage?.(ev.data, 'in');
      });

      socket.addEventListener('close', (ev) => {
        setStatus('off', ev.reason ? `已断开 (${ev.code})` : '已断开');
        socket = null;
      });

      socket.addEventListener('error', () => {
        setStatus('error', '连接错误');
      });
    },

    disconnect() {
      if (socket) {
        socket.close();
        socket = null;
      }
      setStatus('off', '未连接');
    },

    send(frame) {
      if (!this.connected) {
        throw new Error('WebSocket 未连接');
      }
      const raw = JSON.stringify(frame);
      socket.send(raw);
      onMessage?.(raw, 'out');
    },
  };
}
