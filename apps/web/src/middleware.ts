/**
 * Next.js Middleware - 路由保护
 * 
 * 安全策略:
 * 1. 未登录用户访问任何 /dashboard/** 路由 → 重定向到首页 (登录页)
 * 2. 首页 (/) 是公开的，用于登录
 * 3. 所有保护区域必须有有效的 accessToken
 * 
 * ⚠️ 这是企业级安全的第一道防线，不能有任何后门！
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// 公开路由 (不需要登录)
const PUBLIC_ROUTES = [
  '/',           // 首页 (登录页)
  '/api/health', // 健康检查
];

// 静态资源 (跳过检查)
const STATIC_PREFIXES = [
  '/_next',
  '/favicon.ico',
  '/logo.png',
  '/images',
  '/api',  // API 请求由后端验证 (通过 Next.js rewrite 代理)
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // 1. 跳过静态资源
  if (STATIC_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }
  
  // 2. 公开路由直接放行
  if (PUBLIC_ROUTES.includes(pathname)) {
    return NextResponse.next();
  }
  
  // 3. 检查认证 token (从 cookie 中读取)
  // 注意: accessToken 存储在 localStorage，middleware 无法访问
  // 所以我们在登录成功后也会设置一个 cookie 作为标记
  const authCookie = request.cookies.get('auth_session');
  
  if (!authCookie?.value) {
    // 未登录 → 重定向到首页
    const url = request.nextUrl.clone();
    url.pathname = '/';
    // 可选: 记录原始 URL 以便登录后跳转
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }
  
  // 4. 已登录，放行
  return NextResponse.next();
}

// 配置 matcher - 只匹配需要保护的路由
export const config = {
  matcher: [
    /*
     * 匹配所有路径除了:
     * - api (API 路由, 通过 Next.js rewrite 代理)
     * - _next/static (静态文件)
     * - _next/image (图片优化)
     * - favicon.ico, sitemap.xml, robots.txt
     */
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
