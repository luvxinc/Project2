'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { ebayApi, SellerAccount } from '@/lib/api/ebay';

/**
 * eBay Seller Accounts — OAuth 管理页面
 *
 * 路径: /users/ebay-accounts
 * 功能: 一键连接 eBay (redirect 到 eBay 登录) / 查看已连接账户 / 断开 / 刷新 Token
 * i18n: users.ebayAccounts.*
 */

// ─── Status Badge ───
function StatusBadge({ status, colors, t }: { status: string; colors: any; t: any }) {
  const config: Record<string, { bg: string; text: string; key: string }> = {
    authorized: { bg: `${colors.green}20`, text: colors.green, key: 'authorized' },
    pending:    { bg: `${colors.orange}20`, text: colors.orange, key: 'pending' },
    expired:    { bg: `${colors.red}20`, text: colors.red, key: 'expired' },
    revoked:    { bg: `${colors.red}20`, text: colors.red, key: 'revoked' },
  };
  const c = config[status] || config.pending;
  return (
    <span
      className="px-2.5 py-1 rounded-full text-[12px] font-medium"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      {t(`ebayAccounts.status.${c.key}`)}
    </span>
  );
}

// ─── Main Page ───
export default function EbayAccountsPage() {
  const t = useTranslations('users');
  const { theme } = useTheme();
  const colors = themeColors[theme];

  const [sellers, setSellers] = useState<SellerAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const loadSellers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await ebayApi.listSellers();
      setSellers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('Failed to load eBay sellers:', err);
      setSellers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSellers();
  }, [loadSellers]);

  // eBay OAuth 参数 (公开信息, 不含 secret)
  const EBAY_AUTH_URL = 'https://auth.ebay.com/oauth2/authorize';
  const EBAY_CLIENT_ID = 'AaronTon-ERP-PRD-3b46c198b-a9074e2f';
  const EBAY_RU_NAME = 'Aaron_Tong-AaronTon-ERP-PR-tspuspknv';
  const EBAY_SCOPES = [
    'https://api.ebay.com/oauth/api_scope',
    'https://api.ebay.com/oauth/api_scope/sell.marketing.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.marketing',
    'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.inventory',
    'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.account',
    'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
    'https://api.ebay.com/oauth/api_scope/sell.analytics.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.finances',
    'https://api.ebay.com/oauth/api_scope/sell.payment.dispute',
    'https://api.ebay.com/oauth/api_scope/commerce.identity.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.reputation',
    'https://api.ebay.com/oauth/api_scope/sell.reputation.readonly',
    'https://api.ebay.com/oauth/api_scope/commerce.notification.subscription',
    'https://api.ebay.com/oauth/api_scope/commerce.notification.subscription.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.stores',
    'https://api.ebay.com/oauth/api_scope/sell.stores.readonly',
    'https://api.ebay.com/oauth/scope/sell.edelivery',
    'https://api.ebay.com/oauth/api_scope/commerce.vero',
    'https://api.ebay.com/oauth/api_scope/sell.inventory.mapping',
    'https://api.ebay.com/oauth/api_scope/commerce.message',
    'https://api.ebay.com/oauth/api_scope/commerce.feedback',
    'https://api.ebay.com/oauth/api_scope/commerce.shipping',
  ].join(' ');

  /** 一键连接 eBay — 前端直接构建 URL 并 redirect */
  const handleConnect = () => {
    setConnecting(true);
    const authUrl = `${EBAY_AUTH_URL}?client_id=${encodeURIComponent(EBAY_CLIENT_ID)}&redirect_uri=${encodeURIComponent(EBAY_RU_NAME)}&response_type=code&scope=${encodeURIComponent(EBAY_SCOPES)}`;
    window.location.href = authUrl;
  };

  /** 重新授权 — 同样 redirect 到 eBay */
  const handleReAuth = () => {
    handleConnect();
  };

  const handleDelete = async (username: string) => {
    if (!confirm(t('ebayAccounts.confirm.deleteAccount', { name: username }))) return;
    try {
      await ebayApi.deleteSeller(username);
      await loadSellers();
    } catch (err: any) {
      alert(err?.message || t('ebayAccounts.errors.deleteFailed'));
    }
  };

  const handleRefreshToken = async (username: string) => {
    try {
      await ebayApi.refreshToken(username);
      await loadSellers();
    } catch (err: any) {
      alert(err?.message || t('ebayAccounts.errors.refreshFailed'));
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString();
  };

  return (
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen">
      {/* Header */}
      <section className="pt-12 pb-6 px-6">
        <div className="max-w-[1000px] mx-auto">
          <div className="flex items-end justify-between">
            <div>
              <h1 style={{ color: colors.text }} className="text-[32px] font-semibold tracking-tight mb-2">
                {t('ebayAccounts.pageTitle')}
              </h1>
              <p style={{ color: colors.textSecondary }} className="text-[17px]">
                {t('ebayAccounts.pageDescription')}
              </p>
            </div>

            <button
              onClick={handleConnect}
              disabled={connecting}
              className="h-10 px-5 rounded-xl text-sm font-medium flex items-center gap-2 transition-all hover:opacity-90 hover:scale-[1.02] disabled:opacity-50"
              style={{ backgroundColor: colors.blue, color: colors.white }}
            >
              {connecting ? (
                <div
                  className="w-4 h-4 border-2 rounded-full animate-spin"
                  style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }}
                />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
              )}
              {t('ebayAccounts.connectEbay')}
            </button>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="px-6 pb-16">
        <div className="max-w-[1000px] mx-auto">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div
                className="w-8 h-8 border-2 rounded-full animate-spin"
                style={{
                  borderLeftColor: colors.border,
                  borderRightColor: colors.border,
                  borderBottomColor: colors.border,
                  borderTopColor: colors.blue,
                }}
              />
            </div>
          ) : sellers.length === 0 ? (
            /* Empty State */
            <div
              className="rounded-2xl p-12 text-center"
              style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}
            >
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
                style={{ backgroundColor: `${colors.blue}10` }}
              >
                <svg className="w-8 h-8" fill="none" stroke={colors.blue} viewBox="0 0 24 24" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" />
                </svg>
              </div>
              <h3 style={{ color: colors.text }} className="text-lg font-semibold mb-2">
                {t('ebayAccounts.emptyTitle')}
              </h3>
              <p style={{ color: colors.textSecondary }} className="text-sm mb-5">
                {t('ebayAccounts.emptyDescription')}
              </p>
              <button
                onClick={handleConnect}
                disabled={connecting}
                className="h-9 px-5 rounded-lg text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-2"
                style={{ backgroundColor: colors.blue, color: colors.white }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
                {t('ebayAccounts.connectEbay')}
              </button>
            </div>
          ) : (
            /* Account Cards */
            <div className="space-y-4">
              {sellers.map(seller => (
                <div
                  key={seller.id}
                  className="rounded-2xl p-5 transition-all hover:scale-[1.005]"
                  style={{
                    backgroundColor: colors.bgSecondary,
                    border: `1px solid ${colors.border}`,
                    boxShadow: theme === 'dark'
                      ? '0 4px 16px rgba(0,0,0,0.2)'
                      : '0 2px 12px rgba(0,0,0,0.06)',
                  }}
                >
                  <div className="flex items-center justify-between">
                    {/* Left: Avatar + Info */}
                    <div className="flex items-center gap-4">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold"
                        style={{
                          backgroundColor: seller.status === 'authorized' ? `${colors.green}15` : `${colors.orange}15`,
                          color: seller.status === 'authorized' ? colors.green : colors.orange,
                        }}
                      >
                        {seller.sellerUsername.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 style={{ color: colors.text }} className="text-[16px] font-semibold">
                            {seller.sellerUsername}
                          </h3>
                          <StatusBadge status={seller.status} colors={colors} t={t} />
                        </div>
                        {seller.displayName && (
                          <p style={{ color: colors.textSecondary }} className="text-sm">
                            {seller.displayName}
                          </p>
                        )}
                        <div className="flex items-center gap-4 mt-1">
                          <span style={{ color: colors.textTertiary }} className="text-[11px]">
                            {t('ebayAccounts.card.tokenExpiry')}: {seller.tokenExpiry ? formatDate(seller.tokenExpiry) : t('ebayAccounts.card.tokenNotSet')}
                          </span>
                          <span style={{ color: colors.textTertiary }} className="text-[11px]">
                            {t('ebayAccounts.card.lastSync')}: {formatDate(seller.lastSyncAt)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2">
                      {seller.status !== 'authorized' ? (
                        <button
                          onClick={handleReAuth}
                          className="h-9 px-4 rounded-lg text-sm font-medium flex items-center gap-2 transition-all hover:opacity-90"
                          style={{ backgroundColor: colors.green, color: colors.white }}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                          </svg>
                          {t('ebayAccounts.actions.authorize')}
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => handleRefreshToken(seller.sellerUsername)}
                            className="h-9 px-4 rounded-lg text-sm font-medium flex items-center gap-2 transition-all hover:opacity-80"
                            style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
                            title={t('ebayAccounts.actions.refresh')}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                            </svg>
                            {t('ebayAccounts.actions.refresh')}
                          </button>
                          <button
                            onClick={handleReAuth}
                            className="h-9 px-4 rounded-lg text-sm font-medium flex items-center gap-2 transition-all hover:opacity-80"
                            style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
                            title={t('ebayAccounts.actions.reAuth')}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                            </svg>
                            {t('ebayAccounts.actions.reAuth')}
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleDelete(seller.sellerUsername)}
                        className="h-9 w-9 rounded-lg flex items-center justify-center transition-all hover:opacity-80"
                        style={{ backgroundColor: `${colors.red}10` }}
                        title={t('ebayAccounts.actions.delete')}
                      >
                        <svg className="w-4 h-4" fill="none" stroke={colors.red} viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Instructions */}
          <div
            className="rounded-2xl p-6 mt-8"
            style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}
          >
            <h3 style={{ color: colors.text }} className="text-[15px] font-semibold mb-4 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke={colors.textSecondary} viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
              {t('ebayAccounts.guide.title')}
            </h3>
            <ol style={{ color: colors.textSecondary }} className="text-sm space-y-2 list-decimal list-inside">
              <li>{t('ebayAccounts.guide.step1')}</li>
              <li>{t('ebayAccounts.guide.step2')}</li>
              <li>{t('ebayAccounts.guide.step3')}</li>
            </ol>
          </div>
        </div>
      </section>
    </div>
  );
}
