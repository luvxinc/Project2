/**
 * Modal 组件导出
 * 
 * V2 Modal 架构:
 * 1. GlobalModal - 通用 Modal 管理器 (Context + Provider)
 * 2. LoginModal - 登录专用 Modal (两步流程)
 */

export { ModalProvider, useModal } from './GlobalModal';
export type { ModalOptions, ModalType } from './GlobalModal';

export { LoginModal } from './LoginModal';
