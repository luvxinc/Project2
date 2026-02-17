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
import zhVma from '../../../packages/shared/i18n/locales/zh/vma.json';

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
import enVma from '../../../packages/shared/i18n/locales/en/vma.json';

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
    vma: zhVma,
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
    vma: enVma,
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

