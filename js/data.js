// ===================== CATÁLOGOS DEL SISTEMA =====================

const GRUPOS = [
  '6-1','6-2','8-1','8-2','9-1','9-2','9-3','9-4','9-5','9-6',
  '10-1','10-2','10-3','10-4','10-5','10-6','10-7',
  '11-1','11-2','11-3','11-4','11-5','11-6','11-7'
];

const PROFESORES = [
  'Wilmer Ríos','Ruth Estrada','Rubén Darío Gómez','Yesica Mosquera',
  'Nevardo Alzate','Jorge Omar Velásquez','Diana Ramírez','Alexandra Giraldo',
  'Vilma Ospina','Henry Durango','Natalia Agudelo','Cristina Carmona',
  'Mauricio Toro','Andrea Orrego','Natalia Cano','Paola Castañeda',
  'Freddy Fernández','Eduard Tobón','Alejandro Gutiérrez','Luz Nodier García',
  'Gabriel Graciano','Luis Fernando Velásquez','Mauricio Valencia','Daniel José Muñoz',
  'Manedy','Ruth Valencia','Laura','Daniel','Yan Pol','María Eugenia',
  'Jonny','Jonathan','Gabriel','Leady','Armando','Miguel','Fredy','Ángela','Echandía','Keila'
];

const HORAS = ['6:00','7:00','8:00','9:00','10:00','11:00','12:00','13:00','14:00','15:00'];
const DIAS = ['Lunes','Martes','Miércoles','Jueves','Viernes'];

const MATERIAS = [
  'Matemáticas','Español','Ciencias Naturales','Historia','Geografía',
  'Educación Física','Inglés','Arte','Ética','Filosofía','Química','Física','Biología'
];

const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3000' : '';

function getSession() {
  const raw = sessionStorage.getItem('session');
  return raw ? JSON.parse(raw) : null;
}

function setSession(session) {
  sessionStorage.setItem('session', JSON.stringify(session));
}

function clearSession() {
  sessionStorage.removeItem('session');
}

function requireAuth() {
  const session = getSession();
  if (!session?.token) {
    window.location.href = 'index.html';
    return null;
  }
  return session;
}

async function apiRequest(path, options = {}) {
  const session = getSession();
  const headers = new Headers(options.headers || {});
  if (session?.token) headers.set('Authorization', `Bearer ${session.token}`);
  if (options.body && !headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const message = payload && payload.message ? payload.message : 'Error al conectar con el servidor';
    throw new Error(message);
  }
  return payload;
}

function apiJson(path, options = {}) {
  return apiRequest(path, options);
}

async function loginWithApi(usuario, contrasena) {
  const response = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ usuario, contrasena })
  });
  setSession({ ...response.user, token: response.token });
  return response.user;
}

async function fetchDashboard() {
  return apiRequest('/api/dashboard');
}

async function fetchHorarios(kind = 'novedades') {
  return apiRequest(`/api/horarios/${kind}`);
}

async function fetchAusencias() {
  return apiRequest('/api/ausencias');
}

async function createAbsence(payload) {
  return apiRequest('/api/ausencias', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

async function approveAbsence(id) {
  return apiRequest(`/api/ausencias/${id}/approve`, { method: 'PATCH' });
}

async function rejectAbsence(id) {
  return apiRequest(`/api/ausencias/${id}/reject`, { method: 'PATCH' });
}

async function fetchInformation(fecha) {
  const query = fecha ? `?fecha=${encodeURIComponent(fecha)}` : '';
  return apiRequest(`/api/informacion${query}`);
}

async function createNovedad(payload) {
  return apiRequest('/api/novedades', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

async function fetchUsers() {
  return apiRequest('/api/usuarios');
}

async function createUser(payload) {
  return apiRequest('/api/usuarios', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

async function updateUser(id, payload) {
  return apiRequest(`/api/usuarios/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

async function deleteUser(id) {
  return apiRequest(`/api/usuarios/${id}`, { method: 'DELETE' });
}

async function getMe() {
  return apiRequest('/api/me');
}

async function changeMyPassword(currentPassword, newPassword) {
  return apiRequest('/api/me/password', {
    method: 'PATCH',
    body: JSON.stringify({ currentPassword, newPassword })
  });
}

function logout() {
  clearSession();
  window.location.href = 'index.html';
}

function formatFecha(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

function rolLabel(rol) {
  const map = { administrador: 'Administrador', coordinador: 'Coordinador', profesor: 'Profesor' };
  return map[rol] || rol;
}
