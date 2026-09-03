
import { useState, useEffect, useCallback } from 'react';
import { inventoryService } from '../services/inventoryService';
import { usePosErpAuth } from '../auth/usePosErpAuth';

export function useInventory() {
  const { staffId } = usePosErpAuth();
  const [stock, setStock] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchStock = useCallback(async () => {
    setLoading(true);
    const data = await inventoryService.getAll();
    setStock(data || []);
    setLoading(false);
  }, []);

  const fetchMovements = useCallback(async (filters = {}) => {
    const data = await inventoryService.getMovements({ ...filters });
    setMovements(data || []);
  }, []);

  useEffect(() => { fetchStock(); fetchMovements(); }, [fetchStock, fetchMovements]);

  const adjust = useCallback(async (productId, quantity, reason) => {
    await inventoryService.adjustStock({ productId, quantity, reason, createdBy: staffId });
    await fetchStock(); await fetchMovements();
  }, [staffId, fetchStock, fetchMovements]);

  return { stock, movements, loading, fetchStock, fetchMovements, adjust };
}
