import axios from "axios";

const BASE_URL = "http://localhost:5001/api";

const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,          // send HttpOnly JWT cookies
  headers: { "Content-Type": "application/json" },
  timeout: 15000,
});

// ── Response interceptor: handle 401 → try token refresh → retry ─────────────
let isRefreshing = false;
let failedQueue = [];

function processQueue(error) {
  failedQueue.forEach(p => error ? p.reject(error) : p.resolve());
  failedQueue = [];
}

api.interceptors.response.use(
  res => res,
  async err => {
    const original = err.config;

    if (err.response?.status === 403 && err.response?.data?.code === "otp_required") {
      window.location.href = "/verify-otp";
      return Promise.reject(err);
    }

    const isTokenExpired =
      err.response?.status === 401 &&
      err.response?.data?.code === "token_expired" &&
      !original._retry;

    if (!isTokenExpired) return Promise.reject(err);
    if (original.url?.includes("/auth/refresh")) return Promise.reject(err);

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then(() => api(original)).catch(e => Promise.reject(e));
    }

    original._retry = true;
    isRefreshing = true;

    try {
      await api.post("/auth/refresh");
      processQueue(null);
      return api(original);
    } catch (refreshErr) {
      processQueue(refreshErr);
      window.dispatchEvent(new Event("auth:logout"));
      return Promise.reject(refreshErr);
    } finally {
      isRefreshing = false;
    }
  }
);

export default api;
