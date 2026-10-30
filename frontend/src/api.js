export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// '/todo' (Vite's base without the trailing slash); prefixed to every server URL.
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

function xsrfToken() {
  const m = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

async function request(method, url, body) {
  const headers = { 'X-XSRF-TOKEN': xsrfToken() };
  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + url, { method, headers, body: payload, credentials: 'same-origin' });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = await res.json();
      message = data.message || data.error || message;
    } catch { /* non-JSON error body */ }
    throw new ApiError(res.status, message);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : undefined;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body ?? {}),
  put: (url, body) => request('PUT', url, body),
  patch: (url, body) => request('PATCH', url, body),
  del: (url) => request('DELETE', url),
  logout: () => request('POST', '/api/auth/logout'),
};
