// ===================== SHARED LAYOUT =====================

function renderLayout(pageId) {
  const session = requireAuth();
  if (!session) return null;

  const nav = [
    { id: 'dashboard', icon: '📊', label: 'Dashboard', href: 'dashboard.html', roles: ['administrador','coordinador','profesor'] },
    { id: 'perfil', icon: '👤', label: 'Perfil', href: 'perfil.html', roles: ['administrador','coordinador','profesor'] },
    { id: 'horarios', icon: '📅', label: 'Horarios', href: 'horarios.html', roles: ['administrador','coordinador','profesor'] },
    { id: 'novedades', icon: '🔄', label: 'Novedades', href: 'novedades.html', roles: ['administrador','coordinador','profesor'] },
    { id: 'informacion', icon: '📢', label: 'Información', href: 'informacion.html', roles: ['administrador','coordinador','profesor'] },
    { id: 'usuarios', icon: '👥', label: 'Usuarios', href: 'usuarios.html', roles: ['administrador'] },
  ];

  const db = getDB();
  const pendientes = db.ausencias.filter(a => a.estado === 'pendiente').length;

  const navItems = nav
    .filter(n => n.roles.includes(session.rol))
    .map(n => `
      <button class="nav-item ${n.id === pageId ? 'active' : ''}" onclick="window.location.href='${n.href}'">
        <span class="nav-icon">${n.icon}</span>
        <span>${n.label}</span>
        ${n.id === 'novedades' && pendientes > 0 ? `<span class="nav-badge">${pendientes}</span>` : ''}
      </button>
    `).join('');

  const initials = session.nombre.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();

  const sidebar = `
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-header">
        <div class="sidebar-logo">
          <div class="logo-icon">🎓</div>
          <div>
            <span>Plataforma<br>Educativa</span>
          </div>
        </div>
      </div>
      <nav class="sidebar-nav">${navItems}</nav>
      <div class="sidebar-footer">
        <div class="sidebar-user">
          <div class="user-avatar">${initials}</div>
          <div class="user-info">
            <div class="name">${session.nombre}</div>
            <div class="role">${session.rol}</div>
          </div>
        </div>
        <button class="nav-item" onclick="logout()" style="margin-top:8px;color:rgba(255,100,100,0.9)">
          <span class="nav-icon">🚪</span>
          <span>Cerrar sesión</span>
        </button>
      </div>
    </aside>
  `;

  // Inject sidebar
  document.body.insertAdjacentHTML('afterbegin', sidebar);

  // Toast container
  document.body.insertAdjacentHTML('beforeend', '<div class="toast-container" id="toastContainer"></div>');

  return session;
}

function logout() {
  clearSession();
  window.location.href = 'index.html';
}

function showToast(msg, type = 'success') {
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${icons[type]}</span> ${msg}`;
  document.getElementById('toastContainer').appendChild(t);
  setTimeout(() => t.remove(), 3500);
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
