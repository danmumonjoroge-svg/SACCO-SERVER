
import { useState, useEffect, useCallback } from 'react';
import { supplierService } from '../services/supplierService';
import { usePosErpAuth } from '../auth/usePosErpAuth';

export function useSuppliers(options = {}) {
  const { staffId } = usePosErpAuth();

  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({ count: 0, page: 1, limit: 50 });

  const fetchSuppliers = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const result = await supplierService.getAll({
        ...options,
        ...params,
      });
      setSuppliers(result.data || []);
      setPagination({
        count: result.count || 0,
        page: result.page || 1,
        limit: result.limit || 50,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [options]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  const createSupplier = useCallback(async (data) => {
    const payload = { ...data, created_by: staffId };
    const result = await supplierService.create(payload);
    setSuppliers(prev => [result, ...prev]);
    return result;
  }, [staffId]);

  const updateSupplier = useCallback(async (id, updates) => {
    const result = await supplierService.update(id, { ...updates, updated_by: staffId });
    setSuppliers(prev => prev.map(s => s.id === id ? result : s));
    return result;
  }, [staffId]);

  const deleteSupplier = useCallback(async (id) => {
    await supplierService.delete(id);
    setSuppliers(prev => prev.filter(s => s.id !== id));
  }, []);

  return {
    suppliers,
    loading,
    error,
    pagination,
    fetchSuppliers,
    createSupplier,
    updateSupplier,
    deleteSupplier,
  };
}
