const STORAGE_KEY = 'im-debug-config';

/** 本地 Vite 代理：/proxy/{service} → localhost:10X00/{service}；K8s Ingress 填 https://域名/{service} */
export const DEFAULT_CONFIG = {
  userApi: '/proxy/user',
  gatewayWs: 'ws://localhost:10000/gateway/v1/ws',
  convApi: '/proxy/conversation',
  msgApi: '/proxy/message',
  groupApi: '/proxy/group',
};

/** 群聊 conv_id：group_{group_id} */
export function groupConvId(groupId) {
  return `group_${groupId}`;
}

/** 私信 conv_id：c2c_{小uid}_{大uid} */
export function c2cConvId(uidA, uidB) {
  const a = Number(uidA);
  const b = Number(uidB);
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return `c2c_${lo}_${hi}`;
}

/** @deprecated 使用 c2cConvId */
export const directConvId = c2cConvId;

/** 兼容旧格式 g_* / d_* → 新格式（服务端仍识别旧格式，调试台统一用新格式） */
export function normalizeConvId(convId) {
  const s = String(convId || '').trim();
  if (!s) return s;
  const g = s.match(/^g_(\d+)$/);
  if (g) return groupConvId(g[1]);
  const d = s.match(/^d_(\d+)_(\d+)$/);
  if (d) return c2cConvId(d[1], d[2]);
  return s;
}

export function parseGroupIdFromConvId(convId) {
  const s = normalizeConvId(convId);
  const m = s.match(/^group_(\d+)$/);
  return m ? Number(m[1]) : null;
}

export function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const cfg = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    // 兼容旧版 gatewayWs（/v1/ws → /gateway/v1/ws）
    if (cfg.gatewayWs?.endsWith('/v1/ws') && !cfg.gatewayWs.includes('/gateway/')) {
      cfg.gatewayWs = cfg.gatewayWs.replace(/\/v1\/ws$/, '/gateway/v1/ws');
    }
    return cfg;
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(cfg) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export function trimBase(url) {
  return String(url || '').replace(/\/+$/, '');
}
