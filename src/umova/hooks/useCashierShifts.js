
import { useState, useEffect, useCallback, useContext } from 'react';
import { cashierService } from '../services/cashierService';
import { AuthContext } from '../context/authContext';

export function useCashierShifts(businessId, branchId) {
  const { user } = useContext(AuthContext);
  const tenantId = user?.tenant_id;
  const [shifts, setShifts] = useState([]);
  const [activeShift, setActiveShift] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!tenantId || !businessId) return;
    setLoading(true);
    const data = await cashierService.getShifts({ tenantId, businessId, branchId });
    setShifts(data || []);
    setActiveShift(data?.find(s => s.status === 'OPEN' && s.cashier_id === user?.id) || null);
    setLoading(false);
  }, [tenantId, businessId, branchId, user]);

  useEffect(() => { fetch(); }, [fetch]);

  const openShift = useCallback(async (openingFloat) => {
    const result = await cashierService.openShift({
      tenant_id: tenantId, business_id: businessId, branch_id: branchId,
      cashier_id: user?.id, opening_float: openingFloat, status: 'OPEN'
    });
    setActiveShift(result);
    setShifts(prev => [result, ...prev]);
    return result;
  }, [tenantId, businessId, branchId, user]);

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
      tenant_id: tenantId, business_id: businessId, branch_id: branchId,
      shift_id: activeShift.id, movement_type: type, amount, reason, created_by: user?.id
    });
  }, [activeShift, tenantId, businessId, branchId, user]);

  return { shifts, activeShift, loading, fetch, openShift, closeShift, cashMovement };
}
