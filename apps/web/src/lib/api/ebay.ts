/**
 * eBay API Client — OAuth 连接管理
 *
 * 简化流程: 凭证在后端环境变量, 前端只负责 redirect + callback
 */
import api from './client';

export interface SellerAccount {
  id: number;
  sellerUsername: string;
  displayName: string | null;
  status: string;       // pending / authorized / expired / revoked
  environment: string;  // PRODUCTION / SANDBOX
  lastSyncAt: string | null;
  tokenExpiry: string | null;
  hasRefreshToken: boolean;
  createdAt: string;
}

export interface AuthUrlResponse {
  authUrl: string;
}

export const ebayApi = {
  /** 获取 eBay OAuth 授权 URL (前端直接 redirect) */
  getAuthUrl: () => api.get<AuthUrlResponse>('/ebay/auth-url'),

  /** 提交 OAuth 回调 authorization_code → 自动创建/更新 seller */
  submitCallback: (code: string) => api.post<SellerAccount>('/ebay/callback', { code }),

  /** 获取所有已连接的卖家账户 */
  listSellers: () => api.get<SellerAccount[]>('/ebay/sellers'),

  /** 获取单个卖家详情 */
  getSeller: (username: string) => api.get<SellerAccount>(`/ebay/sellers/${username}`),

  /** 断开卖家账户 */
  deleteSeller: (username: string) => api.delete(`/ebay/sellers/${username}`),

  /** 手动刷新 Token */
  refreshToken: (username: string) => api.post<SellerAccount>(`/ebay/sellers/${username}/refresh-token`),
};
