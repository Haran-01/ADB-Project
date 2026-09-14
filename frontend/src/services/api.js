const baseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:4000/api';
const token = import.meta.env.VITE_API_TOKEN;

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(body.error ?? `Request failed (${response.status})`, response.status, body);
  return body;
}

const list = async (path) => (await request(path)).data;
export const api = {
  health: () => request('/health'),
  stations: () => list('/stations?limit=200'),
  tracks: () => list('/tracks?limit=200'),
  trains: () => list('/trains?limit=200'),
  journeys: () => list('/journeys/active?limit=200'),
  disruptions: () => list('/disruptions?limit=200'),
  events: () => list('/events?limit=100'),
  map: () => request('/network/map'),
  progress: async (id) => (await request(`/disruptions/${id}/progress`)).data,
  affected: (id) => list(`/disruptions/${id}/affected-trains?limit=200`),
  recommendations: (id) => list(`/disruptions/${id}/recommendations?limit=200`),
  createDisruption: (input) => request('/disruptions', { method: 'POST', body: JSON.stringify(input) }),
  analyze: (id) => request(`/disruptions/${id}/analyze`, { method: 'POST' }),
  applyRecommendation: (id) => request(`/recommendations/${id}/apply`, { method: 'POST' }),
};

export const socketConfig = {
  url: import.meta.env.VITE_SOCKET_URL ?? 'http://127.0.0.1:4000',
  options: { auth: token ? { token } : {}, transports: ['websocket', 'polling'] },
};
