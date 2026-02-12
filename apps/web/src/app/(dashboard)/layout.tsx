import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { AppleNav } from '@/components/layout/AppleNav';
import { ThemedBackground } from '@/components/layout/ThemedBackground';
import { PermissionGuard } from '@/components/guards/PermissionGuard';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const locale = (cookieStore.get('locale')?.value as 'zh' | 'en' | 'vi') || 'zh';
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ThemedBackground>
        {/* Apple Style Navigation */}
        <AppleNav locale={locale} />
        
        {/* Main Content - 权限路由守卫 */}
        <main className="pt-11">
          <PermissionGuard>
            {children}
          </PermissionGuard>
        </main>
      </ThemedBackground>
    </NextIntlClientProvider>
  );
}
