'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * P-Valve root page - redirects to the first sub-tab (Inventory)
 */
export default function PValvePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/vma/p-valve/inventory');
  }, [router]);

  return null;
}
