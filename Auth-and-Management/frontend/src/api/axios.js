/**
 * Axios instance configured for the QR Attendance API.
 *
 * - Base URL points to /api (proxied to Flask by Vite in dev).
 * - withCredentials ensures HttpOnly JWT cookies travel with every request.
 * - Response interceptor auto-refreshes expired access tokens using the
 *   refresh cookie, then retries the original request once.
 */
import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,           // always send cookies
  headers: { 'Content-Type': 'application/json' },
  timeout: 15_000,
})

// ── Request interceptor: nothing needed (cookies are sent automatically) ──

// ── Response interceptor: handle 401 → try token refresh → retry ──────────
let isRefreshing = false
let failedQueue = []

function processQueue(error) {
  failedQueue.forEach(p => error ? p.reject(error) : p.resolve())
  failedQueue = []
}

api.interceptors.response.use(
  res => res,
  async err => {
    const original = err.config

    if (err.response?.status === 403 &&
      err.response?.data?.code === 'otp_required') {
      window.location.href = '/verify-email'
      return Promise.reject(err)
    }

    const isTokenExpired =
      err.response?.status === 401 &&
      err.response?.data?.code === 'token_expired' &&
      !original._retry

    if (!isTokenExpired) return Promise.reject(err)

    // Prevent /auth/refresh from recursively retrying
    if (original.url?.includes('/auth/refresh')) return Promise.reject(err)

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject })
      }).then(() => api(original)).catch(e => Promise.reject(e))
    }

    original._retry = true
    isRefreshing = true

    try {
      await api.post('/auth/refresh')
      processQueue(null)
      return api(original)
    } catch (refreshErr) {
      processQueue(refreshErr)
      // Clear auth state — the AuthContext listens for this event
      window.dispatchEvent(new Event('auth:logout'))
      return Promise.reject(refreshErr)
    } finally {
      isRefreshing = false
    }
  }
)

export default api
