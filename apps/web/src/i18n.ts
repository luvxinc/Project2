import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

// Chinese
import zhCommon from '../../../packages/shared/i18n/locales/zh/common.json';
import zhAuth from '../../../packages/shared/i18n/locales/zh/auth.json';
import zhHome from '../../../packages/shared/i18n/locales/zh/home.json';
import zhModules from '../../../packages/shared/i18n/locales/zh/modules.json';
import zhUsers from '../../../packages/shared/i18n/locales/zh/users.json';
import zhLanding from '../../../packages/shared/i18n/locales/zh/landing.json';
import zhChangelog from '../../../packages/shared/i18n/locales/zh/changelog.json';
import zhNav from '../../../packages/shared/i18n/locales/zh/nav.json';
import zhLogs from '../../../packages/shared/i18n/locales/zh/logs.json';
import zhProducts from '../../../packages/shared/i18n/locales/zh/products.json';
import zhPurchase from '../../../packages/shared/i18n/locales/zh/purchase.json';
import zhFinance from '../../../packages/shared/i18n/locales/zh/finance.json';
import zhVma from '../../../packages/shared/i18n/locales/zh/vma.json';
import zhInventory from '../../../packages/shared/i18n/locales/zh/inventory.json';
import zhSales from '../../../packages/shared/i18n/locales/zh/sales.json';
import zhBackup from '../../../packages/shared/i18n/locales/zh/backup.json';

// English
import enCommon from '../../../packages/shared/i18n/locales/en/common.json';
import enAuth from '../../../packages/shared/i18n/locales/en/auth.json';
import enHome from '../../../packages/shared/i18n/locales/en/home.json';
import enModules from '../../../packages/shared/i18n/locales/en/modules.json';
import enUsers from '../../../packages/shared/i18n/locales/en/users.json';
import enLanding from '../../../packages/shared/i18n/locales/en/landing.json';
import enChangelog from '../../../packages/shared/i18n/locales/en/changelog.json';
import enNav from '../../../packages/shared/i18n/locales/en/nav.json';
import enLogs from '../../../packages/shared/i18n/locales/en/logs.json';
import enProducts from '../../../packages/shared/i18n/locales/en/products.json';
import enPurchase from '../../../packages/shared/i18n/locales/en/purchase.json';
import enFinance from '../../../packages/shared/i18n/locales/en/finance.json';
import enVma from '../../../packages/shared/i18n/locales/en/vma.json';
import enInventory from '../../../packages/shared/i18n/locales/en/inventory.json';
import enSales from '../../../packages/shared/i18n/locales/en/sales.json';
import enBackup from '../../../packages/shared/i18n/locales/en/backup.json';

// Vietnamese (Only VMA — others fallback to EN per Iron Law R6)
import viVma from '../../../packages/shared/i18n/locales/vi/vma.json';

export const locales = ['zh', 'en', 'vi'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'zh';

const messages = {
  zh: {
    common: zhCommon,
    auth: zhAuth,
    home: zhHome,
    modules: zhModules,
    users: zhUsers,
    landing: zhLanding,
    changelog: zhChangelog,
    nav: zhNav,
    logs: zhLogs,
    products: zhProducts,
    purchase: zhPurchase,
    finance: zhFinance,
    vma: zhVma,
    inventory: zhInventory,
    sales: zhSales,
    backup: zhBackup,
  },
  en: {
    common: enCommon,
    auth: enAuth,
    home: enHome,
    modules: enModules,
    users: enUsers,
    landing: enLanding,
    changelog: enChangelog,
    nav: enNav,
    logs: enLogs,
    products: enProducts,
    purchase: enPurchase,
    finance: enFinance,
    vma: enVma,
    inventory: enInventory,
    sales: enSales,
    backup: enBackup,
  },
  // Vietnamese: Only VMA has real VI translations.
  // All other namespaces fallback to EN (Iron Law R6).
  vi: {
    common: enCommon,
    auth: enAuth,
    home: enHome,
    modules: enModules,
    users: enUsers,
    landing: enLanding,
    changelog: enChangelog,
    nav: enNav,
    logs: enLogs,
    products: enProducts,
    purchase: enPurchase, // Fallback to EN (no VI translations for purchase)
    finance: enFinance, // Fallback to EN
    inventory: enInventory, // Fallback to EN (no VI translations per R5)
    sales: enSales, // Fallback to EN
    backup: enBackup, // Fallback to EN
    vma: viVma, // ← Only VMA uses real Vietnamese
  },
};

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const locale = (cookieStore.get('locale')?.value as Locale) || defaultLocale;

  return {
    locale,
    messages: messages[locale],
  };
});

