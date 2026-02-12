import { redirect } from 'next/navigation';

/**
 * /login 路由 - 重定向到首页
 * 登录功能已集成在首页的模态框中
 */
export default function LoginPage() {
  redirect('/');
}
