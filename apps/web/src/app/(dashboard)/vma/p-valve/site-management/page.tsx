'use client';

import { useTheme, themeColors } from '@/contexts/ThemeContext';
import { useState } from 'react';
import { useSites, useCreateSite, useUpdateSite } from '@/lib/hooks/use-vma-queries';
import PValveTabSelector from '../components/PValveTabSelector';

interface Site {
  siteId: string;
  siteName: string;
  address: string;
  address2: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

const emptySite: Site = {
  siteId: '',
  siteName: '',
  address: '',
  address2: '',
  city: '',
  state: '',
  zipCode: '',
  country: '',
};

export default function SiteManagementPage() {
  const { theme } = useTheme();
  const colors = themeColors[theme];

  // React Query: replaces raw fetch + useState + useEffect
  const { data: sites = [], isLoading: loading } = useSites();
  const createSite = useCreateSite();
  const updateSite = useUpdateSite();

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<Site>({ ...emptySite });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const openCreate = () => {
    setForm({ ...emptySite });
    setEditMode(false);
    setError('');
    setModalOpen(true);
  };

  const openEdit = (site: Site) => {
    setForm({ ...site });
    setEditMode(true);
    setError('');
    setModalOpen(true);
  };

  const handleSave = async () => {
    const errors: string[] = [];
    if (!form.siteId.trim()) errors.push('Site ID');
    if (!form.siteName.trim()) errors.push('Site Name');
    if (!form.address.trim()) errors.push('Address');
    if (!form.city.trim()) errors.push('City');
    if (!form.state.trim()) errors.push('State');
    if (!form.zipCode.trim()) errors.push('Zip Code');
    if (!form.country.trim()) errors.push('Country');
    if (errors.length > 0) {
      setError(`Required: ${errors.join(', ')}`);
      return;
    }

    setSaving(true);
    setError('');
    try {
      if (editMode) {
        await updateSite.mutateAsync({ siteId: form.siteId, data: form });
      } else {
        await createSite.mutateAsync(form);
      }
      setModalOpen(false);
    } catch (e: any) {
      setError(e?.message || 'Failed to save');
    }
    setSaving(false);
  };

  const columns = ['Site ID', 'Site Name', 'Address', 'Address 2', 'City', 'State', 'Zip', 'Country'];

  return (
    <div style={{ backgroundColor: colors.bg }} className="min-h-screen pb-20">
      {/* Apple 风格 Header + Tab Selector */}
      <section className="pt-12 pb-6 px-6">
        <div className="max-w-[1200px] mx-auto">
          <PValveTabSelector />
        </div>
      </section>

      {/* Content */}
      <div className="max-w-[1200px] mx-auto px-6 pb-6">
        {/* Action Bar */}
        <div className="flex items-center justify-between mb-6">
          <p style={{ color: colors.textSecondary }} className="text-[13px]">
            Manage hospital and clinic site records
          </p>
          <button
            onClick={openCreate}
            style={{ backgroundColor: colors.blue }}
            className="px-4 py-2 rounded-xl text-white text-sm font-medium hover:opacity-90 transition flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Site
          </button>
        </div>

        {/* Table */}
        <div
          style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
          className="rounded-2xl border overflow-hidden"
        >
          <table className="w-full">
            <thead>
              <tr style={{ backgroundColor: colors.bgTertiary }}>
                {columns.map((col) => (
                  <th
                    key={col}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                    style={{ color: colors.textSecondary }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center" style={{ color: colors.textTertiary }}>
                    <span className="text-[15px]">Loading sites...</span>
                  </td>
                </tr>
              ) : sites.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center" style={{ color: colors.textTertiary }}>
                    <p className="text-[15px] font-medium">No sites found</p>
                    <p className="text-[13px] mt-1">Click &quot;Add Site&quot; to create your first site.</p>
                  </td>
                </tr>
              ) : (
                sites.map((site, idx) => (
                  <tr
                    key={site.siteId}
                    onClick={() => openEdit(site)}
                    style={{
                      borderTop: idx > 0 ? `1px solid ${colors.border}` : 'none',
                      cursor: 'pointer',
                    }}
                    className="hover:opacity-80 transition-opacity"
                  >
                    <td className="px-4 py-3 text-[13px] font-mono font-semibold" style={{ color: colors.controlAccent }}>
                      {site.siteId}
                    </td>
                    <td className="px-4 py-3 text-[13px] font-medium" style={{ color: colors.text }}>
                      {site.siteName}
                    </td>
                    <td className="px-4 py-3 text-[13px]" style={{ color: colors.textSecondary }}>
                      {site.address}
                    </td>
                    <td className="px-4 py-3 text-[13px]" style={{ color: colors.textTertiary }}>
                      {site.address2 || '—'}
                    </td>
                    <td className="px-4 py-3 text-[13px]" style={{ color: colors.textSecondary }}>
                      {site.city}
                    </td>
                    <td className="px-4 py-3 text-[13px]" style={{ color: colors.textSecondary }}>
                      {site.state}
                    </td>
                    <td className="px-4 py-3 text-[13px]" style={{ color: colors.textSecondary }}>
                      {site.zipCode}
                    </td>
                    <td className="px-4 py-3 text-[13px]" style={{ color: colors.textSecondary }}>
                      {site.country}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== Add / Edit Modal ===== */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}
          onClick={() => { if (!saving) setModalOpen(false); }}
        >
          <div
            className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
            style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border, border: `1px solid ${colors.border}` }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: colors.border }}>
              <h3 className="text-[16px] font-semibold" style={{ color: colors.text }}>
                {editMode ? 'Edit Site' : 'Add New Site'}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                disabled={saving}
                className="w-8 h-8 flex items-center justify-center rounded-full transition-colors hover:bg-gray-500/20"
                style={{ color: colors.textSecondary }}
              >✕</button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-5 space-y-4">
              {/* Site ID */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
                  style={{ color: colors.textSecondary }}>
                  Site ID *
                </label>
                <input
                  type="text"
                  value={form.siteId}
                  onChange={(e) => setForm((p) => ({ ...p, siteId: e.target.value }))}
                  disabled={editMode}
                  maxLength={10}
                  placeholder="e.g. 001"
                  className="w-full px-3 py-2 rounded-lg text-[13px] border transition-colors focus:outline-none"
                  style={{
                    backgroundColor: colors.bg,
                    borderColor: colors.border,
                    color: colors.text,
                    opacity: editMode ? 0.5 : 1,
                  }}
                />
              </div>

              {/* Site Name */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
                  style={{ color: colors.textSecondary }}>
                  Site Name *
                </label>
                <input
                  type="text"
                  value={form.siteName}
                  onChange={(e) => setForm((p) => ({ ...p, siteName: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-[13px] border transition-colors focus:outline-none"
                  style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}
                />
              </div>

              {/* Address Line 1 */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
                  style={{ color: colors.textSecondary }}>
                  Address Line 1 *
                </label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                  placeholder="Street address"
                  className="w-full px-3 py-2 rounded-lg text-[13px] border transition-colors focus:outline-none"
                  style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}
                />
              </div>

              {/* Address Line 2 (optional) */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
                  style={{ color: colors.textSecondary }}>
                  Address Line 2
                </label>
                <input
                  type="text"
                  value={form.address2}
                  onChange={(e) => setForm((p) => ({ ...p, address2: e.target.value }))}
                  placeholder="Suite, building, floor (optional)"
                  className="w-full px-3 py-2 rounded-lg text-[13px] border transition-colors focus:outline-none"
                  style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}
                />
              </div>

              {/* City + State */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
                    style={{ color: colors.textSecondary }}>
                    City *
                  </label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-[13px] border transition-colors focus:outline-none"
                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
                    style={{ color: colors.textSecondary }}>
                    State *
                  </label>
                  <input
                    type="text"
                    value={form.state}
                    onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-[13px] border transition-colors focus:outline-none"
                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}
                  />
                </div>
              </div>

              {/* Zip Code + Country */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
                    style={{ color: colors.textSecondary }}>
                    Zip Code *
                  </label>
                  <input
                    type="text"
                    value={form.zipCode}
                    onChange={(e) => setForm((p) => ({ ...p, zipCode: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-[13px] border transition-colors focus:outline-none"
                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
                    style={{ color: colors.textSecondary }}>
                    Country *
                  </label>
                  <input
                    type="text"
                    value={form.country}
                    onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-[13px] border transition-colors focus:outline-none"
                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}
                  />
                </div>
              </div>

              {/* Error message */}
              {error && (
                <p className="text-[12px] text-red-500 font-medium">{error}</p>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: colors.border }}>
              <button
                onClick={() => setModalOpen(false)}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-sm font-medium transition hover:opacity-80"
                style={{ color: colors.textSecondary }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 rounded-xl text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
                style={{ backgroundColor: colors.blue }}
              >
                {saving ? 'Saving...' : editMode ? 'Save Changes' : 'Create Site'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
