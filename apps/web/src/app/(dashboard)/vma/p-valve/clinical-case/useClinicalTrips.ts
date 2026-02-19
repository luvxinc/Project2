'use client';

import { useState, useCallback } from 'react';
import { VMA_API as API, getAuthHeaders } from '@/lib/vma-api';
import type { Site, SpecOption, DSOption, LineItem, PickedProduct } from './types';
import type { Trip } from './TripListTable';

export function useClinicalTrips() {
  // ====== Trip List ======
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tripsLoading, setTripsLoading] = useState(true);

  // ====== Trip Modal ======
  const [tripModalOpen, setTripModalOpen] = useState(false);
  const [tripSiteId, setTripSiteId] = useState('');
  const [tripDate, setTripDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([]);
  const [tripSubmitting, setTripSubmitting] = useState(false);
  const [tripError, setTripError] = useState('');

  // ====== Trip Detail ======
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [tripDetail, setTripDetail] = useState<Record<string, unknown> | null>(null);
  const [tripDetailLoading, setTripDetailLoading] = useState(false);

  // ====== Sites + Products ======
  const [sites, setSites] = useState<Site[]>([]);
  const [pvSpecOptions, setPvSpecOptions] = useState<SpecOption[]>([]);
  const [dsOptions, setDsOptions] = useState<DSOption[]>([]);
  const [pvLines, setPvLines] = useState<LineItem[]>([{ specNo: '', qty: 1, picked: [], available: [], loading: false }]);
  const [dsLines, setDsLines] = useState<LineItem[]>([{ specNo: '', qty: 1, picked: [], available: [], loading: false }]);

  // ====== Fetch Trips ======
  const fetchTrips = useCallback(async () => {
    setTripsLoading(true);
    try {
      const res = await fetch(`${API}/vma/clinical-trips`, { headers: getAuthHeaders() });
      if (res.ok) setTrips(await res.json());
    } catch (e) { console.error('fetchTrips', e); }
    setTripsLoading(false);
  }, []);

  // ====== Fetch Sites + Spec Options ======
  const fetchSitesAndSpecs = useCallback(async () => {
    try {
      const [sitesRes, pvRes, dsRes] = await Promise.all([
        fetch(`${API}/vma/sites`, { headers: getAuthHeaders() }),
        fetch(`${API}/vma/pv-products`, { headers: getAuthHeaders() }),
        fetch(`${API}/vma/ds-products`, { headers: getAuthHeaders() }),
      ]);
      if (sitesRes.ok) setSites(await sitesRes.json());
      if (pvRes.ok) {
        const pvProds = await pvRes.json();
        setPvSpecOptions(pvProds.map((p: Record<string, string>) => ({
          specification: p.specification, model: p.model,
        })));
      }
      if (dsRes.ok) {
        const dsProds = await dsRes.json();
        setDsOptions(dsProds.map((d: Record<string, string>) => ({
          specification: d.specification, model: d.model,
        })));
      }
    } catch { /* non-critical: spec options will be empty */ }
  }, []);

  // ====== Auto Pick ======
  const autoPick = useCallback(async (type: 'pv' | 'ds', lineIndex: number, specNo: string, qty: number, _mode: 'modal' | 'detail') => {
    setPvLines(prev => type === 'pv' ? prev.map((l, i) => i === lineIndex ? { ...l, loading: true } : l) : prev);
    setDsLines(prev => type === 'ds' ? prev.map((l, i) => i === lineIndex ? { ...l, loading: true } : l) : prev);

    try {
      const res = await fetch(`${API}/vma/case-available-products`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          specNo,
          caseDate: tripDate,
          productType: type === 'pv' ? 'PVALVE' : 'DELIVERY_SYSTEM',
        }),
      });
      if (res.ok) {
        const allAvailable: PickedProduct[] = await res.json();
        const picked = allAvailable.slice(0, qty);
        const setLines = type === 'pv' ? setPvLines : setDsLines;
        setLines(prev => prev.map((l, i) =>
          i === lineIndex ? { ...l, picked, available: allAvailable, loading: false } : l
        ));
      }
    } catch { /* */ }
    setPvLines(prev => type === 'pv' ? prev.map((l, i) => i === lineIndex ? { ...l, loading: false } : l) : prev);
    setDsLines(prev => type === 'ds' ? prev.map((l, i) => i === lineIndex ? { ...l, loading: false } : l) : prev);
  }, [tripDate]);

  // ====== Swap Picked ======
  const swapPicked = useCallback((type: 'pv' | 'ds', lineIndex: number, pickedIndex: number, newProduct: PickedProduct, _mode: 'modal' | 'detail') => {
    const setLines = type === 'pv' ? setPvLines : setDsLines;
    setLines(prev => prev.map((l, i) => {
      if (i !== lineIndex) return l;
      const picked = [...l.picked];
      picked[pickedIndex] = newProduct;
      return { ...l, picked };
    }));
  }, []);

  // ====== Create Trip ======
  const handleCreateTrip = useCallback(async () => {
    setTripSubmitting(true);
    setTripError('');
    try {
      const items = [
        ...pvLines.flatMap(l => l.picked.map(p => ({
          specNo: p.specNo, serialNo: p.serialNo, qty: p.qty,
          productType: 'PVALVE', expDate: p.expDate, batchNo: p.batchNo,
        }))),
        ...dsLines.flatMap(l => l.picked.map(p => ({
          specNo: p.specNo, serialNo: p.serialNo, qty: p.qty,
          productType: 'DELIVERY_SYSTEM', expDate: p.expDate, batchNo: p.batchNo,
        }))),
      ];
      if (items.length === 0) { setTripError('No products picked'); setTripSubmitting(false); return; }
      if (selectedCaseIds.length === 0) { setTripError('No cases selected'); setTripSubmitting(false); return; }

      const res = await fetch(`${API}/vma/clinical-trips`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          tripDate, siteId: tripSiteId,
          caseIds: selectedCaseIds,
          items,
        }),
      });
      if (res.ok) {
        setTripModalOpen(false);
        resetTripModal();
        fetchTrips();
      } else {
        const data = await res.json().catch(() => null);
        setTripError(data?.message || 'Failed to create trip');
      }
    } catch (e: unknown) {
      setTripError(e instanceof Error ? e.message : 'Network error');
    }
    setTripSubmitting(false);
  }, [pvLines, dsLines, tripDate, tripSiteId, selectedCaseIds, fetchTrips]);

  // ====== Trip Detail ======
  const fetchTripDetail = useCallback(async (tripId: string) => {
    setTripDetailLoading(true);
    try {
      const res = await fetch(`${API}/vma/clinical-trips/${encodeURIComponent(tripId)}`, { headers: getAuthHeaders() });
      if (res.ok) setTripDetail(await res.json());
    } catch (e) { console.error('fetchTripDetail', e); }
    setTripDetailLoading(false);
  }, []);

  const handleTripClick = useCallback((trip: Trip) => {
    setSelectedTrip(trip);
    fetchTripDetail(trip.tripId);
  }, [fetchTripDetail]);

  const handleTripBack = useCallback(() => {
    setSelectedTrip(null);
    setTripDetail(null);
  }, []);

  // ====== Delete Trip ======
  const handleDeleteTrip = useCallback(async (tripId: string) => {
    try {
      const res = await fetch(`${API}/vma/clinical-trips/${encodeURIComponent(tripId)}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        setSelectedTrip(null);
        setTripDetail(null);
        fetchTrips();
      }
    } catch (e) { console.error('deleteTrip', e); }
  }, [fetchTrips]);

  // ====== Assign Items to Case ======
  const handleAssignToCase = useCallback(async (tripId: string, caseId: string, transactionIds: string[]) => {
    try {
      const res = await fetch(`${API}/vma/clinical-trips/${encodeURIComponent(tripId)}/assign`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ caseId, transactionIds }),
      });
      if (res.ok) {
        fetchTripDetail(tripId);
        fetchTrips();
      }
      return res.ok;
    } catch { return false; }
  }, [fetchTripDetail, fetchTrips]);

  // ====== Return Items ======
  const handleReturnItems = useCallback(async (tripId: string, transactionIds: string[]) => {
    try {
      const res = await fetch(`${API}/vma/clinical-trips/${encodeURIComponent(tripId)}/return`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ transactionIds }),
      });
      if (res.ok) {
        fetchTripDetail(tripId);
        fetchTrips();
      }
      return res.ok;
    } catch { return false; }
  }, [fetchTripDetail, fetchTrips]);

  // ====== Complete Trip ======
  const handleCompleteTrip = useCallback(async (tripId: string) => {
    try {
      const res = await fetch(`${API}/vma/clinical-trips/${encodeURIComponent(tripId)}/complete`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        fetchTripDetail(tripId);
        fetchTrips();
      }
      return res.ok;
    } catch { return false; }
  }, [fetchTripDetail, fetchTrips]);

  // ====== Add/Remove Case from Trip ======
  const handleAddCaseToTrip = useCallback(async (tripId: string, caseId: string) => {
    try {
      const res = await fetch(`${API}/vma/clinical-trips/${encodeURIComponent(tripId)}/add-case`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ caseId }),
      });
      if (res.ok) {
        fetchTripDetail(tripId);
        fetchTrips();
      }
      return res.ok;
    } catch { return false; }
  }, [fetchTripDetail, fetchTrips]);

  const handleRemoveCaseFromTrip = useCallback(async (tripId: string, caseId: string) => {
    try {
      const res = await fetch(`${API}/vma/clinical-trips/${encodeURIComponent(tripId)}/remove-case`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ caseId }),
      });
      if (res.ok) {
        fetchTripDetail(tripId);
        fetchTrips();
      }
      return res.ok;
    } catch { return false; }
  }, [fetchTripDetail, fetchTrips]);

  // ====== Reset Modal ======
  const resetTripModal = useCallback(() => {
    setTripSiteId('');
    setTripDate(new Date().toISOString().split('T')[0]);
    setSelectedCaseIds([]);
    setTripError('');
    setPvLines([{ specNo: '', qty: 1, picked: [], available: [], loading: false }]);
    setDsLines([{ specNo: '', qty: 1, picked: [], available: [], loading: false }]);
  }, []);

  return {
    // List
    trips, tripsLoading, fetchTrips,
    // Modal
    tripModalOpen, setTripModalOpen,
    tripSiteId, setTripSiteId,
    tripDate, setTripDate,
    selectedCaseIds, setSelectedCaseIds,
    tripSubmitting, tripError,
    handleCreateTrip, resetTripModal,
    // Products
    sites, pvSpecOptions, dsOptions,
    pvLines, setPvLines, dsLines, setDsLines,
    autoPick, swapPicked,
    fetchSitesAndSpecs,
    // Detail
    selectedTrip, tripDetail, tripDetailLoading,
    handleTripClick, handleTripBack,
    handleDeleteTrip,
    handleAssignToCase, handleReturnItems, handleCompleteTrip,
    handleAddCaseToTrip, handleRemoveCaseFromTrip,
    fetchTripDetail,
  };
}
