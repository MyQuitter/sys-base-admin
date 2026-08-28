import { Button, Card, Form, Input, Tabs } from 'antd';
import { useEffect, useState } from 'react';
import { changePassword, getProfile, updateProfile } from '@/api/auth';
import { useAuthStore } from '@/stores/useAuthStore';

import { toast } from '@/utils/toast';
/**
 * 个人中心：修改昵称与登录密码（需校验原密码）。
 */
export default function ProfilePage() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [profileForm] = Form.useForm();
  const [pwdForm] = Form.useForm();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getProfile().then((profile) => {
      profileForm.setFieldsValue({ username: profile.username, nickname: profile.nickname });
    });
  }, [profileForm]);

  const handleProfileSave = async () => {
    const values = await profileForm.validateFields();
    setLoading(true);
    try {
      const profile = await updateProfile({ nickname: values.nickname });
      if (accessToken) {
        setAuth(accessToken, {
          id: profile.id,
          username: profile.username,
          nickname: profile.nickname,
          permissions: useAuthStore.getState().userInfo?.permissions ?? [],
        });
      }
      toast.success('资料已更新');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSave = async () => {
    const values = await pwdForm.validateFields();
    if (values.newPassword !== values.confirmPassword) {
      toast.error('两次输入的新密码不一致');
      return;
    }
    await changePassword({ oldPassword: values.oldPassword, newPassword: values.newPassword });
    toast.success('密码已修改');
    pwdForm.resetFields();
  };

  return (
    <Card title="个人中心" style={{ maxWidth: 560 }}>
      <Tabs
        items={[
          {
            key: 'profile',
            label: '基本资料',
            children: (
              <Form form={profileForm} layout="vertical" onFinish={handleProfileSave}>
                <Form.Item name="username" label="用户名">
                  <Input disabled />
                </Form.Item>
                <Form.Item name="nickname" label="昵称">
                  <Input />
                </Form.Item>
                <Form.Item>
                  <Button type="primary" htmlType="submit" loading={loading}>
                    保存资料
                  </Button>
                </Form.Item>
              </Form>
            ),
          },
          {
            key: 'password',
            label: '修改密码',
            children: (
              <Form form={pwdForm} layout="vertical" onFinish={handlePasswordSave}>
                <Form.Item name="oldPassword" label="原密码" rules={[{ required: true, min: 6 }]}>
                  <Input.Password />
                </Form.Item>
                <Form.Item name="newPassword" label="新密码" rules={[{ required: true, min: 6 }]}>
                  <Input.Password />
                </Form.Item>
                <Form.Item name="confirmPassword" label="确认新密码" rules={[{ required: true, min: 6 }]}>
                  <Input.Password />
                </Form.Item>
                <Form.Item>
                  <Button type="primary" htmlType="submit">
                    修改密码
                  </Button>
                </Form.Item>
              </Form>
            ),
          },
        ]}
      />
    </Card>
  );
}
