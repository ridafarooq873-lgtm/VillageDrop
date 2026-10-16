import axios from 'axios'

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT from localStorage on every request
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('vd_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

let refreshRequest

client.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config
    const isAuthRequest = /\/auth\/(login|register|refresh-token|bootstrap-admin)(?:\?|$)/.test(
      originalRequest?.url || ''
    )
    const refreshToken = localStorage.getItem('vd_refresh_token')
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry &&
      !isAuthRequest && refreshToken) {
      originalRequest._retry = true
      try {
        refreshRequest ||= axios.post(
          `${client.defaults.baseURL.replace(/\/$/, '')}/auth/refresh-token`,
          { refreshToken }
        )
        const { data } = await refreshRequest
        localStorage.setItem('vd_token', data.accessToken)
        localStorage.setItem('vd_refresh_token', data.refreshToken)
        originalRequest.headers = originalRequest.headers || {}
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`
        window.dispatchEvent(new CustomEvent('auth:token-refreshed', {
          detail: { accessToken: data.accessToken },
        }))
        return client(originalRequest)
      } catch (refreshError) {
        localStorage.removeItem('vd_token')
        localStorage.removeItem('vd_refresh_token')
        window.dispatchEvent(new Event('auth:session-expired'))
        return Promise.reject(refreshError)
      } finally {
        refreshRequest = null
      }
    }
    const message =
      error.response?.data?.message || error.message || 'Something went wrong'
    return Promise.reject(Object.assign(error, { message }))
  },
)

export default client
