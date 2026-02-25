'use client';

import { useTranslations } from 'next-intl';
import type { ThemeColorSet } from '@/contexts/ThemeContext';

interface Trip {
  tripId: string;
  tripDate: string;
  siteId: string;
  siteName?: string;
  operator: string;
  notes?: string;
  status: string;
  itemCount: number;
  caseCount: number;
  assignedCount: number;
}

interface TripListTableProps {
  trips: Trip[];
  loading: boolean;
  colors: ThemeColorSet;
  onTripClick: (trip: Trip) => void;
}

export default function TripListTable({ trips, loading, colors, onTripClick }: TripListTableProps) {
  const t = useTranslations('vma');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: `${colors.controlAccent}40`, borderTopColor: colors.controlAccent }} />
      </div>
    );
  }

  if (trips.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-sm" style={{ color: colors.textSecondary }}>No trips yet</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden border" style={{ borderColor: colors.border, backgroundColor: colors.bgSecondary }}>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderColor: colors.border }} className="border-b">
            <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider" style={{ color: colors.textSecondary }}>Trip ID</th>
            <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider" style={{ color: colors.textSecondary }}>Date</th>
            <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider" style={{ color: colors.textSecondary }}>Site</th>
            <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider" style={{ color: colors.textSecondary }}>Operator</th>
            <th className="text-center py-3 px-4 text-xs font-semibold uppercase tracking-wider" style={{ color: colors.textSecondary }}>Items</th>
            <th className="text-center py-3 px-4 text-xs font-semibold uppercase tracking-wider" style={{ color: colors.textSecondary }}>Assigned</th>
            <th className="text-center py-3 px-4 text-xs font-semibold uppercase tracking-wider" style={{ color: colors.textSecondary }}>Cases</th>
            <th className="text-center py-3 px-4 text-xs font-semibold uppercase tracking-wider" style={{ color: colors.textSecondary }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {trips.map((trip) => (
            <tr
              key={trip.tripId}
              onClick={() => onTripClick(trip)}
              className="border-b cursor-pointer transition-colors"
              style={{ borderColor: `${colors.border}80` }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = `${colors.controlAccent}0d`)}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <td className="py-2.5 px-4 font-medium" style={{ color: colors.controlAccent }}>{trip.tripId}</td>
              <td className="py-2.5 px-4" style={{ color: colors.text }}>{trip.tripDate}</td>
              <td className="py-2.5 px-4" style={{ color: colors.text }}>{trip.siteName || trip.siteId}</td>
              <td className="py-2.5 px-4" style={{ color: colors.text }}>{trip.operator || '—'}</td>
              <td className="py-2.5 px-4 text-center" style={{ color: colors.text }}>{trip.itemCount}</td>
              <td className="py-2.5 px-4 text-center" style={{ color: colors.text }}>
                {trip.assignedCount}/{trip.itemCount}
              </td>
              <td className="py-2.5 px-4 text-center" style={{ color: colors.text }}>{trip.caseCount}</td>
              <td className="py-2.5 px-4 text-center">
                <span
                  className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                  style={{
                    backgroundColor: trip.status === 'COMPLETED' ? `${colors.green}20` : `${colors.orange}20`,
                    color: trip.status === 'COMPLETED' ? colors.green : colors.orange,
                  }}
                >
                  {trip.status === 'COMPLETED' ? '✓ Completed' : '● Out'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type { Trip };
