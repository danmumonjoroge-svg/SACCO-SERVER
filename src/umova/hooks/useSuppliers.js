
import { useState, useEffect, useCallback, useContext } from 'react';
import { supplierService } from '../services/supplierService';
import { AuthContext } from '../context/authContext';

export function useSuppliers(businessId, options = {}) {
  const { user } = useContext(AuthContext);
  const tenantId = user?.tenant_id;

  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({ count: 0, page: 1, limit: 50 });

  const fetchSuppliers = useCallback(async (params = {}) => {
    if (!tenantId || !businessId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await supplierService.getAll({
        tenantId,
        businessId,
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
  }, [tenantId, businessId, options]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  const createSupplier = useCallback(async (data) => {
    const payload = { ...data, tenant_id: tenantId, business_id: businessId, created_by: user?.id };
    const result = await supplierService.create(payload);
    setSuppliers(prev => [result, ...prev]);
    return result;
  }, [tenantId, businessId, user]);

  const updateSupplier = useCallback(async (id, updates) => {
    const result = await supplierService.update(id, { ...updates, updated_by: user?.id });
    setSuppliers(prev => prev.map(s => s.id === id ? result : s));
    return result;
  }, [user]);

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
