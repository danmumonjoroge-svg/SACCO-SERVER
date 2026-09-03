
import { useState, useEffect, useCallback, useContext } from 'react';
import { inventoryService } from '../services/inventoryService';
import { AuthContext } from '../context/authContext';

export function useInventory(businessId, branchId) {
  const { user } = useContext(AuthContext);
  const tenantId = user?.tenant_id;
  const [stock, setStock] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchStock = useCallback(async () => {
    if (!tenantId || !businessId) return;
    setLoading(true);
    const data = await inventoryService.getAll({ tenantId, businessId, branchId });
    setStock(data || []);
    setLoading(false);
  }, [tenantId, businessId, branchId]);

  const fetchMovements = useCallback(async (filters = {}) => {
    if (!tenantId || !businessId) return;
    const data = await inventoryService.getMovements({ tenantId, businessId, branchId, ...filters });
    setMovements(data || []);
  }, [tenantId, businessId, branchId]);

  useEffect(() => { fetchStock(); fetchMovements(); }, [fetchStock, fetchMovements]);

  const adjust = useCallback(async (productId, quantity, reason) => {
    await inventoryService.adjustStock({ tenantId, businessId, branchId, productId, quantity, reason, createdBy: user?.id });
    await fetchStock(); await fetchMovements();
  }, [tenantId, businessId, branchId, user, fetchStock, fetchMovements]);

  return { stock, movements, loading, fetchStock, fetchMovements, adjust };
}
