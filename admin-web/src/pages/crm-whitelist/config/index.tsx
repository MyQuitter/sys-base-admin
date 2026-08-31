import { Button, Card, Form, Input, InputNumber, Select, Space, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { getEnabledChains } from '@/api/blockchain';
import { getCrmWlConfig, saveCrmWlConfig, syncCrmTeamRelations, syncCrmWl, syncCrmWlJoins } from '@/api/crm-whitelist';
import { AuthButton } from '@/components/AuthButton';

import { toast } from '@/utils/toast';
/**
 * CrmToken 白名单合约配置：手动填写 Token / Business，并触发事件同步。
 */
export default function CrmWlConfigPage() {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [chains, setChains] = useState<Array<{ chainId: number; name: string }>>([]);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const [cfg, enabled] = await Promise.all([getCrmWlConfig(), getEnabledChains().catch(() => [])]);
      setChains(enabled);
      form.setFieldsValue({
        chainId: cfg.chainId ?? undefined,
        tokenAddress: cfg.tokenAddress || undefined,
        businessAddress: cfg.businessAddress || undefined,
        tokenAbiKey: cfg.tokenAbiKey || 'modular',
        traderStartBlock: cfg.traderStartBlock || '0',
        nodeStartBlock: cfg.nodeStartBlock || '0',
        relationStartBlock: cfg.relationStartBlock || '0',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const onSave = async () => {
    const values = await form.validateFields();
    setLoading(true);
    setSyncing(true);
    const hide = toast.loading('正在保存配置...', 0);
    try {
      const saved = await saveCrmWlConfig({
        chainId: values.chainId,
        tokenAddress: values.tokenAddress.trim(),
        businessAddress: values.businessAddress.trim(),
        tokenAbiKey: values.tokenAbiKey,
        traderStartBlock: String(values.traderStartBlock ?? '0'),
        nodeStartBlock: String(values.nodeStartBlock ?? '0'),
        relationStartBlock: String(values.relationStartBlock ?? '0'),
      });

      if (!saved.resetIndexed) {
        toast.success('配置已保存（地址/起始块未变，未清空索引）');
        await load();
        return;
      }

      hide();
      const syncHide = toast.loading('地址或起始块已变更，正在清空并重新同步...', 0);
      try {
        const [wl, team, joins] = await Promise.all([syncCrmWl(), syncCrmTeamRelations(), syncCrmWlJoins()]);
        const wlDone = wl.trader.caughtUp && wl.node.caughtUp;
        const parts = [
          wlDone
            ? `白名单已追上（交易 ${wl.trader.processed} / 节点 ${wl.node.processed}）`
            : `白名单部分同步至 ${wl.trader.syncedTo}/${wl.node.syncedTo}`,
          team.caughtUp
            ? `团队已追上（${team.processed} 条）`
            : `团队部分同步至 ${team.syncedTo}（${team.processed} 条）`,
          joins.caughtUp
            ? `入金已追上（${joins.processed} 条）`
            : `入金部分同步至 ${joins.syncedTo}（${joins.processed} 条）`,
        ];
        toast.success(
          `已清空重扫：${parts.join('；')}${wlDone && team.caughtUp && joins.caughtUp ? '' : '，可再点「立即同步事件」追平'}`,
        );
        await load();
      } finally {
        syncHide();
      }
    } catch (err: unknown) {
      toast.error((err as Error).message || '保存或同步失败');
    } finally {
      hide();
      setLoading(false);
      setSyncing(false);
    }
  };

  const onSync = async () => {
    setSyncing(true);
    try {
      const res = await syncCrmWl();
      const done = res.trader.caughtUp && res.node.caughtUp;
      toast.success(
        done
          ? `同步完成：交易 ${res.trader.processed} 条（至 ${res.trader.syncedTo}），节点 ${res.node.processed} 条（至 ${res.node.syncedTo}）`
          : `已部分同步：交易至 ${res.trader.syncedTo}、节点至 ${res.node.syncedTo}。未追上最新块，请再点一次「立即同步事件」`,
      );
      await load();
    } catch (err: unknown) {
      const e = err as { message?: string };
      toast.error(e.message ?? '同步失败');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card title="CrmToken 白名单 · 合约配置" loading={loading}>
      <Typography.Paragraph type="secondary">
        手动填写已部署的 Token / Business 地址；RPC 使用「链管理」中对应 chainId 的启用节点。写链由 MetaMask
        完成，服务端负责索引。入金与团队：启动时先扫历史块，之后可通过 Webhook（POST
        /api/crm-whitelist/hooks/logs）或链管理里的 wssUrls 实时入库。仅当地址或起始块变更时才会清空索引并重扫。
      </Typography.Paragraph>
      <Form form={form} layout="vertical" style={{ maxWidth: 640 }}>
        <Form.Item name="chainId" label="Chain ID" rules={[{ required: true, message: '请选择或填写 chainId' }]}>
          {chains.length ? (
            <Select
              options={chains.map((c) => ({ label: `${c.name} (${c.chainId})`, value: c.chainId }))}
              showSearch
              optionFilterProp="label"
            />
          ) : (
            <InputNumber style={{ width: '100%' }} min={1} placeholder="如 56" />
          )}
        </Form.Item>
        <Form.Item
          name="tokenAddress"
          label="Token 合约地址"
          rules={[{ required: true, message: '请填写 Token 地址' }]}
        >
          <Input placeholder="0x..." />
        </Form.Item>
        <Form.Item
          name="businessAddress"
          label="Business 合约地址"
          rules={[{ required: true, message: '请填写 Business 地址' }]}
        >
          <Input placeholder="0x..." />
        </Form.Item>
        <Form.Item name="tokenAbiKey" label="Token ABI" initialValue="modular">
          <Select
            options={[
              { label: 'CRAMTokenModular（模块化）', value: 'modular' },
              { label: 'CRMToken（单体）', value: 'legacy' },
            ]}
          />
        </Form.Item>
        <Form.Item name="traderStartBlock" label="交易白名单扫描起始块" initialValue="0">
          <Input />
        </Form.Item>
        <Form.Item name="nodeStartBlock" label="节点白名单扫描起始块" initialValue="0">
          <Input />
        </Form.Item>
        <Form.Item name="relationStartBlock" label="团队关系扫描起始块" initialValue="0">
          <Input />
        </Form.Item>
        <Space>
          <AuthButton
            type="primary"
            permission="crm-wl:config"
            loading={loading || syncing}
            onClick={() => void onSave()}
          >
            保存配置
          </AuthButton>
          <AuthButton permission="crm-wl:config" loading={syncing} onClick={() => void onSync()}>
            立即同步事件
          </AuthButton>
          <Button onClick={() => void load()}>刷新</Button>
        </Space>
      </Form>
    </Card>
  );
}
