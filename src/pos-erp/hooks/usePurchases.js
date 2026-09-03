
import { useState, useEffect, useCallback } from 'react';
import { purchaseRequestService, purchaseOrderService, goodsReceivedService, supplierReturnService } from '../services/purchaseService';
import { usePosErpAuth } from '../auth/usePosErpAuth';

export function usePurchaseRequests(options = {}) {
  const { staffId } = usePosErpAuth();

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetch = useCallback(async (params = {}) => {
    setLoading(true);
    try {
      const result = await purchaseRequestService.getAll({ ...options, ...params });
      setRequests(result.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [options]);

  useEffect(() => { fetch(); }, [fetch]);

  const create = useCallback(async (data) => {
    const payload = { ...data, requested_by: staffId };
    const result = await purchaseRequestService.create(payload);
    setRequests(prev => [result, ...prev]);
    return result;
  }, [staffId]);

  const updateStatus = useCallback(async (id, status) => {
    const result = await purchaseRequestService.updateStatus(id, status);
    setRequests(prev => prev.map(r => r.id === id ? result : r));
    return result;
  }, []);

  const convertToPO = useCallback(async (id) => {
    const result = await purchaseRequestService.convertToPO(id);
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'CONVERTED' } : r));
    return result;
  }, []);

  return { requests, loading, error, fetch, create, updateStatus, convertToPO };
}

export function usePurchaseOrders(options = {}) {
  const { staffId } = usePosErpAuth();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetch = useCallback(async (params = {}) => {
    setLoading(true);
    try {
      const result = await purchaseOrderService.getAll({ ...options, ...params });
      setOrders(result.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [options]);

  useEffect(() => { fetch(); }, [fetch]);

  const create = useCallback(async (data) => {
    const payload = { ...data, created_by: staffId };
    const result = await purchaseOrderService.create(payload);
    setOrders(prev => [result, ...prev]);
    return result;
  }, [staffId]);

  return { orders, loading, error, fetch, create };
}

export function useGoodsReceived(options = {}) {
  const { staffId } = usePosErpAuth();

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetch = useCallback(async (params = {}) => {
    setLoading(true);
    try {
      const result = await goodsReceivedService.getAll({ ...options, ...params });
      setRecords(result.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [options]);

  useEffect(() => { fetch(); }, [fetch]);

  const createFromPO = useCallback(async (poId, data) => {
    const result = await goodsReceivedService.createFromPO(poId, { ...data, received_by: staffId });
    setRecords(prev => [result, ...prev]);
    return result;
  }, [staffId]);

  const createQuick = useCallback(async (data) => {
    const payload = { ...data, received_by: staffId };
    const result = await goodsReceivedService.createQuick(payload);
    setRecords(prev => [result, ...prev]);
    return result;
  }, [staffId]);

  return { records, loading, error, fetch, createFromPO, createQuick };
}

export function useSupplierReturns(options = {}) {
  const { staffId } = usePosErpAuth();

  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetch = useCallback(async (params = {}) => {
    setLoading(true);
    try {
      const result = await supplierReturnService.getAll({ ...options, ...params });
      setReturns(result.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [options]);

  useEffect(() => { fetch(); }, [fetch]);

  const create = useCallback(async (data) => {
    const payload = { ...data, created_by: staffId };
    const result = await supplierReturnService.create(payload);
    setReturns(prev => [result, ...prev]);
    return result;
  }, [staffId]);

  return { returns, loading, error, fetch, create };
}
