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

  const navItems = nav
    .filter(n => n.roles.includes(session.rol))
    .map(n => `
      <button class="nav-item ${n.id === pageId ? 'active' : ''}" onclick="navigateTo('${n.href}')">
        <span class="nav-icon">${n.icon}</span>
        <span>${n.label}</span>
        ${n.id === 'novedades' ? '<span class="nav-badge" data-pending-badge style="display:none"></span>' : ''}
      </button>
    `).join('');

  const initials = session.nombre.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();

  const sidebar = `
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-header">
        <div class="sidebar-logo">
          <div class="logo-icon">🎓</div>
          <div>
            <span>IEGAA</span>
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

  const overlay = '<div class="sidebar-overlay" id="sidebarOverlay" onclick="closeSidebar()"></div>';

  // Inject sidebar
  document.body.insertAdjacentHTML('afterbegin', sidebar);

  // Inject mobile overlay
  document.body.insertAdjacentHTML('afterbegin', overlay);

  // Inject mobile menu button in the topbar
  const topbar = document.querySelector('.topbar');
  if (topbar && !topbar.querySelector('.menu-toggle')) {
    topbar.insertAdjacentHTML('afterbegin', '<button class="menu-toggle" type="button" aria-label="Abrir navegación" onclick="toggleSidebar()">☰</button>');
  }

  // Toast container
  document.body.insertAdjacentHTML('beforeend', '<div class="toast-container" id="toastContainer"></div>');

  document.addEventListener('keydown', handleSidebarKeys);
  updatePendingBadge();

  return session;
}

async function updatePendingBadge() {
  const badge = document.querySelector('[data-pending-badge]');
  if (!badge) return;
  try {
    const data = await fetchDashboard();
    const pendientes = data?.resumen?.ausenciasPendientes || 0;
    if (pendientes > 0) {
      badge.textContent = pendientes;
      badge.style.display = 'inline-flex';
      badge.classList.add('nav-badge');
    } else {
      badge.style.display = 'none';
    }
  } catch {
    badge.style.display = 'none';
  }
}

function handleSidebarKeys(event) {
  if (event.key === 'Escape') closeSidebar();
}

function toggleSidebar(forceOpen) {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (!sidebar || !overlay) return;

  const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : !sidebar.classList.contains('open');
  sidebar.classList.toggle('open', shouldOpen);
  overlay.classList.toggle('open', shouldOpen);
  document.body.classList.toggle('sidebar-open', shouldOpen);
}

function closeSidebar() {
  toggleSidebar(false);
}

function navigateTo(href) {
  closeSidebar();
  window.location.href = href;
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
