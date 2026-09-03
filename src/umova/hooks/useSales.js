
import { useState, useEffect, useCallback, useContext } from 'react';
import { saleService } from '../services/saleService';
import { AuthContext } from '../context/authContext';

export function useSales(businessId, branchId) {
  const { user } = useContext(AuthContext);
  const tenantId = user?.tenant_id;
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ count: 0, page: 1, limit: 50 });

  const fetch = useCallback(async (params = {}) => {
    if (!tenantId || !businessId) return;
    setLoading(true);
    const result = await saleService.getAll({ tenantId, businessId, branchId, ...params });
    setSales(result.data || []);
    setPagination({ count: result.count || 0, page: result.page || 1, limit: result.limit || 50 });
    setLoading(false);
  }, [tenantId, businessId, branchId]);

  useEffect(() => { fetch(); }, [fetch]);

  const create = useCallback(async (data) => {
    const payload = { ...data, tenant_id: tenantId, business_id: businessId, branch_id: branchId, cashier_id: user?.id };
    const result = await saleService.create(payload);
    setSales(prev => [result, ...prev]);
    return result;
  }, [tenantId, businessId, branchId, user]);

  return { sales, loading, pagination, fetch, create };
}
