import Image from 'next/image';
import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { LandingPage } from '@/components/landing/LandingPage';

export default async function Home() {
  const t = await getTranslations();
  const cookieStore = await cookies();
  const locale = (cookieStore.get('locale')?.value as 'zh' | 'en' | 'vi') || 'zh';
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <LandingPage locale={locale} />
    </NextIntlClientProvider>
  );
}
