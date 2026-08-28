import type { MessageInstance } from 'antd/es/message/interface';
import { message as staticMessage } from 'antd';

/**
 * 全局 message API：由 App 内 message.useMessage / App.useApp 注入，
 * 避免静态 message 无法消费主题 Context 的控制台警告。
 */
let messageApi: MessageInstance | null = null;

export function setMessageApi(api: MessageInstance) {
  messageApi = api;
}

function api(): MessageInstance {
  return messageApi ?? staticMessage;
}

export const toast = {
  success: ((...args: Parameters<MessageInstance['success']>) => api().success(...args)) as MessageInstance['success'],
  error: ((...args: Parameters<MessageInstance['error']>) => api().error(...args)) as MessageInstance['error'],
  info: ((...args: Parameters<MessageInstance['info']>) => api().info(...args)) as MessageInstance['info'],
  warning: ((...args: Parameters<MessageInstance['warning']>) => api().warning(...args)) as MessageInstance['warning'],
  loading: ((...args: Parameters<MessageInstance['loading']>) => api().loading(...args)) as MessageInstance['loading'],
  open: ((...args: Parameters<MessageInstance['open']>) => api().open(...args)) as MessageInstance['open'],
  destroy: ((...args: Parameters<MessageInstance['destroy']>) => api().destroy(...args)) as MessageInstance['destroy'],
};
