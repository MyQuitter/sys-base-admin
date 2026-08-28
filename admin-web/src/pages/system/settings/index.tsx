import { Card, Form, Input, Radio, Select, Tabs, Typography } from 'antd';
import { useEffect, useState } from 'react';
import {
  clearSiteFavicon,
  clearSiteLogo,
  getSiteSetting,
  getSupportedChains,
  updateSiteSetting,
  uploadSiteFavicon,
  uploadSiteLogo,
  type SiteSetting,
} from '@/api/settings';
import { AuthButton } from '@/components/AuthButton';
import { ImageCropUpload } from '@/components/ImageCropUpload';
import { LOGIN_MODE_OPTIONS } from '@/constants/evm-chains';
import { useSiteStore } from '@/stores/useSiteStore';
import { withCacheBust } from '@/utils/branding';
import './settings.css';

import { toast } from '@/utils/toast';
/**
 * 系统设置页：站点信息与登录配置分 Tab 管理。
 */
export default function SystemSettingsPage() {
  const applySetting = useSiteStore((s) => s.applySetting);
  const siteName = useSiteStore((s) => s.siteName);
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('site');
  const [logoUrl, setLogoUrl] = useState<string>();
  const [faviconUrl, setFaviconUrl] = useState<string>();
  const [chainOptions, setChainOptions] = useState<{ label: string; value: number }[]>([]);

  const syncPreview = (setting: SiteSetting) => {
    setLogoUrl(withCacheBust(setting.logoUrl));
    setFaviconUrl(withCacheBust(setting.faviconUrl));
    applySetting(setting);
  };

  const loadSetting = async () => {
    setLoading(true);
    try {
      const setting = await getSiteSetting();
      const chains = await getSupportedChains();
      setChainOptions(chains.map((c) => ({ label: c.name, value: c.chainId })));
      form.setFieldsValue({
        siteName: setting.siteName,
        siteSubtitle: setting.siteSubtitle,
        loginMode: setting.loginMode,
        walletChainId: setting.walletChainId,
      });
      syncPreview(setting);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSetting();
  }, []);

  const handleSave = async () => {
    const values = await form.validateFields();
    const setting = await updateSiteSetting(values);
    syncPreview(setting);
    toast.success('保存成功');
  };

  const handleBrandingUpload =
    (upload: (file: File) => Promise<SiteSetting>) => async (file: File) => {
      const setting = await upload(file);
      syncPreview(setting);
      toast.success('上传成功');
    };

  const logoFallbackChar = siteName.slice(0, 1) || '默';

  const tabItems = [
    {
      key: 'site',
      label: '站点信息',
      children: (
        <>
          <Typography.Paragraph type="secondary">
            配置系统名称、副标题及品牌图标，保存后全站顶栏与浏览器标题同步更新。
          </Typography.Paragraph>
          <Form.Item
            name="siteName"
            label="系统名称"
            rules={[{ required: true, message: '请输入系统名称' }]}
          >
            <Input placeholder="显示在顶栏与浏览器标题" />
          </Form.Item>
          <Form.Item name="siteSubtitle" label="系统副标题">
            <Input placeholder="显示在顶栏名称下方" />
          </Form.Item>
          <Form.Item label="站点 Logo" extra="支持裁剪、缩放与旋转，输出 256×256 PNG">
            <div className="settings-branding-row">
              <div className={`settings-branding-preview${logoUrl ? '' : ' settings-branding-preview--placeholder'}`}>
                {logoUrl ? <img src={logoUrl} alt="logo" /> : logoFallbackChar}
              </div>
              <ImageCropUpload
                permission="setting:update"
                buttonText="上传 Logo"
                modalTitle="裁剪 Logo"
                aspect={1}
                outputSize={256}
                outputFileName="logo.png"
                onUpload={handleBrandingUpload(uploadSiteLogo)}
              />
              {logoUrl && (
                <AuthButton
                  permission="setting:update"
                  danger
                  onClick={async () => {
                    const setting = await clearSiteLogo();
                    syncPreview(setting);
                    toast.success('已清除 Logo');
                  }}
                >
                  清除
                </AuthButton>
              )}
            </div>
          </Form.Item>
          <Form.Item label="网站图标 Favicon" extra="支持裁剪、缩放与旋转，输出 64×64 PNG">
            <div className="settings-branding-row">
              <div
                className={`settings-branding-preview settings-branding-preview--sm${
                  faviconUrl ? '' : ' settings-branding-preview--empty'
                }`}
              >
                {faviconUrl ? <img src={faviconUrl} alt="favicon" /> : '无'}
              </div>
              <ImageCropUpload
                permission="setting:update"
                buttonText="上传图标"
                modalTitle="裁剪网站图标"
                accept="image/png,image/jpeg,image/gif,image/webp,image/x-icon,.ico"
                aspect={1}
                outputSize={64}
                outputFileName="favicon.png"
                onUpload={handleBrandingUpload(uploadSiteFavicon)}
              />
              {faviconUrl && (
                <AuthButton
                  permission="setting:update"
                  danger
                  onClick={async () => {
                    const setting = await clearSiteFavicon();
                    syncPreview(setting);
                    toast.success('已清除网站图标');
                  }}
                >
                  清除
                </AuthButton>
              )}
            </div>
          </Form.Item>
        </>
      ),
    },
    {
      key: 'login',
      label: '登录配置',
      children: (
        <>
          <Typography.Paragraph type="secondary">
            配置全站登录方式与钱包签名链。切换为钱包或双重验证前，须至少一名启用用户已绑定钱包。
          </Typography.Paragraph>
          <Form.Item name="loginMode" label="登录方式">
            <Radio.Group className="settings-login-mode-group">
              {LOGIN_MODE_OPTIONS.map((opt) => (
                <Radio key={opt.value} value={opt.value} className="settings-login-mode-option">
                  <span className="settings-login-mode-title">{opt.label}</span>
                  {opt.hint ? <span className="settings-login-mode-desc">{opt.hint}</span> : null}
                </Radio>
              ))}
            </Radio.Group>
          </Form.Item>
          <Form.Item name="walletChainId" label="钱包登录链">
            <Select options={chainOptions} placeholder="选择 EVM 链" style={{ maxWidth: 360 }} />
          </Form.Item>
        </>
      ),
    },
  ];

  return (
    <Card title="系统设置" loading={loading}>
      <Typography.Paragraph type="secondary">
        配置保存在服务端 `data/site.setting.json`，Logo 与网站图标保存在 `data/branding/` 目录。
      </Typography.Paragraph>

      <Form form={form} layout="vertical" style={{ maxWidth: 640 }}>
        <Tabs activeKey={activeTab} items={tabItems} onChange={setActiveTab} className="settings-tabs" />
        <Form.Item style={{ marginTop: 8, marginBottom: 0 }}>
          <AuthButton type="primary" permission="setting:update" onClick={handleSave}>
            保存设置
          </AuthButton>
        </Form.Item>
      </Form>
    </Card>
  );
}
