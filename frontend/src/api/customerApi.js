import api from './client.js'

export const getDashboard = () => api.get('/customer')
export const createOrder = (payload) => api.post('/customer/orders', payload)
export const getOrders = (params = {}) => api.get('/customer/orders', { params })
export const getOrderById = (id) => api.get(`/customer/orders/${id}`)
export const cancelOrder = (id, reason = '') =>
  api.put(`/customer/orders/${id}/cancel`, { reason })
export const addOrderItem = (id, item) => api.post(`/customer/orders/${id}/items`, item)
export const removeOrderItem = (id, itemId) =>
  api.delete(`/customer/orders/${id}/items/${itemId}`)
export const submitReview = (id, payload) =>
  api.post(`/customer/orders/${id}/reviews`, payload)
export const getMyReviews = () => api.get('/customer/reviews')
export const getNotifications = () => api.get('/customer/notifications')
export const markNotificationRead = (id) =>
  api.put(`/customer/notifications/${id}/read`)
export const submitComplaint = (payload) => api.post('/customer/complaints', payload)
export const getComplaints = () => api.get('/customer/complaints')
