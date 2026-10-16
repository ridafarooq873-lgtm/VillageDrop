import api from './axios';

export const getAdminOverview = () => api.get('/admin/overview');
export const getAdminRiders = (status = 'pending') =>
  api.get('/admin/riders', { params: { status } });
export const reviewRider = (id, decision, reason = '') =>
  api.put(`/admin/riders/${id}/approval`, { decision, reason });
export const getAdminOrders = (status) =>
  api.get('/admin/orders', { params: status ? { status } : {} });
export const updateAdminOrder = (id, payload) =>
  api.put(`/admin/orders/${id}/status`, payload);
