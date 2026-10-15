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

// Normalize API error messages
client.interceptors.response.use(
  (res) => res,
  (error) => {
    const message =
      error.response?.data?.message || error.message || 'Something went wrong'
    return Promise.reject(Object.assign(error, { message }))
  },
)

export default client
