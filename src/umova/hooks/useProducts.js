
import { useState, useEffect, useCallback, useContext } from 'react';
import { productService } from '../services/productService';
import { AuthContext } from '../context/authContext';

export function useProducts(businessId) {
  const { user } = useContext(AuthContext);
  const tenantId = user?.tenant_id;
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ count: 0, page: 1, limit: 50 });

  const fetch = useCallback(async (params = {}) => {
    if (!tenantId || !businessId) return;
    setLoading(true);
    const result = await productService.getAll({ tenantId, businessId, ...params });
    setProducts(result.data || []);
    setPagination({ count: result.count || 0, page: result.page || 1, limit: result.limit || 50 });
    setLoading(false);
  }, [tenantId, businessId]);

  useEffect(() => { fetch(); }, [fetch]);

  const create = useCallback(async (data) => {
    const result = await productService.create({ ...data, tenant_id: tenantId, business_id: businessId, created_by: user?.id });
    setProducts(prev => [result, ...prev]);
    return result;
  }, [tenantId, businessId, user]);

  const update = useCallback(async (id, updates) => {
    const result = await productService.update(id, updates);
    setProducts(prev => prev.map(p => p.id === id ? result : p));
    return result;
  }, []);

  const remove = useCallback(async (id) => {
    await productService.delete(id);
    setProducts(prev => prev.filter(p => p.id !== id));
  }, []);

  return { products, loading, pagination, fetch, create, update, remove };
}
