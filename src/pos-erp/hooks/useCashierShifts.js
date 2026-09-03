
import { useState, useEffect, useCallback } from 'react';
import { cashierService } from '../services/cashierService';
import { usePosErpAuth } from '../auth/usePosErpAuth';

export function useCashierShifts() {
  const { staffId } = usePosErpAuth();
  const [shifts, setShifts] = useState([]);
  const [activeShift, setActiveShift] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    const data = await cashierService.getShifts();
    setShifts(data || []);
    setActiveShift(data?.find(s => s.status === 'OPEN' && s.cashier_id === staffId) || null);
    setLoading(false);
  }, [staffId]);

  useEffect(() => { fetch(); }, [fetch]);

  const openShift = useCallback(async (openingFloat) => {
    const result = await cashierService.openShift({
      cashier_id: staffId, opening_float: openingFloat, status: 'OPEN'
    });
    setActiveShift(result);
    setShifts(prev => [result, ...prev]);
    return result;
  }, [staffId]);

  const closeShift = useCallback(async (actualCash, notes) => {
    if (!activeShift) return;
    const result = await cashierService.closeShift(activeShift.id, { actualCash, notes });
    setActiveShift(null);
    setShifts(prev => prev.map(s => s.id === result.id ? result : s));
    return result;
  }, [activeShift]);

  const cashMovement = useCallback(async (type, amount, reason) => {
    if (!activeShift) return;
    await cashierService.addCashMovement({
      shift_id: activeShift.id, movement_type: type, amount, reason, created_by: staffId
    });
  }, [activeShift, staffId]);

  return { shifts, activeShift, loading, fetch, openShift, closeShift, cashMovement };
}
