'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { ebayApi } from '@/lib/api/ebay';

/**
 * eBay OAuth Callback Page
 *
 * 路径: /ebay/callback/
 * eBay 授权完成后 redirect 到此页面，带有 ?code=xxx 参数。
 * 自动提交 code 到后端换取 token，然后跳转回管理页面。
 */

function CallbackHandler() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'processing' | 'success' | 'error' | 'declined'>('processing');
  const [message, setMessage] = useState('');
  const processedRef = useRef(false);

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    const code = searchParams.get('code');
    const decline = searchParams.get('decline');

    if (decline !== null) {
      setStatus('declined');
      setMessage('Authorization was declined. You can try again from the eBay Accounts page.');
      return;
    }

    if (!code) {
      setStatus('error');
      setMessage('No authorization code received from eBay.');
      return;
    }

    // Submit code to backend
    ebayApi.submitCallback(code)
      .then(() => {
        setStatus('success');
        setMessage('eBay account connected successfully! Redirecting...');
        setTimeout(() => {
          window.location.href = '/users/ebay-accounts';
        }, 2000);
      })
      .catch((err: any) => {
        setStatus('error');
        setMessage(err?.message || 'Failed to process authorization. Please try again.');
      });
  }, [searchParams]);

  const statusConfig = {
    processing: { icon: '⏳', title: 'Processing Authorization...', color: '#007aff', bg: '#007aff10' },
    success: { icon: '✅', title: 'Authorization Successful', color: '#34c759', bg: '#34c75910' },
    error: { icon: '❌', title: 'Authorization Failed', color: '#ff3b30', bg: '#ff3b3010' },
    declined: { icon: '🚫', title: 'Authorization Declined', color: '#ff9500', bg: '#ff950010' },
  };

  const config = statusConfig[status];

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#f5f5f7',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif',
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '20px',
        padding: '48px',
        maxWidth: '440px',
        width: '100%',
        textAlign: 'center',
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
      }}>
        {/* Icon */}
        <div style={{
          width: '72px',
          height: '72px',
          borderRadius: '18px',
          backgroundColor: config.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 24px',
          fontSize: '32px',
        }}>
          {status === 'processing' ? (
            <div style={{
              width: '32px',
              height: '32px',
              border: '3px solid #e5e5ea',
              borderTopColor: config.color,
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }} />
          ) : config.icon}
        </div>

        {/* Title */}
        <h1 style={{ fontSize: '22px', fontWeight: 600, color: '#1d1d1f', marginBottom: '12px' }}>
          {config.title}
        </h1>

        {/* Message */}
        <p style={{ fontSize: '15px', color: '#86868b', lineHeight: 1.6, marginBottom: '32px' }}>
          {message || (status === 'processing' ? 'Exchanging authorization code with eBay...' : '')}
        </p>

        {/* Actions */}
        {(status === 'error' || status === 'declined') && (
          <a
            href="/users/ebay-accounts"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '44px',
              padding: '0 24px',
              borderRadius: '12px',
              backgroundColor: '#007aff',
              color: '#ffffff',
              fontSize: '15px',
              fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            Back to eBay Accounts
          </a>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function EbayCallbackPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f5f5f7',
      }}>
        <div style={{
          width: '32px',
          height: '32px',
          border: '3px solid #e5e5ea',
          borderTopColor: '#007aff',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <CallbackHandler />
    </Suspense>
  );
}
