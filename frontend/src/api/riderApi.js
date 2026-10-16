import api from './axios';

export const getRiderOrders = () => api.get('/rider/orders');
export const setRiderAvailability = (isAvailable) =>
  api.put('/rider/availability', { isAvailable });
export const acceptRiderOrder = (id) => api.put(`/rider/orders/${id}/accept`);
export const updateRiderOrder = (id, payload) =>
  api.put(`/rider/orders/${id}/status`, payload);
export const getRiderNotifications = () => api.get('/rider/notifications');
export const markRiderNotificationRead = (id) => api.put(`/rider/notifications/${id}/read`);
