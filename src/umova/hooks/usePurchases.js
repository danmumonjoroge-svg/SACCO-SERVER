
import { useState, useEffect, useCallback, useContext } from 'react';
import { purchaseRequestService, purchaseOrderService, goodsReceivedService, supplierReturnService } from '../services/purchaseService';
import { AuthContext } from '../context/authContext';

export function usePurchaseRequests(businessId, options = {}) {
  const { user } = useContext(AuthContext);
  const tenantId = user?.tenant_id;

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetch = useCallback(async (params = {}) => {
    if (!tenantId || !businessId) return;
    setLoading(true);
    try {
      const result = await purchaseRequestService.getAll({ tenantId, businessId, ...options, ...params });
      setRequests(result.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tenantId, businessId, options]);

  useEffect(() => { fetch(); }, [fetch]);

  const create = useCallback(async (data) => {
    const payload = { ...data, tenant_id: tenantId, business_id: businessId, requested_by: user?.id };
    const result = await purchaseRequestService.create(payload);
    setRequests(prev => [result, ...prev]);
    return result;
  }, [tenantId, businessId, user]);

  const updateStatus = useCallback(async (id, status) => {
    const result = await purchaseRequestService.updateStatus(id, status, tenantId);
    setRequests(prev => prev.map(r => r.id === id ? result : r));
    return result;
  }, [tenantId]);

  const convertToPO = useCallback(async (id) => {
    const result = await purchaseRequestService.convertToPO(id, tenantId);
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'CONVERTED' } : r));
    return result;
  }, [tenantId]);

  return { requests, loading, error, fetch, create, updateStatus, convertToPO };
}

export function usePurchaseOrders(businessId, options = {}) {
  const { user } = useContext(AuthContext);
  const tenantId = user?.tenant_id;

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetch = useCallback(async (params = {}) => {
    if (!tenantId || !businessId) return;
    setLoading(true);
    try {
      const result = await purchaseOrderService.getAll({ tenantId, businessId, ...options, ...params });
      setOrders(result.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tenantId, businessId, options]);

  useEffect(() => { fetch(); }, [fetch]);

  const create = useCallback(async (data) => {
    const payload = { ...data, tenant_id: tenantId, business_id: businessId, created_by: user?.id };
    const result = await purchaseOrderService.create(payload);
    setOrders(prev => [result, ...prev]);
    return result;
  }, [tenantId, businessId, user]);

  return { orders, loading, error, fetch, create };
}

export function useGoodsReceived(businessId, options = {}) {
  const { user } = useContext(AuthContext);
  const tenantId = user?.tenant_id;

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetch = useCallback(async (params = {}) => {
    if (!tenantId || !businessId) return;
    setLoading(true);
    try {
      const result = await goodsReceivedService.getAll({ tenantId, businessId, ...options, ...params });
      setRecords(result.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tenantId, businessId, options]);

  useEffect(() => { fetch(); }, [fetch]);

  const createFromPO = useCallback(async (poId, data) => {
    const result = await goodsReceivedService.createFromPO(poId, data, tenantId);
    setRecords(prev => [result, ...prev]);
    return result;
  }, [tenantId]);

  const createQuick = useCallback(async (data) => {
    const payload = { ...data, tenant_id: tenantId, business_id: businessId, received_by: user?.id };
    const result = await goodsReceivedService.createQuick(payload, tenantId);
    setRecords(prev => [result, ...prev]);
    return result;
  }, [tenantId, businessId, user]);

  return { records, loading, error, fetch, createFromPO, createQuick };
}

export function useSupplierReturns(businessId, options = {}) {
  const { user } = useContext(AuthContext);
  const tenantId = user?.tenant_id;

  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetch = useCallback(async (params = {}) => {
    if (!tenantId || !businessId) return;
    setLoading(true);
    try {
      const result = await supplierReturnService.getAll({ tenantId, businessId, ...options, ...params });
      setReturns(result.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tenantId, businessId, options]);

  useEffect(() => { fetch(); }, [fetch]);

  const create = useCallback(async (data) => {
    const payload = { ...data, tenant_id: tenantId, business_id: businessId, created_by: user?.id };
    const result = await supplierReturnService.create(payload);
    setReturns(prev => [result, ...prev]);
    return result;
  }, [tenantId, businessId, user]);

  return { returns, loading, error, fetch, create };
}
