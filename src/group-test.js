import * as api from './api.js';
import { groupConvId, normalizeConvId, parseGroupIdFromConvId } from './config.js';
import { loadTestGroups, parseUserIds, saveTestGroup } from './group-store.js';

/** @param {(id: string) => HTMLElement} $ */
export function initGroupTest(ctx) {
  const { $, getConfig, requireToken, restCall, applyGroupTargets, wsConnected, logger } = ctx;

  function meId() {
    return ctx.getCurrentUserId() ?? Number($('userId').value);
  }

  function readGroupId() {
    return Number($('testGroupId').value.trim());
  }

  function resolveConvId(gid) {
    const fromInput = normalizeConvId($('testGroupConvId').value.trim());
    if (fromInput) return fromInput;
    return gid ? groupConvId(gid) : '';
  }

  function applyGroup(resp) {
    const gid = resp?.group?.id ?? resp?.id;
    const convId = normalizeConvId(resp?.conv_id) || (gid ? groupConvId(gid) : '');
    if (gid) $('testGroupId').value = String(gid);
    if (convId) $('testGroupConvId').value = convId;
    applyGroupTargets(gid, convId);
  }

  function renderGroupHistory() {
    const list = loadTestGroups();
    const el = $('testGroupHistory');
    el.innerHTML = '';
    if (!list.length) {
      el.innerHTML = '<p class="empty-hint">暂无记录。种子数据含 <code>group_1</code>，也可先建群。</p>';
      return;
    }
    for (const g of list) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'history-item';
      btn.innerHTML = `<strong>#${g.id}</strong> ${g.name || '未命名'}<span>${g.conv_id}</span>`;
      btn.addEventListener('click', () => {
        $('testGroupId').value = String(g.id);
        $('testGroupConvId').value = g.conv_id;
        applyGroupTargets(g.id, g.conv_id);
        logger.log('sys', '群', `已选中测试群 #${g.id}`);
      });
      el.append(btn);
    }
  }

  $('btnLoadSeedGroup').addEventListener('click', () => {
    $('testGroupId').value = '1';
    $('testGroupConvId').value = 'group_1';
    applyGroupTargets(1, 'group_1');
    logger.log('sys', '群', '已填入种子群 group_1（需 docker-seed / reset-dev-data）');
  });

  $('btnCreateSoloGroup').addEventListener('click', () => {
    const cfg = getConfig();
    const name = $('testGroupName').value.trim() || `调试群-${meId()}`;
    restCall('建群（仅自己）', async () => {
      const resp = await api.createGroup(cfg.groupApi, requireToken(), name, []);
      if (resp?.group) {
        saveTestGroup({
          id: resp.group.id,
          name: resp.group.name,
          conv_id: normalizeConvId(resp.conv_id),
          owner_id: resp.group.owner_id,
        });
        renderGroupHistory();
      }
      applyGroup(resp);
      return resp;
    });
  });

  $('btnGetGroup').addEventListener('click', () => {
    const gid = readGroupId();
    if (!gid) {
      logger.log('sys', '错误', '请填写 group_id');
      return;
    }
    const cfg = getConfig();
    restCall('群详情', () => api.getGroup(cfg.groupApi, requireToken(), gid));
  });

  $('btnListGroupMembers').addEventListener('click', () => {
    const gid = readGroupId();
    if (!gid) {
      logger.log('sys', '错误', '请填写 group_id');
      return;
    }
    const cfg = getConfig();
    restCall('群成员', async () => {
      const resp = await api.listGroupMembers(cfg.groupApi, requireToken(), gid);
      const ids = resp?.user_ids ?? [];
      const mine = meId();
      if (ids.includes(mine)) {
        $('joinStatus').textContent = '已是群成员；连接 WS 即可收群消息推送（无需 subscribe）';
        $('joinStatus').dataset.state = 'ok';
      } else {
        $('joinStatus').textContent = '你还不在群里，请让群主先拉你进群';
        $('joinStatus').dataset.state = 'warn';
      }
      return resp;
    });
  });

  $('btnAddMembers').addEventListener('click', () => {
    const gid = readGroupId();
    if (!gid) {
      logger.log('sys', '错误', '请填写 group_id');
      return;
    }
    const userIds = parseUserIds($('pullUserIds').value);
    if (!userIds.length) {
      logger.log('sys', '错误', '请填写要拉入的 user_id');
      return;
    }
    const cfg = getConfig();
    restCall('拉人进群', async () => {
      const resp = await api.addGroupMembers(cfg.groupApi, requireToken(), gid, userIds);
      const members = await api.listGroupMembers(cfg.groupApi, requireToken(), gid);
      return { ...resp, added: userIds, members };
    });
  });

  $('btnPullSelfOther').addEventListener('click', () => {
    const other = Number($('pullPresetUid').value);
    if (!other) return;
    $('pullUserIds').value = String(other);
  });

  $('btnApplyGroupTargets').addEventListener('click', () => {
    const gid = readGroupId();
    const convId = resolveConvId(gid);
    if (!gid) {
      logger.log('sys', '错误', '请填写 group_id');
      return;
    }
    applyGroupTargets(gid, convId);
    logger.log('sys', '群', `已同步 conv_id=${convId}，group_id=${gid}`);
  });

  $('btnJoinRefreshConv').addEventListener('click', () => {
    const gid = readGroupId();
    if (!gid) {
      logger.log('sys', '错误', '请填写 group_id');
      return;
    }
    const convId = resolveConvId(gid);
    applyGroupTargets(gid, convId);
    const cfg = getConfig();
    restCall('加入验证（会话列表）', async () => {
      const conv = await api.listConversations(cfg.convApi, requireToken());
      const hit = (conv?.conversations ?? []).find(
        (c) => normalizeConvId(c.id) === convId || c.group_id === gid,
      );
      if (hit) {
        $('joinStatus').textContent = `已在会话列表：type=${hit.type} 未读=${hit.unread} last_seq=${hit.last_seq}`;
        $('joinStatus').dataset.state = 'ok';
      } else {
        $('joinStatus').textContent = '会话列表中尚无此群，确认已被拉入或稍后再试';
        $('joinStatus').dataset.state = 'warn';
      }
      return { conv_id: convId, in_list: Boolean(hit), conversation: hit ?? null };
    });
  });

  $('btnJoinCheckWs').addEventListener('click', () => {
    const gid = readGroupId();
    if (!gid) {
      logger.log('sys', '错误', '请填写 group_id');
      return;
    }
    applyGroupTargets(gid, resolveConvId(gid));
    if (wsConnected()) {
      $('joinStatus').textContent = 'WebSocket 已连接，在线即可收 group/c2c 下行推送';
      $('joinStatus').dataset.state = 'ok';
      logger.log('sys', 'WS', '已连接。文档：无需 subscribe_group，保持 WS + ping 即可');
    } else {
      $('joinStatus').textContent = '请先在设置中连接 WebSocket';
      $('joinStatus').dataset.state = 'warn';
      logger.log('sys', '错误', 'WebSocket 未连接');
    }
  });

  renderGroupHistory();

  return { renderGroupHistory, applyGroup, parseGroupIdFromConvId };
}
