
import { useState, useEffect, useCallback } from 'react';
import { productService } from '../services/productService';
import { usePosErpAuth } from '../auth/usePosErpAuth';

export function useProducts() {
  const { staffId } = usePosErpAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ count: 0, page: 1, limit: 50 });

  const fetch = useCallback(async (params = {}) => {
    setLoading(true);
    const result = await productService.getAll({ ...params });
    setProducts(result.data || []);
    setPagination({ count: result.count || 0, page: result.page || 1, limit: result.limit || 50 });
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const create = useCallback(async (data) => {
    const result = await productService.create({ ...data, created_by: staffId });
    setProducts(prev => [result, ...prev]);
    return result;
  }, [staffId]);

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
