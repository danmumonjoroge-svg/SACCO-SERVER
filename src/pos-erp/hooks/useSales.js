
import { useState, useEffect, useCallback } from 'react';
import { saleService } from '../services/saleService';
import { usePosErpAuth } from '../auth/usePosErpAuth';

export function useSales() {
  const { staffId } = usePosErpAuth();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ count: 0, page: 1, limit: 50 });

  const fetch = useCallback(async (params = {}) => {
    setLoading(true);
    const result = await saleService.getAll({ ...params });
    setSales(result.data || []);
    setPagination({ count: result.count || 0, page: result.page || 1, limit: result.limit || 50 });
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const create = useCallback(async (data) => {
    const payload = { ...data, cashier_id: staffId };
    const result = await saleService.create(payload);
    setSales(prev => [result, ...prev]);
    return result;
  }, [staffId]);

  return { sales, loading, pagination, fetch, create };
}
