import { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react'
import client from '../api/client.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('vd_token'))
  const [user, setUser] = useState(null)
  const [rider, setRider] = useState(null)
  const [loading, setLoading] = useState(Boolean(token))

  const persistToken = (next) => {
    if (next) localStorage.setItem('vd_token', next)
    else {
      localStorage.removeItem('vd_token')
      localStorage.removeItem('vd_refresh_token')
    }
    setToken(next)
  }

  const persistRefreshToken = (next) => {
    if (next) localStorage.setItem('vd_refresh_token', next)
    else localStorage.removeItem('vd_refresh_token')
  }

  const refresh = useCallback(async () => {
    if (!localStorage.getItem('vd_token')) {
      setLoading(false)
      return null
    }
    try {
      const { data } = await client.get('/auth/me')
      setUser(data.user)
      setRider(data.rider)
      return data
    } catch {
      persistToken(null)
      setUser(null)
      setRider(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    const onRefreshed = (event) => {
      persistToken(event.detail.accessToken)
    }
    const onExpired = () => {
      persistToken(null)
      setUser(null)
      setRider(null)
    }
    window.addEventListener('auth:token-refreshed', onRefreshed)
    window.addEventListener('auth:session-expired', onExpired)
    return () => {
      window.removeEventListener('auth:token-refreshed', onRefreshed)
      window.removeEventListener('auth:session-expired', onExpired)
    }
  }, [])

  const login = useCallback(async (email, password) => {
    const { data } = await client.post('/auth/login', { email, password })
    persistToken(data.token)
    persistRefreshToken(data.refreshToken)
    setUser(data.user)
    setRider(data.rider)
    return data
  }, [])

  const register = useCallback(async (form, role = 'rider') => {
    const endpoint = role === 'customer' ? '/auth/register/customer' : '/auth/register/rider'
    const { data } = await client.post(endpoint, form)
    persistToken(data.token)
    persistRefreshToken(data.refreshToken)
    setUser(data.user)
    setRider(data.rider)
    return data
  }, [])

  const logout = useCallback(() => {
    const refreshToken = localStorage.getItem('vd_refresh_token')
    if (refreshToken) client.post('/auth/logout', { refreshToken }).catch((error) => {
      console.error('Failed to revoke refresh token:', error.message)
    })
    persistToken(null)
    setUser(null)
    setRider(null)
  }, [])

  const updateRider = useCallback((partial) => {
    setRider((prev) => ({ ...prev, ...partial }))
  }, [])

  const value = useMemo(
    () => ({
      token,
      user,
      rider,
      loading,
      isApproved: rider?.approvalStatus === 'approved' && rider?.isApproved,
      login,
      register,
      logout,
      refresh,
      updateRider,
    }),
    [token, user, rider, loading, login, register, logout, refresh, updateRider],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
