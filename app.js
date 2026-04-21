/* ═══════════════════════════════════════════════════════════
   MACARIO LITE — APP.JS
   Sistema de Gestión Operativa · Justo Makario
   Backend: Supabase · Auth + PostgreSQL + Realtime
   ═══════════════════════════════════════════════════════════ */

/* ═══ SUPABASE INIT ═══ */
const SUPABASE_URL = 'https://hqnibqvjwficlwxgtoki.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxbmlicXZqd2ZpY2x3eGd0b2tpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0ODAxMjIsImV4cCI6MjA5MjA1NjEyMn0.JaukyUf4yltRYv4gLk5iDt7KweKajlgj8ZXr3KAsfIM';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ═══ CONSTANTS ═══ */
const SL = {
  contacto: 'Contacto',
  pendiente: 'Pendiente',
  en_produccion: 'En producción',
  producido: 'Producido',
  listo_despacho: 'Listo para despacho',
  despachado: 'Despachado',
  entregado: 'Entregado',
  cancelado: 'Cancelado'
};

const RL = {
  owner: 'Propietario',
  admin: 'Administración',
  encargado: 'Encargado General',
  ventas: 'Ventas',
  cnc: 'Sector CNC',
  melamina: 'Sector Melamina',
  pino: 'Sector Pino',
  embalaje: 'Sector Embalaje',
  carpinteria: 'Sector Carpintería',
  logistica: 'Logística',
  marketing: 'Marketing',
  marketing_agencia: 'Marketing (Agencia)'
};

const AREA_MAP = {
  owner: 'direccion',
  admin: 'administracion',
  encargado: 'produccion',
  ventas: 'ventas',
  cnc: 'cnc',
  melamina: 'melamina',
  pino: 'pino',
  embalaje: 'embalaje',
  carpinteria: 'carpinteria',
  logistica: 'logistica',
  marketing: 'marketing',
  marketing_agencia: 'marketing'
};

const NOTIF_ICONS = {
  stock_critico: '⚠', pedido_urgente: '🔴', reporte: '📊',
  sector_alerta: '⚙', cancelado: '✕', nuevo_pedido: '+',
  tarea: '☑', produccion: '▣', sistema: '◌'
};

const NOTIF_COLORS = {
  stock_critico: 'r', pedido_urgente: 'r', reporte: 'g',
  sector_alerta: 'a', cancelado: 'r', nuevo_pedido: 'g',
  tarea: 'b', produccion: 'b', sistema: 'b'
};

/* FUTURO: mapa producto → sectores para auto-asignación en órdenes */
const PRODUCT_SECTORS = {
  'Mesa Ratona MR-01': ['CNC', 'Melamina', 'Embalaje'],
  'Mesa Comedor MC-02': ['CNC', 'Melamina', 'Pino', 'Embalaje'],
  'Silla Comedor SC-03': ['Pino', 'Embalaje'],
  'Escritorio EV-02': ['CNC', 'Melamina', 'Embalaje'],
  'Cama Sommier': ['Pino', 'Embalaje']
};

/* ═══ STATE ═══ */
let cu = null;        // current user profile
let curPage = '';
let realtimeSetup = false;
let stockUpdTarget = null;
let productUpdTarget = null;
let cancelTarget = null;
let statusTarget = null;
let activeStockTab = 'materias'; // 'materias' | 'terminados'
let excelParsedData = null;      // datos parseados del Excel (antes de confirmar)

/* ═══ HELPERS ═══ */
function $(id) { return document.getElementById(id); }

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fdDate(s) {
  const d = new Date(s);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function fdTime(s) {
  const d = new Date(s);
  return fdDate(s) + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function fdLong(d) {
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
    + ' · ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function isToday(s) {
  const d = new Date(s), t = new Date();
  return d.toDateString() === t.toDateString();
}

function tlClass(s) {
  if (s.cantidad <= s.min_crit) return 'tr';
  if (s.cantidad <= s.min_warn) return 'ty';
  return 'tg';
}

function tlClassFP(p) {
  if (p.min_crit != null && p.stock_actual <= p.min_crit) return 'tr';
  if (p.stock_actual <= p.stock_minimo) return 'ty';
  return 'tg';
}

function statusB(estado, ordId) {
  return `<span class="sb2 s-${esc(estado)}" onclick="openStatusModal('${esc(ordId)}')"><span class="sp"></span>${SL[estado] || esc(estado)}</span>`;
}

function chB(canal, sub) {
  const s = sub ? ` ${esc(sub).toUpperCase()}` : '';
  const map = { mercadolibre: ['ch-ml', 'ML'], tiendaweb: ['ch-web', 'Web'], mayoristas: ['ch-may', 'MAY'], whatsapp: ['ch-wa', 'WA'], instagram: ['ch-ig', 'IG'] };
  const [cls, lbl] = map[canal] || ['ch-manual', 'MAN'];
  return `<span class="chb ${cls}">${lbl}${s}</span>`;
}

function prioB(p) {
  const l = p === 1 ? 'URGENTE' : p === 2 ? 'NORMAL' : 'PROG';
  return `<span class="pb2 p${p}"><span class="pd"></span>${l}</span>`;
}

function prods(o) {
  return (o.productos || []).map(p => esc(p.nombre) + (p.cantidad > 1 ? ' ×' + p.cantidad : '')).join(', ');
}

/* ═══ MODAL SYSTEM ═══ */
function openM(id) {
  const el = $(id);
  if (el) { el.classList.add('on'); document.body.style.overflow = 'hidden'; }
}

function closeM(id) {
  const el = $(id);
  if (el) { el.classList.remove('on'); document.body.style.overflow = ''; }
}

/* ═══ LOADING STATE ═══ */
function showLoading(containerId) {
  const el = $(containerId);
  if (el) el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;padding:60px;gap:12px"><div class="loader"></div><span style="font-size:13px;color:var(--ink-muted)">Cargando...</span></div>';
}

/* ═══ TOAST SYSTEM ═══ */
function showToast(msg, type = 'success', duration = 3500) {
  let container = $('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${esc(msg)}</span><button class="toast-close" onclick="this.parentElement.remove()">×</button>`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, duration);
}

function showUndoToast(msg, onConfirm, delay = 5000) {
  let container = $('toast-container');
  if (!container) { container = document.createElement('div'); container.id = 'toast-container'; document.body.appendChild(container); }
  const toast = document.createElement('div');
  toast.className = 'toast toast-undo show';
  toast.innerHTML = `<span>${esc(msg)}</span><button class="toast-undo-btn" id="undo-btn">DESHACER</button>`;
  container.appendChild(toast);
  let cancelled = false;
  toast.querySelector('#undo-btn').onclick = () => { cancelled = true; toast.remove(); showToast('Acción cancelada', 'info'); };
  setTimeout(() => { toast.remove(); if (!cancelled) onConfirm(); }, delay);
}

/* ═══ BUTTON LOCK (prevent double-click) ═══ */
function lockBtn(btn) {
  if (typeof btn === 'string') btn = $(btn);
  if (!btn) return;
  btn.disabled = true;
  btn._origText = btn.textContent;
  btn.textContent = 'Procesando...';
}
function unlockBtn(btn, text) {
  if (typeof btn === 'string') btn = $(btn);
  if (!btn) return;
  btn.disabled = false;
  btn.textContent = text || btn._origText || 'OK';
}

/* ═══ CACHE SYSTEM ═══ */
const cache = {};
const CACHE_TTL = 30000;

async function cached(key, fetchFn) {
  const now = Date.now();
  if (cache[key] && (now - cache[key].ts) < CACHE_TTL) return cache[key].data;
  const data = await fetchFn();
  cache[key] = { data, ts: now };
  return data;
}

function invalidateCache(key) {
  if (key) { delete cache[key]; } else { Object.keys(cache).forEach(k => delete cache[k]); }
}

/* ═══ SAFE SUPABASE WRAPPER ═══ */
async function sbQuery(queryFn, errorMsg) {
  try {
    const result = await queryFn();
    if (result.error) {
      console.error(errorMsg || 'Supabase error:', result.error);
      showToast(errorMsg || 'Error al cargar datos', 'error');
      return { data: null, error: result.error };
    }
    return result;
  } catch (e) {
    console.error('Network error:', e);
    showToast('Error de conexión. Verificá tu internet.', 'error', 5000);
    return { data: null, error: e };
  }
}

/* ═══ ROLE HELPERS ═══ */
function isOwner() { return cu && cu.role === 'owner'; }
function canManage(type) {
  if (isOwner()) return true;
  const r = cu?.role;
  if (r === 'admin' && ['order', 'stock', 'finished_product'].includes(type)) return true;
  if (r === 'encargado' && ['prod_log', 'stock', 'finished_product'].includes(type)) return true;
  return false;
}

function ownerBtns(type, id) {
  if (!canManage(type)) return '';
  return `<button class="btn-ghost sm r" onclick="event.stopPropagation();confirmDelete('${type}','${id}')" title="Eliminar">✕</button>`;
}

function ownerEditBtn(type, id) {
  if (!canManage(type)) return '';
  return `<button class="btn-ghost sm" onclick="event.stopPropagation();openEditModal('${type}','${id}')" title="Editar">✎</button>`;
}

async function confirmDelete(type, id) {
  const labels = { order: 'pedido', stock: 'insumo', finished_product: 'producto terminado', prod_log: 'registro de producción', notification: 'notificación' };
  const tables = { order: 'orders', stock: 'stock', finished_product: 'finished_products', prod_log: 'prod_logs', notification: 'notifications' };
  const label = labels[type] || type;
  const table = tables[type];
  if (!table) return;
  showUndoToast(`Eliminando ${label}...`, async () => {
    const { error } = await sb.from(table).delete().eq('id', id);
    if (error) { showToast('Error al eliminar: ' + error.message, 'error'); return; }
    await logActivity('eliminacion', `${label} eliminado por ${cu.name}`, id);
    invalidateCache();
    showToast(`${label.charAt(0).toUpperCase() + label.slice(1)} eliminado`);
    if (curPage) navigate(curPage);
  });
}

async function openEditModal(type, id) {
  if (type === 'order') await openEditOrderModal(id);
  else if (type === 'stock') await openEditStockModal(id);
  else if (type === 'finished_product') await openEditFinishedProductModal(id);
}

/* ═══ ACTIVITY LOG ═══ */
async function logActivity(tipo_evento, descripcion, referencia_id, metadata) {
  if (!cu) return;
  await sb.from('activity_log').insert({
    usuario_id: cu.id,
    usuario_nombre: cu.name,
    area: cu.area,
    tipo_evento,
    descripcion,
    referencia_id: referencia_id || null,
    metadata: metadata || {}
  });
}

/* ═══ NOTIFICATIONS HELPER ═══ */
async function addNotif(tipo, titulo, mensaje, para_roles) {
  const roles = para_roles || ['owner', 'admin'];
  await sb.from('notifications').insert({ tipo, titulo, mensaje, para_roles: roles });
}

/* ═══ AUTH ═══ */
async function doLogin() {
  const email = $('lu').value.trim();
  const pass = $('lp').value;
  if (!email || !pass) { $('lerr').classList.add('on'); return; }
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (error) { $('lerr').classList.add('on'); return; }
    await loadProfile(data.user.id);
    await logActivity('login', `${cu?.name || email} inició sesión`);
    showApp();
  } catch (e) {
    showToast('Error de conexión. Verificá tu internet.', 'error', 5000);
  }
}

async function doLogout() {
  await sb.auth.signOut();
  sb.removeAllChannels();
  realtimeSetup = false;
  cu = null;
  showLogin();
}

async function loadProfile(userId) {
  const { data } = await sb.from('profiles').select('*').eq('id', userId).single();
  if (data) cu = data;
}

document.addEventListener('DOMContentLoaded', () => {
  ['lu', 'lp'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  });
  ['setup-name', 'setup-username', 'setup-email', 'setup-pass'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') doSetup(); });
  });
  const wasteEl = $('mp-waste');
  if (wasteEl) wasteEl.addEventListener('input', () => {
    const wrap = $('mp-waste-notes-wrap');
    if (wrap) wrap.style.display = parseInt(wasteEl.value) > 0 ? '' : 'none';
  });
});

/* ═══ SETUP (First Time) ═══ */
async function checkSetup() {
  const { data } = await sb.rpc('is_setup_needed');
  return data === true;
}

async function doSetup() {
  const name = $('setup-name').value.trim();
  const username = $('setup-username').value.trim();
  const email = $('setup-email').value.trim();
  const pass = $('setup-pass').value;
  const errEl = $('setup-err');
  const btn = $('setup-btn');

  if (!name || !username || !email || !pass) {
    errEl.textContent = 'Todos los campos son obligatorios.';
    errEl.classList.add('on');
    return;
  }
  if (pass.length < 6) {
    errEl.textContent = 'La contraseña debe tener al menos 6 caracteres.';
    errEl.classList.add('on');
    return;
  }

  lockBtn(btn);
  btn.textContent = 'CREANDO...';

  const { data, error } = await sb.auth.signUp({
    email, password: pass,
    options: { data: { name, username, role: 'owner', area: 'direccion' } }
  });

  if (error) {
    errEl.textContent = error.message;
    errEl.classList.add('on');
    unlockBtn(btn, 'CREAR CUENTA OWNER');
    return;
  }

  await new Promise(r => setTimeout(r, 1500));

  const { error: loginErr } = await sb.auth.signInWithPassword({ email, password: pass });
  if (loginErr) {
    errEl.textContent = 'Cuenta creada. Revisá tu email para confirmar y luego ingresá.';
    errEl.classList.add('on');
    unlockBtn(btn, 'CREAR CUENTA OWNER');
    showLogin();
    return;
  }

  await loadProfile(data.user.id);
  if (!cu) {
    await sb.from('profiles').upsert({
      id: data.user.id, name, username, role: 'owner', area: 'direccion', active: true
    });
    await loadProfile(data.user.id);
  }
  await logActivity('login', `${name} creó la cuenta owner y accedió por primera vez`);
  showApp();
}

/* ═══ VIEWS ═══ */
function showLogin() {
  $('login-view').style.display = 'flex';
  $('setup-view').style.display = 'none';
  $('app-view').style.display = 'none';
  $('app-view').classList.remove('on');
  $('lerr').classList.remove('on');
  $('lu').value = '';
  $('lp').value = '';
}

function showSetup() {
  $('setup-view').style.display = 'flex';
  $('login-view').style.display = 'none';
  $('app-view').style.display = 'none';
  $('app-view').classList.remove('on');
}

async function showApp() {
  $('login-view').style.display = 'none';
  $('setup-view').style.display = 'none';
  $('app-view').style.display = '';
  $('app-view').classList.add('on');
  $('uav').textContent = cu.name.substring(0, 2).toUpperCase();
  $('unm').textContent = cu.name;
  $('url2').textContent = RL[cu.role] || cu.role;
  await buildNav();
  if (!realtimeSetup) { setupRealtime(); realtimeSetup = true; }
  const defaults = {
    owner: 'dashboard', admin: 'dashboard', encargado: 'dashboard',
    ventas: 'ventas', cnc: 'produccion', melamina: 'produccion',
    pino: 'produccion', embalaje: 'produccion', carpinteria: 'produccion',
    logistica: 'ventas', marketing: 'notificaciones', marketing_agencia: 'notificaciones'
  };
  navigate(defaults[cu.role] || 'dashboard');
}

/* ═══ NAV — todos los roles predefinidos ═══ */
const NAV = {
  owner: [
    { sec: 'Principal' },
    { id: 'dashboard', ic: '▦', lb: 'Dashboard' },
    { sec: 'Operaciones' },
    { id: 'reporte', ic: '▤', lb: 'Reporte Diario' },
    { sec: 'Gestión' },
    { id: 'ventas', ic: '◈', lb: 'Ventas' },
    { id: 'stock', ic: '◇', lb: 'Stock', alerts: true },
    { sec: 'Producción' },
    { id: 'produccion', ic: '▣', lb: 'Producción' },
    { sec: 'Sistema' },
    { id: 'notificaciones', ic: '🔔', lb: 'Notificaciones', bell: true },
    { id: 'config', ic: '◌', lb: 'Configuración' },
    { id: 'mi-perfil', ic: '◉', lb: 'Mi Perfil' }
  ],
  admin: [
    { sec: 'Principal' },
    { id: 'dashboard', ic: '▦', lb: 'Dashboard' },
    { sec: 'Operaciones' },
    { id: 'reporte', ic: '▤', lb: 'Reporte Diario' },
    { sec: 'Gestión' },
    { id: 'ventas', ic: '◈', lb: 'Ventas' },
    { id: 'stock', ic: '◇', lb: 'Stock', alerts: true },
    { sec: 'Producción' },
    { id: 'produccion', ic: '▣', lb: 'Producción' },
    { sec: 'Sistema' },
    { id: 'notificaciones', ic: '🔔', lb: 'Notificaciones', bell: true },
    { id: 'mi-perfil', ic: '◉', lb: 'Mi Perfil' }
  ],
  encargado: [
    { sec: 'Principal' },
    { id: 'dashboard', ic: '▦', lb: 'Dashboard' },
    { sec: 'Operaciones' },
    { id: 'reporte', ic: '▤', lb: 'Reporte Diario' },
    { sec: 'Gestión' },
    { id: 'stock', ic: '◇', lb: 'Stock' },
    { sec: 'Producción' },
    { id: 'produccion', ic: '▣', lb: 'Producción' },
    { sec: 'Sistema' },
    { id: 'notificaciones', ic: '🔔', lb: 'Notificaciones', bell: true },
    { id: 'mi-perfil', ic: '◉', lb: 'Mi Perfil' }
  ],
  /* FUTURO: roles operarios con módulos propios */
  ventas: [
    { sec: 'Gestión' }, { id: 'ventas', ic: '◈', lb: 'Ventas' },
    { sec: 'Sistema' }, { id: 'notificaciones', ic: '🔔', lb: 'Notificaciones', bell: true }, { id: 'mi-perfil', ic: '◉', lb: 'Mi Perfil' }
  ],
  cnc: [
    { sec: 'Producción' }, { id: 'produccion', ic: '▣', lb: 'Sector CNC' },
    { sec: 'Sistema' }, { id: 'notificaciones', ic: '🔔', lb: 'Notificaciones', bell: true }, { id: 'mi-perfil', ic: '◉', lb: 'Mi Perfil' }
  ],
  melamina: [
    { sec: 'Producción' }, { id: 'produccion', ic: '▣', lb: 'Sector Melamina' },
    { sec: 'Sistema' }, { id: 'notificaciones', ic: '🔔', lb: 'Notificaciones', bell: true }, { id: 'mi-perfil', ic: '◉', lb: 'Mi Perfil' }
  ],
  pino: [
    { sec: 'Producción' }, { id: 'produccion', ic: '▣', lb: 'Sector Pino' },
    { sec: 'Sistema' }, { id: 'notificaciones', ic: '🔔', lb: 'Notificaciones', bell: true }, { id: 'mi-perfil', ic: '◉', lb: 'Mi Perfil' }
  ],
  embalaje: [
    { sec: 'Producción' }, { id: 'produccion', ic: '▣', lb: 'Sector Embalaje' },
    { sec: 'Sistema' }, { id: 'notificaciones', ic: '🔔', lb: 'Notificaciones', bell: true }, { id: 'mi-perfil', ic: '◉', lb: 'Mi Perfil' }
  ],
  carpinteria: [
    { sec: 'Producción' }, { id: 'produccion', ic: '▣', lb: 'Sector Carpintería' },
    { sec: 'Sistema' }, { id: 'notificaciones', ic: '🔔', lb: 'Notificaciones', bell: true }, { id: 'mi-perfil', ic: '◉', lb: 'Mi Perfil' }
  ],
  logistica: [
    { sec: 'Gestión' }, { id: 'ventas', ic: '◈', lb: 'Ventas' },
    { sec: 'Sistema' }, { id: 'notificaciones', ic: '🔔', lb: 'Notificaciones', bell: true }, { id: 'mi-perfil', ic: '◉', lb: 'Mi Perfil' }
  ],
  marketing: [
    { sec: 'Sistema' }, { id: 'notificaciones', ic: '🔔', lb: 'Notificaciones', bell: true }, { id: 'mi-perfil', ic: '◉', lb: 'Mi Perfil' }
  ],
  marketing_agencia: [
    { sec: 'Sistema' }, { id: 'notificaciones', ic: '🔔', lb: 'Notificaciones', bell: true }, { id: 'mi-perfil', ic: '◉', lb: 'Mi Perfil' }
  ]
};

async function buildNav() {
  const cfg = NAV[cu.role] || NAV.cnc;
  /* NULL leida_por = nunca leída; usar or() para capturar ambos casos */
  const { count: notifCount } = await sb.from('notifications')
    .select('*', { count: 'exact', head: true })
    .contains('para_roles', [cu.role])
    .or(`leida_por.is.null,leida_por.not.cs.{${cu.id}}`);

  $('sbnav').innerHTML = cfg.map(item => {
    if (item.sec) return `<div class="nav-sec">${item.sec}</div>`;
    let badge = '';
    if (item.bell && notifCount > 0) badge = `<span class="nb" id="notif-bell-badge">${notifCount}</span>`;
    return `<div class="nav-i" id="nav-${item.id}" onclick="navigate('${item.id}')"><span class="nav-ic">${item.ic}</span><span>${item.lb}</span>${badge}</div>`;
  }).join('');
}

function navigate(pg) {
  closeSidebar();
  document.querySelectorAll('.pg').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.nav-i').forEach(n => n.classList.remove('on'));
  const pageEl = $('pg-' + pg);
  if (pageEl) pageEl.classList.add('on');
  const navEl = $('nav-' + pg);
  if (navEl) navEl.classList.add('on');
  curPage = pg;
  const renders = {
    'dashboard': renderDash,
    'reporte': renderReporte,
    'ventas': renderVentas,
    'stock': renderStock,
    'produccion': renderProduccion,
    'notificaciones': renderNotifs,
    'config': renderConfig,
    'mi-perfil': renderMiPerfil
  };
  if (renders[pg]) renders[pg]();
}

function toggleSidebar() {
  const sidebar = $('sidebar'), ov = $('sb-overlay');
  sidebar.classList.toggle('open');
  if (ov) ov.classList.toggle('on', sidebar.classList.contains('open'));
  document.body.style.overflow = sidebar.classList.contains('open') ? 'hidden' : '';
}

function closeSidebar() {
  const sidebar = $('sidebar'), ov = $('sb-overlay');
  if (sidebar) sidebar.classList.remove('open');
  if (ov) ov.classList.remove('on');
  document.body.style.overflow = '';
}

/* ═══════════════════════════════════════════════════════════
   REPORTE DIARIO — Importación Excel + control de producción
   ═══════════════════════════════════════════════════════════ */

async function renderReporte() {
  showLoading('reporte-body');
  const today = new Date().toISOString().split('T')[0];
  const canEdit = ['owner', 'admin', 'encargado'].includes(cu.role);
  const canDeleteBatch = ['owner', 'admin'].includes(cu.role);

  const [ordersRes, prodLogsRes, batchesRes] = await Promise.all([
    sb.from('orders')
      .select('id,numero,ml_order_id,fecha_pedido,productos,cantidad,sku,estado,created_at,canal,subcanal')
      .eq('canal', 'mercadolibre')
      .not('estado', 'in', '("cancelado","entregado","despachado")')
      .order('created_at', { ascending: false }),
    sb.from('prod_logs').select('id,modelo,sku,variante,unidades,subcanal,created_at'),
    sb.from('orders')
      .select('import_batch_id,import_batch_meta,created_at,cantidad,productos,subcanal')
      .eq('fuente', 'excel')
      .not('import_batch_id', 'is', null)
      .order('created_at', { ascending: false })
  ]);

  const orders = ordersRes.data || [];
  const prodLogs = prodLogsRes.data || [];

  // ── Historial de lotes ──────────────────────────────────────────────────
  const batchMap = {};
  for (const row of (batchesRes.data || [])) {
    const bid = row.import_batch_id;
    if (!batchMap[bid]) {
      batchMap[bid] = {
        id: bid,
        fecha: row.created_at,
        meta: row.import_batch_meta || {},
        carrier: row.import_batch_meta?.carrier || row.subcanal || null,
        pedidos: 0,
        unidades: 0
      };
    }
    batchMap[bid].pedidos++;
    const prods = row.productos || [];
    batchMap[bid].unidades += prods.length > 0
      ? prods.reduce((s, p) => s + parseInt(p.cantidad || 0), 0)
      : parseInt(row.cantidad || 0);
  }
  const batches = Object.values(batchMap).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  // ── Métricas del día ────────────────────────────────────────────────────
  const ordersHoy = orders.filter(o => (o.created_at || '').startsWith(today));
  const countUnidades = (list) => list.reduce((s, o) => {
    const prods = o.productos || [];
    return s + (prods.length > 0 ? prods.reduce((ss, p) => ss + parseInt(p.cantidad || 0), 0) : (o.cantidad || 0));
  }, 0);
  const unidadesHoy = countUnidades(ordersHoy);

  const ordersColecta = orders.filter(o => o.subcanal === 'colecta');
  const ordersFlex    = orders.filter(o => o.subcanal === 'flex');
  const ordersOtros   = orders.filter(o => o.subcanal !== 'colecta' && o.subcanal !== 'flex');

  const udsColecta = countUnidades(ordersColecta);
  const udsFlex    = countUnidades(ordersFlex);

  // ── Agregación de pendiente por carrier ────────────────────────────────
  // Construye un mapa modelo||color → {pedido} para el conjunto de órdenes dado
  function buildMapa(lista) {
    const m = {};
    for (const ord of lista) {
      const prods = ord.productos || [];
      if (prods.length === 0) {
        const key = (ord.sku || ord.id) + '||';
        if (!m[key]) m[key] = { modelo: ord.sku || '(sin título)', color: '', pedido: 0, producido: 0 };
        m[key].pedido += parseInt(ord.cantidad || 0);
      } else {
        for (const p of prods) {
          const key = (p.nombre || '') + '||' + (p.color || '');
          if (!m[key]) m[key] = { modelo: p.nombre || '', color: p.color || '', pedido: 0, producido: 0 };
          m[key].pedido += parseInt(p.cantidad || 0);
        }
      }
    }
    return m;
  }

  // Resta prod_logs del mapa dado (consume por modelo, cualquier carrier)
  function subtractLogs(m, logs) {
    for (const log of logs) {
      const keyExact = (log.modelo || '') + '||' + (log.variante || '');
      if (m[keyExact]) {
        m[keyExact].producido += parseInt(log.unidades || 0);
      } else {
        const key = Object.keys(m).find(k => k.startsWith((log.modelo || '') + '||'));
        if (key) m[key].producido += parseInt(log.unidades || 0);
      }
    }
  }

  const mapaColecta = buildMapa(ordersColecta);
  const mapaFlex    = buildMapa(ordersFlex);
  const mapaTotal   = buildMapa(orders);
  // Filtrar prod_logs por carrier: logs sin subcanal (legados) se restan de ambos
  subtractLogs(mapaColecta, prodLogs.filter(l => !l.subcanal || l.subcanal === 'colecta'));
  subtractLogs(mapaFlex,    prodLogs.filter(l => !l.subcanal || l.subcanal === 'flex'));
  subtractLogs(mapaTotal,   prodLogs);

  const filasColecta = Object.values(mapaColecta).filter(f => f.modelo && f.pedido > 0);
  const filasFlex    = Object.values(mapaFlex).filter(f => f.modelo && f.pedido > 0);
  const totalPendiente = Object.values(mapaTotal).reduce((s, f) => s + Math.max(0, f.pedido - f.producido), 0);
  const pendColecta = filasColecta.reduce((s, f) => s + Math.max(0, f.pedido - f.producido), 0);
  const pendFlex    = filasFlex.reduce((s, f) => s + Math.max(0, f.pedido - f.producido), 0);

  // ── Helper: tabla de pendiente ─────────────────────────────────────────
  function buildPendingTable(filas, carrier) {
    if (!filas.length) {
      return `<div style="color:var(--ink-muted);font-size:13px;padding:16px 0">Sin pedidos de ${carrier} con producción pendiente.</div>`;
    }
    return `
      <div style="overflow-x:auto">
        <table class="dt">
          <thead><tr>
            <th>Modelo / Producto</th>
            <th>Variante</th>
            <th style="text-align:center">Pedido</th>
            <th style="text-align:center">Producido</th>
            <th style="text-align:center">Pendiente</th>
            ${canEdit ? '<th style="text-align:center">Progreso</th>' : ''}
          </tr></thead>
          <tbody>
            ${filas.map(f => {
              const pendiente = Math.max(0, f.pedido - f.producido);
              const pct = f.pedido > 0 ? Math.min(100, Math.round((f.producido / f.pedido) * 100)) : 0;
              return `<tr>
                <td style="font-weight:600">${esc(f.modelo)}</td>
                <td style="color:var(--ink-muted)">${esc(f.color || '—')}</td>
                <td style="text-align:center;font-family:var(--mono);font-weight:700">${f.pedido}</td>
                <td style="text-align:center;font-family:var(--mono);font-weight:700;color:var(--green)">${f.producido}</td>
                <td style="text-align:center;font-family:var(--mono);font-weight:700;color:${pendiente > 0 ? 'var(--red)' : 'var(--green)'}">${pendiente}</td>
                ${canEdit ? `<td>
                  <div style="display:flex;align-items:center;gap:8px;justify-content:center">
                    <div style="width:60px;height:4px;background:var(--paper-dim)">
                      <div style="width:${pct}%;height:100%;background:${pct >= 100 ? 'var(--green)' : 'var(--blue)'}"></div>
                    </div>
                    <span style="font-size:10px;font-family:var(--mono);color:var(--ink-muted)">${pct}%</span>
                    ${pendiente > 0
                      ? `<button class="btn-ghost sm g" onclick="navigate('produccion')" title="Ir a Producción">+ Registrar</button>`
                      : `<span style="color:var(--green);font-size:12px;font-weight:700">✓</span>`}
                  </div>
                </td>` : ''}
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  // ── Empty state ─────────────────────────────────────────────────────────
  if (orders.length === 0) {
    $('reporte-body').innerHTML = `
      <div style="text-align:center;padding:60px 20px">
        <div style="font-size:48px;opacity:.15;margin-bottom:16px">▤</div>
        <div style="font-size:15px;font-weight:700;margin-bottom:8px">Sin pedidos activos</div>
        <div style="font-size:13px;color:var(--ink-muted);margin-bottom:24px">Importá el Excel de MercadoLibre para registrar los pedidos del día.</div>
        <button class="btn" onclick="openImportML()">↑ Importar Excel ML</button>
      </div>`;
    return;
  }

  // ── Render ──────────────────────────────────────────────────────────────
  const carrierBadge = (c) => c === 'colecta'
    ? `<span class="badge-info b" style="font-size:10px">Colecta</span>`
    : c === 'flex'
    ? `<span class="badge-info g" style="font-size:10px">Flex</span>`
    : `<span class="badge-info" style="font-size:10px">${esc(c || '—')}</span>`;

  $('reporte-body').innerHTML = `
    <!-- KPIs globales -->
    <div class="sg" style="margin-bottom:16px">
      <div class="sc b">
        <div class="sc-l">Total pedidos</div>
        <div class="sc-v">${orders.length}</div>
      </div>
      <div class="sc ${totalPendiente > 0 ? 'r' : 'g'}">
        <div class="sc-l">Pendiente total</div>
        <div class="sc-v">${totalPendiente}</div>
      </div>
      <div class="sc b" style="cursor:pointer" onclick="document.getElementById('section-colecta').scrollIntoView({behavior:'smooth'})">
        <div class="sc-l">Colecta · 12:00 hs</div>
        <div class="sc-v">${ordersColecta.length} <span style="font-size:13px;font-weight:500;color:var(--ink-muted)">· ${udsColecta} uds</span></div>
      </div>
      <div class="sc b" style="cursor:pointer" onclick="document.getElementById('section-flex').scrollIntoView({behavior:'smooth'})">
        <div class="sc-l">Flex · 14:00 hs</div>
        <div class="sc-v">${ordersFlex.length} <span style="font-size:13px;font-weight:500;color:var(--ink-muted)">· ${udsFlex} uds</span></div>
      </div>
    </div>

    ${ordersHoy.length === 0 ? `
      <div class="card" style="padding:14px 18px;margin-bottom:16px;border-left:3px solid var(--ink-muted)">
        <div style="font-size:11px;font-weight:700;letter-spacing:.08em;color:var(--ink-muted);text-transform:uppercase;margin-bottom:4px">Sin importaciones hoy</div>
        <div style="font-size:13px;color:var(--ink-muted)">Los datos acumulados provienen de importaciones anteriores.</div>
      </div>` : `
      <div class="card" style="padding:14px 18px;margin-bottom:16px;border-left:3px solid var(--blue)">
        <div style="font-size:11px;font-weight:700;letter-spacing:.08em;color:var(--ink-muted);text-transform:uppercase;margin-bottom:4px">Importaciones de hoy</div>
        <div style="font-size:13px">${ordersHoy.length} pedidos · ${unidadesHoy} unidades · ${ordersHoy.filter(o=>o.subcanal==='colecta').length} Colecta · ${ordersHoy.filter(o=>o.subcanal==='flex').length} Flex</div>
      </div>`}

    <!-- Sección Colecta -->
    <div id="section-colecta" class="card" style="padding:20px;margin-bottom:16px;border-top:3px solid var(--blue)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--blue);margin-bottom:4px">COLECTA — Retiro 12:00 hs</div>
          <div style="font-size:13px;color:var(--ink-muted)">${ordersColecta.length} pedidos · ${udsColecta} unidades · <span style="color:${pendColecta > 0 ? 'var(--red)' : 'var(--green)'};font-weight:700">${pendColecta} pendientes</span></div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button id="carrier-detail-btn-colecta" class="btn-ghost sm" onclick="toggleCarrierDetail('colecta')">Ver pedidos ▾</button>
          <button class="btn-ghost sm" onclick="openImportML()">↑ Importar</button>
        </div>
      </div>
      <div id="carrier-detail-colecta" style="display:none;border-bottom:1px solid var(--border);margin-bottom:16px;padding-bottom:16px"></div>
      ${buildPendingTable(filasColecta, 'Colecta')}
    </div>

    <!-- Sección Flex -->
    <div id="section-flex" class="card" style="padding:20px;margin-bottom:16px;border-top:3px solid var(--green)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--green);margin-bottom:4px">FLEX — Retiro 14:00 hs</div>
          <div style="font-size:13px;color:var(--ink-muted)">${ordersFlex.length} pedidos · ${udsFlex} unidades · <span style="color:${pendFlex > 0 ? 'var(--red)' : 'var(--green)'};font-weight:700">${pendFlex} pendientes</span></div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button id="carrier-detail-btn-flex" class="btn-ghost sm" onclick="toggleCarrierDetail('flex')">Ver pedidos ▾</button>
          <button class="btn-ghost sm" onclick="openImportML()">↑ Importar</button>
        </div>
      </div>
      <div id="carrier-detail-flex" style="display:none;border-bottom:1px solid var(--border);margin-bottom:16px;padding-bottom:16px"></div>
      ${buildPendingTable(filasFlex, 'Flex')}
    </div>

    ${ordersOtros.length > 0 ? `
    <div class="card" style="padding:20px;margin-bottom:16px;border-top:3px solid var(--border)">
      <div style="font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-muted);margin-bottom:14px">SIN CARRIER ASIGNADO (${ordersOtros.length})</div>
      ${buildPendingTable(Object.values(buildMapa(ordersOtros)).filter(f=>f.modelo&&f.pedido>0), 'sin asignar')}
    </div>` : ''}

    <!-- Historial de lotes -->
    ${batches.length > 0 ? `
    <div class="card" style="padding:20px;margin-top:4px">
      <div style="font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-muted);margin-bottom:14px">HISTORIAL DE IMPORTACIONES</div>
      <div style="overflow-x:auto">
        <table class="dt">
          <thead><tr>
            <th>Fecha y hora</th>
            <th>Carrier</th>
            <th>Importado por</th>
            <th style="text-align:center">Pedidos</th>
            <th style="text-align:center">Unidades</th>
            ${canDeleteBatch ? '<th style="text-align:center">Acción</th>' : ''}
          </tr></thead>
          <tbody>
            ${batches.map(b => {
              const esHoy = b.fecha.startsWith(today);
              return `<tr>
                <td>
                  <span style="font-size:12px;font-weight:600">${fdTime(b.fecha)}</span>
                  ${esHoy ? '<span class="badge-info g" style="font-size:10px;margin-left:6px">hoy</span>' : ''}
                </td>
                <td>${carrierBadge(b.carrier)}</td>
                <td style="font-size:12px;color:var(--ink-muted)">${esc(b.meta.importado_por || '—')}</td>
                <td style="text-align:center;font-family:var(--mono);font-weight:700">${b.pedidos}</td>
                <td style="text-align:center;font-family:var(--mono);font-weight:700">${b.unidades}</td>
                ${canDeleteBatch ? `<td style="text-align:center">
                  <button class="btn-ghost sm r" onclick="deleteImportBatch(this.dataset.bid, ${b.pedidos})" data-bid="${b.id}" title="Borrar todos los pedidos de esta importación">✕ Eliminar lote</button>
                </td>` : ''}
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}
  `;
}

/* ═══ QR + Scanner ═══ */

// Genera y muestra el QR de un SKU en el modal m-qr
function showQR(sku, nombre) {
  $('qr-modal-title').textContent = `QR — ${sku}`;
  $('qr-sku-label').textContent = sku;
  $('qr-nombre-label').textContent = nombre || '';
  const canvas = $('qr-canvas');
  if (typeof QRCode === 'undefined') { showToast('Librería QR no cargada. Revisá la conexión.', 'error'); return; }
  QRCode.toCanvas(canvas, sku, { width: 220, margin: 2, color: { dark: '#0f0f0f', light: '#ffffff' } }, (err) => {
    if (err) { showToast('Error generando QR: ' + err.message, 'error'); return; }
  });
  openM('m-qr');
}

// Descarga el canvas del QR como PNG
function downloadQR() {
  const canvas = $('qr-canvas');
  const sku = $('qr-sku-label').textContent || 'qr';
  const link = document.createElement('a');
  link.download = `qr-${sku}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// Escucha Enter del scanner HID en el campo mp-scan-input del modal de producción
function onProdScanKey(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const raw = $('mp-scan-input').value.trim();
  if (!raw) return;

  // Intentar parsear JSON del formato ML: {"id":"...","t":"lm"}
  let sku = raw;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.id) sku = parsed.id;
  } catch (_) { /* no es JSON, usar como SKU directo */ }

  // Buscar en el catálogo cargado por SKU exacto (case-insensitive)
  const found = _prodCatalog.find(p => p.sku.toLowerCase() === sku.toLowerCase());
  if (found) {
    const sel = $('mp-model-sel');
    sel.value = found.id;
    onProdModelChange(sel);
    $('mp-scan-input').value = '';
    $('mp-scan-input').style.borderColor = 'var(--green)';
    setTimeout(() => { if ($('mp-scan-input')) $('mp-scan-input').style.borderColor = ''; }, 1200);
  } else {
    $('mp-scan-input').style.borderColor = 'var(--red)';
    showToast(`SKU "${esc(sku)}" no encontrado en el catálogo`, 'error');
    setTimeout(() => { if ($('mp-scan-input')) $('mp-scan-input').style.borderColor = ''; }, 1500);
  }
}

/* ═══ Carrier Detail ═══ */

// Expande/colapsa la lista de pedidos individuales de un carrier dentro del Reporte Diario
async function toggleCarrierDetail(carrier) {
  const containerId = `carrier-detail-${carrier}`;
  const btnId       = `carrier-detail-btn-${carrier}`;
  const container   = document.getElementById(containerId);
  const btn         = document.getElementById(btnId);
  if (!container || !btn) return;

  const isOpen = container.style.display !== 'none';
  if (isOpen) {
    container.style.display = 'none';
    btn.textContent = `Ver pedidos ▾`;
    return;
  }

  btn.textContent = 'Cargando...';
  btn.disabled = true;

  const { data: orders } = await sb.from('orders')
    .select('id,numero,ml_order_id,cliente,productos,cantidad,sku,estado,fecha_pedido,created_at,subcanal')
    .eq('canal', 'mercadolibre')
    .eq('subcanal', carrier)
    .not('estado', 'in', '("cancelado","entregado","despachado")')
    .order('created_at', { ascending: false });

  const lista = orders || [];
  const isOwnerAdmin = ['owner', 'admin'].includes(cu.role);

  if (!lista.length) {
    container.innerHTML = `<div style="color:var(--ink-muted);font-size:13px;padding:12px 0">Sin pedidos activos para ${carrier === 'colecta' ? 'Colecta' : 'Flex'}.</div>`;
  } else {
    const rows = lista.map(o => {
      const prods = o.productos || [];
      const resumen = prods.length
        ? prods.map(p => `${p.nombre || p.sku || '?'}${p.color ? ' · ' + p.color : ''} ×${p.cantidad}`).join(' / ')
        : `${o.sku || '—'} ×${o.cantidad || 1}`;
      const estadoBadge = {
        pendiente: '<span class="badge-info" style="font-size:10px">Pendiente</span>',
        en_produccion: '<span class="badge-info b" style="font-size:10px">En producción</span>',
        producido: '<span class="badge-info g" style="font-size:10px">Producido</span>',
        listo_despacho: '<span class="badge-info g" style="font-size:10px">Listo</span>',
      }[o.estado] || `<span class="badge-info" style="font-size:10px">${esc(o.estado)}</span>`;

      return `<tr>
        <td style="font-size:11px;color:var(--ink-muted)">${esc(o.numero || o.id?.slice(0,8) || '—')}</td>
        ${isOwnerAdmin ? `<td style="font-size:12px">${esc(o.cliente || '—')}</td>` : ''}
        <td style="font-size:12px;max-width:260px">${esc(resumen)}</td>
        <td>${estadoBadge}</td>
        <td style="font-size:11px;color:var(--ink-muted)">${o.fecha_pedido ? esc(o.fecha_pedido) : fdDate(o.created_at)}</td>
      </tr>`;
    }).join('');

    container.innerHTML = `
      <div style="overflow-x:auto;margin-top:12px">
        <table class="dt">
          <thead><tr>
            <th>N° pedido</th>
            ${isOwnerAdmin ? '<th>Cliente</th>' : ''}
            <th>Productos</th>
            <th>Estado</th>
            <th>Fecha</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  container.style.display = '';
  btn.textContent = `Ocultar pedidos ▴`;
  btn.disabled = false;
}

/* ═══ ML Excel Import ═══ */

function parseMlDate(str) {
  const MESES = { enero:0, febrero:1, marzo:2, abril:3, mayo:4, junio:5, julio:6, agosto:7, septiembre:8, octubre:9, noviembre:10, diciembre:11 };
  const m = String(str || '').toLowerCase().match(/(\d+)\s+de\s+(\w+)\s+de\s+(\d{4})/);
  if (!m) return null;
  const d = new Date(parseInt(m[3]), MESES[m[2]] ?? 0, parseInt(m[1]));
  return isNaN(d) ? null : d.toISOString().split('T')[0];
}

function mapMlStatus(estadoML) {
  const s = String(estadoML || '').toLowerCase();
  if (s.includes('entregado') || s.includes('delivered')) return 'entregado';
  if (s.includes('despacho') || s.includes('shipped') || s.includes('enviado')) return 'despachado';
  if (s.includes('listo')) return 'listo_despacho';
  if (s.includes('cancelado') || s.includes('cancelled')) return 'cancelado';
  if (s.includes('produccion') || s.includes('producción')) return 'en_produccion';
  return 'pendiente';
}

function detectSubcanal(canal) {
  const c = String(canal || '').toLowerCase();
  if (c.includes('flex')) return 'flex';
  if (c.includes('full')) return 'full';
  if (c.includes('colecta')) return 'colecta';
  if (c.includes('shops') || c.includes('tienda')) return 'shops';
  return 'flex';
}

function openImportML() {
  const inp = $('excel-file-input');
  if (inp) inp.value = '';
  $('excel-preview-wrap').style.display = 'none';
  $('btn-import-confirm').style.display = 'none';
  const info = $('ml-detect-info');
  if (info) { info.style.display = 'none'; info.innerHTML = ''; }
  $('excel-preview-table').innerHTML = '';
  excelParsedData = null;
  // Reset carrier selection
  document.querySelectorAll('input[name="import-carrier"]').forEach(r => r.checked = false);
  updateCarrierStyles(null);
  const errEl = $('import-carrier-error');
  if (errEl) errEl.style.display = 'none';
  openM('m-excel-import');
}

function getImportCarrier() {
  const sel = document.querySelector('input[name="import-carrier"]:checked');
  return sel ? sel.value : null;
}

function onCarrierChange() {
  const val = getImportCarrier();
  updateCarrierStyles(val);
  const errEl = $('import-carrier-error');
  if (errEl) errEl.style.display = 'none';
}

function updateCarrierStyles(val) {
  const lblColecta = $('import-lbl-colecta');
  const lblFlex = $('import-lbl-flex');
  if (!lblColecta || !lblFlex) return;
  lblColecta.style.borderColor = val === 'colecta' ? 'var(--blue)' : 'var(--border)';
  lblColecta.style.background = val === 'colecta' ? 'color-mix(in srgb, var(--blue) 8%, transparent)' : '';
  lblFlex.style.borderColor = val === 'flex' ? 'var(--blue)' : 'var(--border)';
  lblFlex.style.background = val === 'flex' ? 'color-mix(in srgb, var(--blue) 8%, transparent)' : '';
}

function previewML(input) {
  const file = input.files[0];
  if (!file) return;
  // Must select carrier first
  if (!getImportCarrier()) {
    const errEl = $('import-carrier-error');
    if (errEl) errEl.style.display = '';
    input.value = '';
    return;
  }
  if (typeof XLSX === 'undefined') { showToast('Error: librería Excel no cargada. Recargá la página.', 'error'); return; }

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (!rows || rows.length < 2) { showToast('El archivo está vacío o no tiene datos', 'error'); return; }

      // ML exports have intro text in first rows; find the actual header row
      // Use very specific terms that only appear in the real column header row, not section rows
      const HEADER_MARKERS = ['# de venta', 'título de la publicación', 'titulo de la publicacion', 'fecha de venta'];
      let headerRowIdx = 0;
      for (let i = 0; i < Math.min(10, rows.length); i++) {
        const rowStr = rows[i].map(String).join('|').toLowerCase();
        if (HEADER_MARKERS.some(m => rowStr.includes(m.toLowerCase()))) { headerRowIdx = i; break; }
      }
      const headers = rows[headerRowIdx].map(String);
      const findCol = (...terms) => headers.findIndex(h => terms.some(t => h.toLowerCase().includes(t.toLowerCase())));

      const hasVenta = findCol('# de venta', 'nro. de venta', 'número de venta', 'numero de venta', 'n° de venta', 'nro venta', 'venta') >= 0;
      const hasTitulo = findCol('título', 'titulo', 'publicación', 'publicacion', 'title', 'producto', 'artículo', 'articulo', 'descripcion', 'descripción') >= 0;
      const hasUnidades = findCol('unidades', 'cantidad', 'qty', 'units') >= 0;

      const detectInfo = $('ml-detect-info');
      detectInfo.style.display = 'block';
      if (!hasVenta && !hasTitulo && !hasUnidades) {
        const headerList = headers.filter(h => h.trim()).slice(0, 20).join(' | ');
        detectInfo.innerHTML = `<div class="badge-info r" style="display:block">Este archivo no parece ser un export de MercadoLibre.<br><small style="opacity:.75">Columnas encontradas: <em>${esc(headerList)}</em></small></div>`;
        return;
      }

      const COL = {
        venta:    findCol('# de venta', 'nro. de venta', 'número de venta', 'numero de venta', 'n° de venta', 'nro venta', 'venta'),
        titulo:   findCol('título de la publicación', 'titulo de la publicacion', 'título', 'titulo', 'title'),
        unidades: findCol('unidades', 'cantidad', 'qty', 'units'),
        comprador:findCol('comprador', 'buyer', 'nombre del comprador'),
        sku:      findCol('sku'),
        variante: findCol('variante', 'variación', 'variant'),
        dni:      findCol('dni', 'cuit', 'documento'),
        fecha:    findCol('fecha de venta', 'fecha'),
        estado:   findCol('estado', 'status'),
        canal:    findCol('canal de venta', 'canal')
      };

      const dataRows = rows.slice(headerRowIdx + 1).filter(r => r.some(c => String(c).trim() !== ''));
      excelParsedData = { headers, rows: dataRows, COL };

      detectInfo.innerHTML = `<div class="badge-info g" style="display:block">✓ Formato MercadoLibre detectado — ${dataRows.length} líneas de pedido encontradas</div>`;

      const PREVIEW_KEYS = ['venta','titulo','variante','unidades','comprador','estado'].filter(k => COL[k] >= 0);
      const LABELS = { venta:'# Venta', titulo:'Producto', variante:'Variante', unidades:'Unidades', comprador:'Comprador', estado:'Estado ML' };

      let tbl = `<table class="dt"><thead><tr>${PREVIEW_KEYS.map(k => `<th>${LABELS[k]}</th>`).join('')}</tr></thead><tbody>`;
      dataRows.slice(0, 5).forEach(row => {
        tbl += `<tr>${PREVIEW_KEYS.map(k => `<td style="font-size:12px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(String(row[COL[k]] || '—'))}</td>`).join('')}</tr>`;
      });
      tbl += '</tbody></table>';
      $('excel-preview-table').innerHTML = tbl;
      $('excel-preview-wrap').style.display = '';
      $('btn-import-confirm').style.display = '';
    } catch (err) {
      showToast('Error al leer el archivo: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

async function confirmarImportML() {
  if (!excelParsedData) return;
  const carrier = getImportCarrier();
  if (!carrier) {
    const errEl = $('import-carrier-error');
    if (errEl) errEl.style.display = '';
    return;
  }
  const { rows, COL } = excelParsedData;
  const btn = $('btn-import-confirm');
  lockBtn(btn);

  // Group rows by # de venta (one order per sale)
  const grupos = {};
  for (const row of rows) {
    const ventaId = String(COL.venta >= 0 ? (row[COL.venta] ?? '') : '').trim();
    const titulo = String(COL.titulo >= 0 ? (row[COL.titulo] ?? '') : '').trim();
    if (!ventaId && !titulo) continue;

    const key = ventaId || titulo;
    if (!grupos[key]) {
      grupos[key] = {
        ml_order_id: ventaId || null,
        cliente: COL.comprador >= 0 ? String(row[COL.comprador] || '').trim() : '',
        dni_cuit: COL.dni >= 0 ? String(row[COL.dni] || '').trim() || null : null,
        fecha_pedido: COL.fecha >= 0 ? parseMlDate(row[COL.fecha]) : null,
        estado_ml: COL.estado >= 0 ? String(row[COL.estado] || '').trim() : '',
        canal_venta: COL.canal >= 0 ? String(row[COL.canal] || '').trim() : '',
        productos: []
      };
    }
    const unidades = parseInt(String(COL.unidades >= 0 ? row[COL.unidades] : '1').replace(/[^0-9]/g, '')) || 1;
    grupos[key].productos.push({
      nombre: titulo,
      color: COL.variante >= 0 ? String(row[COL.variante] || '').trim() : '',
      cantidad: unidades,
      producido: 0,
      sku: COL.sku >= 0 ? String(row[COL.sku] || '').trim() : ''
    });
  }

  const listaGrupos = Object.values(grupos);
  if (!listaGrupos.length) {
    showToast('No se encontraron pedidos válidos en el archivo', 'error');
    unlockBtn(btn, 'Importar Pedidos');
    return;
  }

  // Generar ID único para este lote de importación
  const batchId = crypto.randomUUID();
  const batchFecha = new Date().toISOString();

  // Deduplicate: check which ml_order_ids already exist
  const ventaIds = listaGrupos.map(g => g.ml_order_id).filter(Boolean);
  let existingIds = new Set();
  if (ventaIds.length > 0) {
    const { data: existing } = await sb.from('orders').select('ml_order_id').in('ml_order_id', ventaIds);
    existingIds = new Set((existing || []).map(o => o.ml_order_id));
  }

  const inserts = [];
  for (const g of listaGrupos) {
    if (g.ml_order_id && existingIds.has(g.ml_order_id)) continue;
    const totalUnidades = g.productos.reduce((s, p) => s + p.cantidad, 0);
    const firstSku = g.productos.find(p => p.sku)?.sku || null;
    inserts.push({
      canal: 'mercadolibre',
      subcanal: carrier,
      cliente: g.cliente,
      dni_cuit: g.dni_cuit,
      fecha_pedido: g.fecha_pedido,
      ml_order_id: g.ml_order_id,
      sku: firstSku,
      cantidad: totalUnidades,
      productos: g.productos.map(p => ({ nombre: p.nombre, color: p.color, cantidad: p.cantidad, producido: 0 })),
      estado: mapMlStatus(g.estado_ml),
      prioridad: 2,
      fuente: 'excel',
      creado_por: cu.id,
      import_batch_id: batchId,
      import_batch_meta: { importado_por: cu.name, fecha: batchFecha, carrier }
    });
  }

  const skipped = listaGrupos.length - inserts.length;

  if (inserts.length === 0) {
    showToast(`Todos los pedidos (${skipped}) ya estaban importados`, 'info');
    unlockBtn(btn, 'Importar Pedidos');
    closeM('m-excel-import');
    return;
  }

  const { error } = await sb.from('orders').insert(inserts);
  if (error) { showToast('Error al guardar: ' + error.message, 'error'); unlockBtn(btn, 'Importar Pedidos'); return; }

  await logActivity('ml_importado', `ML Excel importado: ${inserts.length} nuevos, ${skipped} ya existían`);
  invalidateCache('orders');
  closeM('m-excel-import');
  showToast(`✓ ${inserts.length} pedidos importados${skipped > 0 ? ` · ${skipped} ya existían` : ''}`);
  navigate('reporte');
}

async function deleteImportBatch(batchId, totalPedidos) {
  if (!batchId) return;
  showUndoToast(
    `Eliminando ${totalPedidos} pedido${totalPedidos !== 1 ? 's' : ''} de esta importación...`,
    async () => {
      const { error } = await sb.from('orders').delete().eq('import_batch_id', batchId);
      if (error) { showToast('Error al eliminar: ' + error.message, 'error'); return; }
      await logActivity('ml_batch_eliminado', `Lote de importación eliminado: ${totalPedidos} pedidos (batch ${batchId.slice(0, 8)})`);
      invalidateCache('orders');
      showToast(`✓ Lote eliminado — ${totalPedidos} pedido${totalPedidos !== 1 ? 's' : ''} borrados`);
      renderReporte();
    }
  );
}

/* ═══════════════════════════════════════════════════════════
   DASHBOARD
   ═══════════════════════════════════════════════════════════ */
async function renderDash() {
  if (!['owner', 'admin', 'encargado'].includes(cu.role)) {
    $('dash-body').innerHTML = '<div style="padding:40px;text-align:center;color:var(--ink-muted)">Acceso restringido.</div>';
    return;
  }
  showLoading('dash-body');
  $('dts').textContent = fdLong(new Date());

  const today = new Date().toISOString().split('T')[0];
  const [ordersRes, stockRes, prodRes, allProdLogsRes] = await Promise.all([
    cached('orders', () => sb.from('orders').select('id,estado,numero,canal,subcanal,cliente,productos,cantidad,created_at').neq('canal', 'reporte')),
    cached('stock', () => sb.from('stock').select('id,nombre,cantidad,min_warn,min_crit,categoria,unidad')),
    sb.from('prod_logs').select('id,modelo,unidades,unidades_falla,created_at').gte('created_at', today + 'T00:00:00'),
    sb.from('prod_logs').select('unidades')
  ]);

  const orders = ordersRes.data || [];
  const stockItems = stockRes.data || [];
  const prodLogs = prodRes.data || [];

  const byStatus = (s) => orders.filter(o => o.estado === s).length;
  const critItems = stockItems.filter(s => s.cantidad <= s.min_crit);
  const warnItems = stockItems.filter(s => s.cantidad > s.min_crit && s.cantidad <= s.min_warn);
  const todayProd = prodLogs.reduce((acc, l) => acc + (l.unidades || 0), 0);

  // Pending production: sum active orders' productos - sum all-time prod_logs
  const activeOrders = orders.filter(o => !['cancelado','entregado','despachado'].includes(o.estado));
  let totalOrderedUnits = 0;
  for (const ord of activeOrders) {
    const prods = ord.productos || [];
    totalOrderedUnits += prods.length > 0
      ? prods.reduce((s, p) => s + parseInt(p.cantidad || 1), 0)
      : parseInt(ord.cantidad || 0);
  }
  const totalProducedAllTime = (allProdLogsRes.data || []).reduce((a, l) => a + (l.unidades || 0), 0);
  const pendingProd = Math.max(0, totalOrderedUnits - totalProducedAllTime);

  // Colecta / Flex split — solo pedidos ML activos de hoy
  const mlHoy = activeOrders.filter(o => o.canal === 'mercadolibre' && (o.created_at || '').startsWith(today));
  const countUds = (list) => list.reduce((s, o) => {
    const prods = o.productos || [];
    return s + (prods.length > 0 ? prods.reduce((ss, p) => ss + parseInt(p.cantidad || 0), 0) : parseInt(o.cantidad || 0));
  }, 0);
  const colectaHoy = mlHoy.filter(o => o.subcanal === 'colecta');
  const flexHoy    = mlHoy.filter(o => o.subcanal === 'flex');

  $('dash-body').innerHTML = `
    <div class="sg">
      <div class="sc" onclick="navigate('ventas')" style="cursor:pointer">
        <div class="sc-l">Pedidos activos</div>
        <div class="sc-v">${activeOrders.length}</div>
      </div>
      <div class="sc b" onclick="navigate('ventas')" style="cursor:pointer">
        <div class="sc-l">En producción</div>
        <div class="sc-v">${byStatus('en_produccion')}</div>
      </div>
      <div class="sc g" onclick="navigate('produccion')" style="cursor:pointer">
        <div class="sc-l">Unidades hoy</div>
        <div class="sc-v">${todayProd}</div>
      </div>
      <div class="sc ${pendingProd > 0 ? 'r' : 'g'}" onclick="navigate('produccion')" style="cursor:pointer">
        <div class="sc-l">Pendiente prod.</div>
        <div class="sc-v">${pendingProd}</div>
      </div>
    </div>
    <div class="sg" style="margin-top:12px">
      <div class="sc b" onclick="navigate('reporte')" style="cursor:pointer" title="Ver Reporte Diario — Colecta">
        <div class="sc-l">Colecta hoy · 12:00 hs</div>
        <div class="sc-v">${colectaHoy.length} <span style="font-size:13px;font-weight:500;color:var(--ink-muted)">ped · ${countUds(colectaHoy)} uds</span></div>
      </div>
      <div class="sc b" onclick="navigate('reporte')" style="cursor:pointer" title="Ver Reporte Diario — Flex">
        <div class="sc-l">Flex hoy · 14:00 hs</div>
        <div class="sc-v">${flexHoy.length} <span style="font-size:13px;font-weight:500;color:var(--ink-muted)">ped · ${countUds(flexHoy)} uds</span></div>
      </div>
    </div>
    ${critItems.length > 0 || warnItems.length > 0 ? `
    <div class="card" style="margin-bottom:16px;padding:18px 20px;cursor:pointer" onclick="navigate('stock')" tabindex="0">
      <div style="font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-muted);margin-bottom:12px">ALERTAS DE STOCK</div>
      ${critItems.map(s => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
          <div style="display:flex;gap:8px;align-items:center">
            <span class="tl tr"></span>
            <span style="font-size:13px;font-weight:600">${esc(s.nombre)}</span>
          </div>
          <span style="font-size:12px;color:var(--red);font-weight:700">${s.cantidad} ${esc(s.unidad)}</span>
        </div>`).join('')}
      ${warnItems.map(s => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
          <div style="display:flex;gap:8px;align-items:center">
            <span class="tl ty"></span>
            <span style="font-size:13px">${esc(s.nombre)}</span>
          </div>
          <span style="font-size:12px;color:var(--ink-muted)">${s.cantidad} ${esc(s.unidad)}</span>
        </div>`).join('')}
    </div>` : ''}
    <div class="card" style="padding:20px">
      <div style="font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-muted);margin-bottom:14px">PEDIDOS RECIENTES</div>
      ${orders.slice(0, 5).map(o => `
        <div style="display:flex;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)">
          <div class="onum">${esc(o.numero || o.id?.slice(0,8))}</div>
          <div style="flex:1;font-size:13px;color:var(--ink-soft)">${esc(o.cliente)}</div>
          ${statusB(o.estado, o.id)}
        </div>
      `).join('') || '<div style="color:var(--ink-muted);font-size:13px;padding:16px 0">Sin pedidos aún.</div>'}
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════
   VENTAS
   ═══════════════════════════════════════════════════════════ */
async function renderVentas() {
  showLoading('ventas-body');

  const canal = $('f-canal')?.value || '';
  const estado = $('f-estado')?.value || '';
  const q = $('f-q')?.value?.toLowerCase() || '';

  let query = sb.from('orders').select('id,numero,canal,subcanal,cliente,productos,estado,prioridad,fuente,created_at').neq('canal', 'reporte').order('created_at', { ascending: false });
  if (canal) query = query.eq('canal', canal);
  if (estado) query = query.eq('estado', estado);

  const { data, error } = await query;
  if (error) { $('ventas-body').innerHTML = '<div style="padding:20px;color:var(--ink-muted)">Error al cargar pedidos.</div>'; return; }

  let orders = data || [];
  if (q) orders = orders.filter(o =>
    (o.numero || '').toLowerCase().includes(q) ||
    (o.cliente || '').toLowerCase().includes(q)
  );

  if (!orders.length) {
    $('ventas-body').innerHTML = '<div style="padding:32px;text-align:center;color:var(--ink-muted);font-size:13px">Sin pedidos que coincidan con los filtros.</div>';
    return;
  }

  $('ventas-body').innerHTML = `
    <div style="overflow-x:auto">
      <table class="dt">
        <thead><tr>
          <th>Número</th><th>Canal</th><th>Cliente</th><th>Productos</th>
          <th>Estado</th><th>Fecha</th><th></th>
        </tr></thead>
        <tbody>
          ${orders.map(o => `
            <tr>
              <td style="font-family:monospace;font-size:11px;font-weight:700">${esc(o.numero || o.id?.slice(0, 8))}</td>
              <td>${chB(o.canal, o.subcanal)}</td>
              <td>${esc(o.cliente)}</td>
              <td style="font-size:12px;color:var(--ink-muted);max-width:200px">${prods(o)}</td>
              <td>${statusB(o.estado, o.id)}</td>
              <td style="font-size:11px;color:var(--ink-muted)">${fdDate(o.created_at)}</td>
              <td style="display:flex;gap:4px">
                ${ownerEditBtn('order', o.id)}
                ${ownerBtns('order', o.id)}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function clearFilters() {
  const ids = ['f-canal', 'f-estado', 'f-q'];
  ids.forEach(id => { const el = $(id); if (el) el.value = ''; });
  renderVentas();
}

function openNewOrder() {
  $('no-canal').value = 'mercadolibre';
  $('no-subcanal').value = 'flex';
  $('no-cliente').value = '';
  $('no-prods').value = '';
  $('no-notas').value = '';
  updateNewOrderForm();
  openM('m-neworder');
}

function updateNewOrderForm() {
  const canal = $('no-canal')?.value;
  const subWrap = $('no-sub-wrap');
  const mayInfo = $('no-may-info');
  if (subWrap) subWrap.style.display = canal === 'mercadolibre' ? '' : 'none';
  if (mayInfo) mayInfo.style.display = canal === 'mayoristas' ? '' : 'none';
}

async function submitNewOrder() {
  const canal = $('no-canal').value;
  const subcanal = canal === 'mercadolibre' ? $('no-subcanal').value : null;
  const cliente = $('no-cliente').value.trim();
  const prodsRaw = $('no-prods').value.trim();
  const notas = $('no-notas').value.trim();

  if (!cliente || !prodsRaw) { showToast('Cliente y productos son obligatorios', 'error'); return; }

  const productos = prodsRaw.split('\n').map(l => {
    const m = l.match(/^(.+?)\s+x(\d+)$/i);
    return m ? { nombre: m[1].trim(), cantidad: parseInt(m[2]) } : { nombre: l.trim(), cantidad: 1 };
  }).filter(p => p.nombre);

  const { data, error } = await sb.from('orders').insert({
    canal, subcanal, cliente, productos, notas: notas || null,
    estado: canal === 'mayoristas' ? 'contacto' : 'pendiente',
    prioridad: 2,
    fuente: 'manual',
    creado_por: cu.id
  }).select().single();

  if (error) { showToast('Error al crear pedido: ' + error.message, 'error'); return; }
  await logActivity('nuevo_pedido', `Pedido creado: ${cliente}`, data.id);
  invalidateCache('orders');
  closeM('m-neworder');
  showToast('Pedido registrado');
  renderVentas();
}

function openStatusModal(ordId) {
  if (!['owner', 'admin', 'encargado', 'logistica'].includes(cu.role)) return;
  statusTarget = ordId;
  const order = null; // loaded async below
  (async () => {
    const { data: o } = await sb.from('orders').select('*').eq('id', ordId).single();
    if (!o) return;
    const next = {
      pendiente: ['en_produccion', 'cancelado'],
      en_produccion: ['producido', 'listo_despacho', 'cancelado'],
      producido: ['listo_despacho'],
      listo_despacho: ['despachado'],
      despachado: ['entregado'],
      entregado: [],
      cancelado: []
    };
    const opts = (next[o.estado] || []);
    $('ms-ti').textContent = `Cambiar estado: ${o.numero || o.id.slice(0, 8)}`;
    $('ms-body').innerHTML = `
      <p style="font-size:13px;color:var(--ink-muted);margin-bottom:16px">Estado actual: <strong>${SL[o.estado] || o.estado}</strong></p>
      ${opts.map(s => `<button class="btn${s === 'cancelado' ? ' r' : ''}" style="width:100%;margin-bottom:8px" onclick="changeStatus('${ordId}','${s}')">${SL[s]}</button>`).join('')}
      ${!opts.length ? '<p style="color:var(--ink-muted);font-size:13px">Sin transiciones disponibles.</p>' : ''}
    `;
    openM('m-status');
  })();
}

async function changeStatus(ordId, newStatus) {
  if (newStatus === 'cancelado') {
    closeM('m-status');
    cancelTarget = ordId;
    $('mc-info').textContent = 'Vas a cancelar este pedido. Esta acción no se puede deshacer.';
    openM('m-cancel');
    return;
  }
  const { error } = await sb.from('orders').update({ estado: newStatus }).eq('id', ordId);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  await logActivity('cambio_estado', `Pedido → ${SL[newStatus]}`, ordId);
  invalidateCache('orders');
  closeM('m-status');
  showToast('Estado actualizado');
  if (curPage === 'ventas') renderVentas();
  if (curPage === 'dashboard') renderDash();
}

async function confirmCancel() {
  const reason = $('mc-reason').value.trim();
  if (!reason) { showToast('El motivo es obligatorio', 'error'); return; }
  const { error } = await sb.from('orders').update({ estado: 'cancelado', cancelacion_motivo: reason }).eq('id', cancelTarget);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  await logActivity('cancelacion', `Pedido cancelado. Motivo: ${reason}`, cancelTarget);
  invalidateCache('orders');
  closeM('m-cancel');
  $('mc-reason').value = '';
  showToast('Pedido cancelado');
  if (curPage === 'ventas') renderVentas();
}

/* Edit Order */
async function openEditOrderModal(ordId) {
  const { data: o } = await sb.from('orders').select('*').eq('id', ordId).single();
  if (!o) return;
  $('modal-container').innerHTML = `
    <div class="modal-hd"><span class="modal-ti">Editar Pedido ${esc(o.numero || '')}</span><button class="modal-cl" onclick="closeM('modal-back')">×</button></div>
    <div class="modal-bd">
      <div class="fi"><label>Cliente</label><input class="fi-inp" type="text" id="eo-cliente" value="${esc(o.cliente || '')}"></div>
      <div class="fi-row">
        <div class="fi"><label>Canal</label><select class="fi-inp" id="eo-canal">
          ${['mercadolibre','tiendaweb','mayoristas','whatsapp','instagram'].map(c => `<option value="${c}" ${o.canal === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select></div>
        <div class="fi"><label>Prioridad</label><select class="fi-inp" id="eo-prio">
          <option value="1" ${o.prioridad === 1 ? 'selected' : ''}>P1 Urgente</option>
          <option value="2" ${o.prioridad === 2 ? 'selected' : ''}>P2 Normal</option>
          <option value="3" ${o.prioridad === 3 ? 'selected' : ''}>P3 Programado</option>
        </select></div>
      </div>
      <div class="fi"><label>Productos (uno por línea: Nombre xCantidad)</label>
        <textarea class="fi-inp" id="eo-prods">${(o.productos || []).map(p => p.nombre + ' x' + p.cantidad).join('\n')}</textarea></div>
      <div class="fi"><label>Notas</label><input class="fi-inp" type="text" id="eo-notas" value="${esc(o.notas || '')}"></div>
    </div>
    <div class="modal-ft"><button class="btn-ghost" onclick="closeM('modal-back')">Cancelar</button><button class="btn" onclick="submitEditOrder('${ordId}')">Guardar</button></div>
  `;
  openM('modal-back');
}

async function submitEditOrder(ordId) {
  const cliente = $('eo-cliente').value.trim();
  const canal = $('eo-canal').value;
  const prioridad = parseInt($('eo-prio').value);
  const prodsRaw = $('eo-prods').value.trim();
  const notas = $('eo-notas').value.trim();
  if (!cliente) { showToast('El cliente es obligatorio', 'error'); return; }
  const productos = prodsRaw.split('\n').map(l => {
    const m = l.match(/^(.+?)\s+x(\d+)$/i);
    return m ? { nombre: m[1].trim(), cantidad: parseInt(m[2]) } : { nombre: l.trim(), cantidad: 1 };
  }).filter(p => p.nombre);
  const { error: updErr } = await sb.from('orders').update({ cliente, canal, prioridad, productos, notas: notas || null }).eq('id', ordId);
  if (updErr) { showToast('Error al guardar: ' + updErr.message, 'error'); return; }
  await logActivity('orden_editada', `Pedido editado: ${cliente}`, ordId);
  invalidateCache('orders');
  closeM('modal-back');
  if (curPage === 'ventas') renderVentas();
}

/* ═══════════════════════════════════════════════════════════
   STOCK — dos sub-tabs
   ═══════════════════════════════════════════════════════════ */
async function renderStock() {
  updateStockActions();
  if (activeStockTab === 'materias') await renderMaterias();
  else await renderTerminados();
}

function switchStockTab(tab) {
  activeStockTab = tab;
  const tabs = document.querySelectorAll('#stock-tabs .tab');
  tabs[0].classList.toggle('on', tab === 'materias');
  tabs[1].classList.toggle('on', tab === 'terminados');
  $('stock-materias-body').style.display = tab === 'materias' ? '' : 'none';
  $('stock-terminados-body').style.display = tab === 'terminados' ? '' : 'none';
  updateStockActions();
  if (tab === 'materias') renderMaterias();
  else renderTerminados();
}

function updateStockActions() {
  const actionsEl = $('stock-actions');
  if (!actionsEl || !canManage('stock')) return;
  if (activeStockTab === 'materias') {
    actionsEl.innerHTML = `<button class="btn-ghost" onclick="openAddStock()">+ Agregar Materia Prima</button>`;
  } else {
    actionsEl.innerHTML = `<button class="btn-ghost" onclick="openAddProduct()">+ Agregar Producto</button>`;
  }
}

async function renderMaterias() {
  showLoading('stock-materias-body');
  const { data, error } = await sb.from('stock').select('id,nombre,categoria,unidad,cantidad,min_warn,min_crit').order('categoria').order('nombre');
  if (error) { $('stock-materias-body').innerHTML = '<div style="padding:20px;color:var(--ink-muted)">Error al cargar stock.</div>'; return; }
  const items = data || [];

  if (!items.length) {
    $('stock-materias-body').innerHTML = '<div style="padding:32px;text-align:center;color:var(--ink-muted);font-size:13px">Sin materias primas cargadas. Usá "+ Agregar Materia Prima" para comenzar.</div>';
    return;
  }

  const byCat = {};
  items.forEach(s => { const c = s.categoria || 'General'; if (!byCat[c]) byCat[c] = []; byCat[c].push(s); });

  $('stock-materias-body').innerHTML = Object.entries(byCat).map(([cat, its]) => `
    <div style="margin-bottom:24px">
      <div style="font-size:11px;font-weight:700;letter-spacing:.1em;color:var(--ink-muted);margin-bottom:12px;text-transform:uppercase">${esc(cat)}</div>
      <div class="stock-g">
        ${its.map(s => {
          const tc = tlClass(s);
          return `
          <div class="stk-c ${tc}">
            <div class="stk-nm"><span class="tl ${tc}"></span>${esc(s.nombre)}</div>
            <div class="stk-q">${s.cantidad}</div>
            <div class="stk-u">${esc(s.unidad)}</div>
            <div class="stk-th"><span>Mín: ${s.min_warn}</span><span>Crit: ${s.min_crit}</span></div>
            <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">
              <button class="btn-ghost sm" onclick="openStockUpd('${s.id}',this.dataset.nm,${s.cantidad})" data-nm="${esc(s.nombre)}">Actualizar</button>
              ${ownerEditBtn('stock', s.id)}
              ${ownerBtns('stock', s.id)}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>
  `).join('');
}

async function renderTerminados() {
  showLoading('stock-terminados-body');
  const { data, error } = await sb.from('finished_products')
    .select('id,nombre,sku,modelo,variante,categoria,stock_actual,stock_minimo,min_crit')
    .order('categoria').order('nombre');
  if (error) { $('stock-terminados-body').innerHTML = '<div style="padding:20px;color:var(--ink-muted)">Error al cargar stock embalado.</div>'; return; }
  const items = data || [];

  if (!items.length) {
    $('stock-terminados-body').innerHTML = '<div style="padding:32px;text-align:center;color:var(--ink-muted);font-size:13px">Sin productos embalados cargados. Usá "+ Agregar Producto" para comenzar.</div>';
    return;
  }

  const critCount = items.filter(p => tlClassFP(p) === 'tr').length;
  const warnCount = items.filter(p => tlClassFP(p) === 'ty').length;

  $('stock-terminados-body').innerHTML = `
    ${critCount > 0 || warnCount > 0 ? `
    <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">
      ${critCount > 0 ? `<div class="badge-info r">⚠ ${critCount} producto${critCount > 1 ? 's' : ''} en nivel crítico</div>` : ''}
      ${warnCount > 0 ? `<div class="badge-info a">▲ ${warnCount} producto${warnCount > 1 ? 's' : ''} bajo mínimo</div>` : ''}
    </div>` : ''}
    <div style="overflow-x:auto">
      <table class="dt">
        <thead><tr>
          <th>Modelo</th><th>Variante</th><th>SKU</th>
          <th style="text-align:center">Stock</th><th style="text-align:center">Mín</th><th style="text-align:center">Estado</th><th></th>
        </tr></thead>
        <tbody>
          ${items.map(p => {
            const tc = tlClassFP(p);
            const stateLabel = tc === 'tr' ? 'Crítico' : tc === 'ty' ? 'Bajo stock' : 'OK';
            const stateColor = tc === 'tr' ? 'r' : tc === 'ty' ? 'a' : 'g';
            const stockColor = tc === 'tr' ? 'var(--red)' : tc === 'ty' ? 'var(--amber,#f59e0b)' : 'var(--green)';
            return `
            <tr>
              <td style="font-weight:600">${esc(p.modelo || p.nombre)}</td>
              <td style="color:var(--ink-muted);font-size:12px">${esc(p.variante || '—')}</td>
              <td style="font-family:monospace;font-size:11px">${esc(p.sku || '—')}</td>
              <td style="text-align:center">
                <div style="display:flex;align-items:center;gap:6px;justify-content:center">
                  <span class="tl ${tc}"></span>
                  <span style="font-weight:700;color:${stockColor}">${p.stock_actual}</span>
                </div>
              </td>
              <td style="text-align:center;color:var(--ink-muted)">${p.stock_minimo}</td>
              <td style="text-align:center"><span class="badge-info ${stateColor}">${stateLabel}</span></td>
              <td style="display:flex;gap:4px;flex-wrap:wrap">
                <button class="btn-ghost sm" onclick="openProductUpd('${p.id}',this.dataset.nm,${p.stock_actual})" data-nm="${esc(p.nombre)}">Actualizar</button>
                ${ownerEditBtn('finished_product', p.id)}
                ${ownerBtns('finished_product', p.id)}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/* Stock (materias primas) modals */
function openStockUpd(id, nombre, qty) {
  stockUpdTarget = { id, nombre };
  $('su-ti').textContent = `Actualizar: ${nombre}`;
  $('su-qty').value = qty;
  $('su-hist').innerHTML = '';
  loadStockHist(id);
  openM('m-stock-upd');
}

async function loadStockHist(stockId) {
  const { data } = await sb.from('stock_history').select('*').eq('stock_id', stockId).order('created_at', { ascending: false }).limit(5);
  if (!data || !data.length) return;
  $('su-hist').innerHTML = `
    <div style="font-size:11px;font-weight:700;letter-spacing:.08em;color:var(--ink-muted);margin-bottom:8px">ÚLTIMOS CAMBIOS</div>
    ${data.map(h => `<div style="display:flex;justify-content:space-between;font-size:12px;padding:6px 0;border-bottom:1px solid var(--border)"><span>${esc(h.usuario_nombre || '—')}</span><span style="font-weight:600">${h.cantidad_anterior} → ${h.cantidad_nueva}</span><span style="color:var(--ink-muted)">${fdDate(h.created_at)}</span></div>`).join('')}
  `;
}

async function confirmStockUpd() {
  const qty = parseFloat($('su-qty').value);
  if (isNaN(qty) || qty < 0) { showToast('Cantidad inválida', 'error'); return; }
  const { data: cur } = await sb.from('stock').select('cantidad').eq('id', stockUpdTarget.id).single();
  await sb.from('stock').update({ cantidad: qty }).eq('id', stockUpdTarget.id);
  await sb.from('stock_history').insert({
    stock_id: stockUpdTarget.id,
    cantidad_anterior: cur?.cantidad ?? 0,
    cantidad_nueva: qty,
    usuario_id: cu.id,
    usuario_nombre: cu.name,
    motivo: 'actualizacion_manual'
  });
  await logActivity('stock_actualizado', `${stockUpdTarget.nombre}: ${cur?.cantidad ?? 0} → ${qty}`, stockUpdTarget.id);
  invalidateCache('stock');
  closeM('m-stock-upd');
  showToast('Stock actualizado');
  renderMaterias();
}

function openAddStock() {
  ['sa-nm','sa-cat','sa-unit','sa-qty','sa-warn','sa-crit'].forEach(id => { const el = $(id); if (el) el.value = ''; });
  openM('m-stock-add');
}

async function confirmAddStock() {
  const nombre = $('sa-nm').value.trim();
  const categoria = $('sa-cat').value.trim() || 'General';
  const unidad = $('sa-unit').value.trim() || 'unidades';
  const cantidad = parseFloat($('sa-qty').value) || 0;
  const min_warn = parseFloat($('sa-warn').value) || 0;
  const min_crit = parseFloat($('sa-crit').value) || 0;
  if (!nombre) { showToast('El nombre es obligatorio', 'error'); return; }
  const { error } = await sb.from('stock').insert({ nombre, categoria, unidad, cantidad, min_warn, min_crit });
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  await logActivity('stock_creado', `Nuevo insumo: ${nombre}`);
  invalidateCache('stock');
  closeM('m-stock-add');
  showToast('Insumo agregado');
  renderMaterias();
}

/* Edit Stock */
async function openEditStockModal(sid) {
  const { data: s } = await sb.from('stock').select('*').eq('id', sid).single();
  if (!s) return;
  $('modal-container').innerHTML = `
    <div class="modal-hd"><span class="modal-ti">Editar: ${esc(s.nombre)}</span><button class="modal-cl" onclick="closeM('modal-back')">×</button></div>
    <div class="modal-bd">
      <div class="fi"><label>Nombre</label><input class="fi-inp" type="text" id="es-nm" value="${esc(s.nombre)}"></div>
      <div class="fi-row">
        <div class="fi"><label>Categoría</label><input class="fi-inp" type="text" id="es-cat" value="${esc(s.categoria || '')}"></div>
        <div class="fi"><label>Unidad</label><input class="fi-inp" type="text" id="es-unit" value="${esc(s.unidad || '')}"></div>
      </div>
      <div class="fi-row">
        <div class="fi"><label>Mín. recomendado</label><input class="fi-inp" type="number" id="es-warn" value="${s.min_warn}"></div>
        <div class="fi"><label>Cantidad crítica</label><input class="fi-inp" type="number" id="es-crit" value="${s.min_crit}"></div>
      </div>
    </div>
    <div class="modal-ft"><button class="btn-ghost" onclick="closeM('modal-back')">Cancelar</button><button class="btn" onclick="submitEditStock('${sid}')">Guardar</button></div>
  `;
  openM('modal-back');
}

async function submitEditStock(sid) {
  const nombre = $('es-nm').value.trim();
  const categoria = $('es-cat').value.trim();
  const unidad = $('es-unit').value.trim();
  const min_warn = parseFloat($('es-warn').value) || 0;
  const min_crit = parseFloat($('es-crit').value) || 0;
  if (!nombre) { showToast('El nombre es obligatorio', 'error'); return; }
  await sb.from('stock').update({ nombre, categoria, unidad, min_warn, min_crit }).eq('id', sid);
  invalidateCache('stock');
  closeM('modal-back');
  renderMaterias();
}

/* Finished products modals */
function openProductUpd(id, nombre, qty) {
  productUpdTarget = { id, nombre };
  $('pu-ti').textContent = `Actualizar stock: ${nombre}`;
  $('pu-qty').value = qty;
  openM('m-product-upd');
}

async function confirmProductUpd() {
  const qty = parseInt($('pu-qty').value);
  if (isNaN(qty) || qty < 0) { showToast('Cantidad inválida', 'error'); return; }
  await sb.from('finished_products').update({ stock_actual: qty }).eq('id', productUpdTarget.id);
  await logActivity('producto_stock_actualizado', `${productUpdTarget.nombre}: stock → ${qty}`, productUpdTarget.id);
  closeM('m-product-upd');
  showToast('Stock actualizado');
  renderTerminados();
}

function openAddProduct() {
  ['pa-nm','pa-modelo','pa-variante','pa-sku','pa-qty','pa-min','pa-mincrit','pa-cat','pa-notes'].forEach(id => { const el = $(id); if (el) el.value = ''; });
  openM('m-product-add');
}

async function confirmAddProduct() {
  const nombre = $('pa-nm').value.trim();
  const modelo = $('pa-modelo')?.value.trim() || '';
  const variante = $('pa-variante')?.value.trim() || '';
  const sku = $('pa-sku').value.trim();
  const stock_actual = parseInt($('pa-qty').value) || 0;
  const stock_minimo = parseInt($('pa-min').value) || 0;
  const min_crit = $('pa-mincrit')?.value !== '' ? parseInt($('pa-mincrit').value) : null;
  const categoria = $('pa-cat').value.trim() || 'General';
  const notas = $('pa-notes').value.trim();
  if (!nombre) { showToast('El nombre es obligatorio', 'error'); return; }
  const { error } = await sb.from('finished_products').insert({
    nombre, modelo: modelo || null, variante: variante || null,
    sku: sku || null, stock_actual, stock_minimo,
    min_crit: min_crit !== null ? min_crit : null,
    categoria, notas: notas || null
  });
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  await logActivity('producto_creado', `Nuevo producto embalado: ${nombre}`);
  closeM('m-product-add');
  showToast('Producto agregado');
  renderTerminados();
}

async function openEditFinishedProductModal(id) {
  const { data: p } = await sb.from('finished_products').select('*').eq('id', id).single();
  if (!p) return;
  $('modal-container').innerHTML = `
    <div class="modal-hd"><span class="modal-ti">Editar: ${esc(p.nombre)}</span><button class="modal-cl" onclick="closeM('modal-back')">×</button></div>
    <div class="modal-bd">
      <div class="fi"><label>Nombre</label><input class="fi-inp" type="text" id="ep-nm" value="${esc(p.nombre)}"></div>
      <div class="fi-row">
        <div class="fi"><label>Modelo</label><input class="fi-inp" type="text" id="ep-modelo" value="${esc(p.modelo || '')}"></div>
        <div class="fi"><label>Variante / Color</label><input class="fi-inp" type="text" id="ep-variante" value="${esc(p.variante || '')}"></div>
      </div>
      <div class="fi"><label>SKU</label><input class="fi-inp" type="text" id="ep-sku" value="${esc(p.sku || '')}"></div>
      <div class="fi-row">
        <div class="fi"><label>Stock mínimo (aviso)</label><input class="fi-inp" type="number" id="ep-min" value="${p.stock_minimo || 0}"></div>
        <div class="fi"><label>Stock crítico (rojo)</label><input class="fi-inp" type="number" id="ep-mincrit" value="${p.min_crit != null ? p.min_crit : ''}"></div>
      </div>
      <div class="fi"><label>Categoría</label><input class="fi-inp" type="text" id="ep-cat" value="${esc(p.categoria || '')}"></div>
    </div>
    <div class="modal-ft"><button class="btn-ghost" onclick="closeM('modal-back')">Cancelar</button><button class="btn" onclick="submitEditFinishedProduct('${id}')">Guardar</button></div>
  `;
  openM('modal-back');
}

async function submitEditFinishedProduct(id) {
  const nombre = $('ep-nm').value.trim();
  const modelo = $('ep-modelo')?.value.trim() || '';
  const variante = $('ep-variante')?.value.trim() || '';
  const sku = $('ep-sku').value.trim();
  const stock_minimo = parseInt($('ep-min').value) || 0;
  const min_crit = $('ep-mincrit')?.value !== '' ? parseInt($('ep-mincrit').value) : null;
  const categoria = $('ep-cat').value.trim();
  if (!nombre) { showToast('El nombre es obligatorio', 'error'); return; }
  await sb.from('finished_products').update({
    nombre, modelo: modelo || null, variante: variante || null,
    sku: sku || null, stock_minimo,
    min_crit: min_crit !== null ? min_crit : null,
    categoria, updated_at: new Date().toISOString()
  }).eq('id', id);
  await logActivity('producto_editado', `Producto embalado editado: ${nombre}`, id);
  closeM('modal-back');
  showToast('Producto actualizado');
  renderTerminados();
}

/* ═══════════════════════════════════════════════════════════
   PRODUCCIÓN
   ═══════════════════════════════════════════════════════════ */
async function renderProduccion() {
  showLoading('produccion-body');
  const today = new Date().toISOString().split('T')[0];
  const isPrivate = ['encargado', 'cnc', 'melamina', 'pino', 'embalaje', 'carpinteria'].includes(cu.role);

  const [ordersRes, recentLogsRes, allLogsRes] = await Promise.all([
    sb.from('orders').select('productos').neq('canal', 'reporte').not('estado', 'in', '("cancelado","entregado","despachado")'),
    sb.from('prod_logs').select('id,modelo,variante,unidades,unidades_falla,sector,etapa,notas,subcanal,usuario_nombre,created_at').order('created_at', { ascending: false }).limit(50),
    sb.from('prod_logs').select('modelo,unidades')
  ]);

  if (recentLogsRes.error) { $('produccion-body').innerHTML = '<div style="padding:20px;color:var(--ink-muted)">Error al cargar registros.</div>'; return; }

  const logs = recentLogsRes.data || [];
  const activeOrders = ordersRes.data || [];
  const allLogs = allLogsRes.data || [];

  // Build pending map: key is sku (when available) or product name
  const pendingMap = {};
  for (const ord of activeOrders) {
    for (const p of (ord.productos || [])) {
      const key = (p.sku || p.nombre || '').trim();
      if (!key) continue;
      if (!pendingMap[key]) pendingMap[key] = { label: p.nombre || p.sku || key, vendido: 0, producido: 0 };
      pendingMap[key].vendido += parseInt(p.cantidad || 1);
    }
  }
  // Subtract all-time prod_logs (match by sku first, then modelo)
  for (const l of allLogs) {
    const key = (l.sku || l.modelo || '').trim();
    if (!key) continue;
    if (!pendingMap[key]) pendingMap[key] = { label: l.modelo || key, vendido: 0, producido: 0 };
    pendingMap[key].producido += parseInt(l.unidades || 0);
  }

  const pendingRows = Object.entries(pendingMap)
    .map(([key, d]) => ({ modelo: d.label || key, vendido: d.vendido, producido: Math.min(d.producido, d.vendido), restante: Math.max(0, d.vendido - d.producido) }))
    .filter(r => r.vendido > 0)
    .sort((a, b) => b.restante - a.restante);

  const totalPending = pendingRows.reduce((a, r) => a + r.restante, 0);
  const todayLogs = logs.filter(l => l.created_at?.startsWith(today));
  const todayUnits = todayLogs.reduce((a, l) => a + (l.unidades || 0), 0);
  const todayWaste = todayLogs.reduce((a, l) => a + (l.unidades_falla || 0), 0);

  $('produccion-body').innerHTML = `
    <div class="sg" style="margin-bottom:20px">
      <div class="sc g">
        <div class="sc-l">Unidades hoy</div>
        <div class="sc-v">${todayUnits}</div>
      </div>
      <div class="sc ${totalPending > 0 ? 'r' : 'g'}">
        <div class="sc-l">Pendiente acumulado</div>
        <div class="sc-v">${totalPending}</div>
      </div>
      <div class="sc ${todayWaste > 0 ? 'r' : ''}">
        <div class="sc-l">Fallas hoy</div>
        <div class="sc-v">${todayWaste}</div>
      </div>
      <div class="sc b">
        <div class="sc-l">Modelos activos</div>
        <div class="sc-v">${pendingRows.filter(r => r.restante > 0).length}</div>
      </div>
    </div>
    ${pendingRows.length ? `
    <div class="card" style="padding:20px;margin-bottom:16px">
      <div style="font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-muted);margin-bottom:14px">PENDIENTE DE PRODUCCIÓN (acumulado)</div>
      <div style="overflow-x:auto">
        <table class="dt">
          <thead><tr>
            <th>Modelo</th>
            <th style="text-align:center">Pedido</th>
            <th style="text-align:center">Producido</th>
            <th style="text-align:center">Restante</th>
            <th style="text-align:center">Avance</th>
          </tr></thead>
          <tbody>
            ${pendingRows.map(r => {
              const pct = r.vendido > 0 ? Math.round((r.producido / r.vendido) * 100) : 100;
              const done = r.restante === 0;
              return `<tr>
                <td style="font-weight:600">${esc(r.modelo)}</td>
                <td style="text-align:center;font-family:var(--mono);font-weight:700">${r.vendido}</td>
                <td style="text-align:center;font-family:var(--mono);color:var(--green)">${r.producido}</td>
                <td style="text-align:center;font-family:var(--mono);font-weight:700;color:${done ? 'var(--green)' : 'var(--red)'}">${r.restante}</td>
                <td style="text-align:center">
                  <div style="display:flex;align-items:center;gap:6px;justify-content:center">
                    <div style="width:50px;height:4px;background:var(--paper-dim)">
                      <div style="width:${Math.min(100,pct)}%;height:100%;background:${done ? 'var(--green)' : 'var(--blue)'}"></div>
                    </div>
                    <span style="font-size:10px;font-family:var(--mono);color:var(--ink-muted)">${pct}%</span>
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}
    <div class="card" style="padding:20px">
      <div style="font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-muted);margin-bottom:14px">REGISTROS RECIENTES</div>
      ${logs.length ? `
        <div style="overflow-x:auto">
          <table class="dt">
            <thead><tr>
              <th>Fecha</th><th>Modelo</th><th>Para</th><th>Etapa</th><th>Sector</th>
              <th style="text-align:center">Uds.</th><th style="text-align:center">Fallas</th>
              ${!isPrivate ? '<th>Usuario</th>' : ''}
              <th></th>
            </tr></thead>
            <tbody>
              ${logs.map(l => {
                const carrierBadge = l.subcanal === 'colecta'
                  ? `<span class="badge-info b" style="font-size:10px">Colecta</span>`
                  : l.subcanal === 'flex'
                  ? `<span class="badge-info g" style="font-size:10px">Flex</span>`
                  : `<span style="font-size:11px;color:var(--ink-muted)">—</span>`;
                return `
                <tr>
                  <td style="font-size:11px;color:var(--ink-muted)">${fdDate(l.created_at)}</td>
                  <td style="font-weight:600">${esc(l.modelo || '—')}${l.variante ? `<br><span style="font-size:11px;color:var(--ink-muted)">${esc(l.variante)}</span>` : ''}</td>
                  <td>${carrierBadge}</td>
                  <td><span class="badge-info b" style="font-size:10px">${esc(l.etapa || 'general')}</span></td>
                  <td style="font-size:12px;color:var(--ink-muted)">${esc(l.sector || '—')}</td>
                  <td style="text-align:center;font-weight:700">${l.unidades || 0}</td>
                  <td style="text-align:center;color:${(l.unidades_falla || 0) > 0 ? 'var(--red)' : 'var(--ink-muted)'}">${l.unidades_falla || 0}</td>
                  ${!isPrivate ? `<td style="font-size:12px;color:var(--ink-muted)">${esc(l.usuario_nombre || '—')}</td>` : ''}
                  <td>${ownerBtns('prod_log', l.id)}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      ` : '<div style="color:var(--ink-muted);font-size:13px;padding:16px 0">Sin registros de producción aún.</div>'}
    </div>
  `;
}

// Mapa de rol → sector para auto-seleccionar
const ROLE_SECTOR = { cnc:'CNC', melamina:'Melamina', pino:'Pino', embalaje:'Embalaje', carpinteria:'Carpinteria', encargado:'General', owner:'General', admin:'General' };

// Catálogo cacheado para el modal de producción
let _prodCatalog = [];

function openRegisterProd() {
  const today = new Date().toISOString().split('T')[0];
  const sel = $('mp-model-sel');
  if (sel) sel.value = '';
  const info = $('mp-selected-info');
  if (info) { info.style.display = 'none'; info.innerHTML = ''; }
  $('mp-qty').value = '';
  $('mp-date').value = today;
  $('mp-notes').value = '';
  $('mp-waste').value = '0';
  $('mp-waste-notes-wrap').style.display = 'none';
  $('mp-waste-notes').value = '';
  const etEl = $('mp-etapa'); if (etEl) etEl.value = 'general';

  // Auto-seleccionar sector según rol del usuario
  const secEl = $('mp-sector');
  if (secEl) secEl.value = ROLE_SECTOR[cu.role] || 'General';

  // Reset scan input
  const scanEl = $('mp-scan-input');
  if (scanEl) { scanEl.value = ''; scanEl.style.borderColor = ''; }

  // Reset carrier
  document.querySelectorAll('input[name="prod-carrier"]').forEach(r => r.checked = false);
  updateProdCarrierStyles(null);
  const errEl = $('prod-carrier-error');
  if (errEl) errEl.style.display = 'none';

  Promise.all([loadOrdersForProd(), loadProductCatalogForProd()]);
  openM('m-prod');
  setTimeout(() => { const s = $('mp-model-sel'); if (s) s.focus(); }, 200);
}

function getProdCarrier() {
  const sel = document.querySelector('input[name="prod-carrier"]:checked');
  return sel ? sel.value : null;
}

function onProdCarrierChange() {
  const val = getProdCarrier();
  updateProdCarrierStyles(val);
  const errEl = $('prod-carrier-error');
  if (errEl) errEl.style.display = 'none';
}

function updateProdCarrierStyles(val) {
  const lblC = $('prod-lbl-colecta');
  const lblF = $('prod-lbl-flex');
  if (!lblC || !lblF) return;
  lblC.style.borderColor = val === 'colecta' ? 'var(--blue)' : 'var(--border)';
  lblC.style.background  = val === 'colecta' ? 'color-mix(in srgb, var(--blue) 8%, transparent)' : '';
  lblF.style.borderColor = val === 'flex'    ? 'var(--green)' : 'var(--border)';
  lblF.style.background  = val === 'flex'    ? 'color-mix(in srgb, var(--green) 8%, transparent)' : '';
}

function onProdModelChange(sel) {
  const info = $('mp-selected-info');
  if (!sel.value) { info.style.display = 'none'; return; }
  const p = _prodCatalog.find(x => x.id === sel.value);
  if (p) {
    const nombre = p.nombre_display || (p.modelo + (p.variante ? ' ' + p.variante : ''));
    info.style.display = 'block';
    info.innerHTML = `<strong style="font-family:monospace;color:var(--blue)">${esc(p.sku)}</strong> — ${esc(nombre)}${p.categoria ? `<span style="color:var(--ink-muted);font-size:11px"> · ${esc(p.categoria)}</span>` : ''}`;
    // Focus quantity field for fast entry
    setTimeout(() => { $('mp-qty').focus(); $('mp-qty').select(); }, 50);
  }
}

function toggleWasteNotes(input) {
  const wrap = $('mp-waste-notes-wrap');
  if (wrap) wrap.style.display = parseInt(input.value) > 0 ? '' : 'none';
}

async function loadProductCatalogForProd() {
  const sel = $('mp-model-sel');
  if (!sel) return;

  const { data: catalog } = await sb.from('product_catalog')
    .select('id,sku,modelo,variante,nombre_display,categoria')
    .eq('es_fabricado', true)
    .eq('activo', true)
    .order('sku');

  _prodCatalog = catalog || [];

  if (_prodCatalog.length) {
    sel.innerHTML = '<option value="">— Seleccioná el producto —</option>' +
      _prodCatalog.map(p => {
        const nombre = p.nombre_display || (p.modelo + (p.variante ? ' ' + p.variante : ''));
        return `<option value="${p.id}">${esc(p.sku)} — ${esc(nombre)}</option>`;
      }).join('');
  } else {
    // Fallback: unique models from prod_logs as plain options
    const { data: logModels } = await sb.from('prod_logs').select('modelo').order('modelo');
    const unique = [...new Set((logModels || []).map(l => l.modelo).filter(Boolean))];
    sel.innerHTML = '<option value="">— Seleccioná el producto —</option>' +
      unique.map(m => `<option value="__log__${esc(m)}">${esc(m)}</option>`).join('');
    _prodCatalog = [];
  }
}

async function loadOrdersForProd() {
  const { data } = await sb.from('orders')
    .select('id,numero,cliente')
    .neq('canal', 'reporte')
    .in('estado', ['pendiente', 'en_produccion'])
    .order('created_at', { ascending: false });
  const sel = $('mp-ord');
  if (!sel) return;
  const isPrivate = ['encargado', 'cnc', 'melamina', 'pino', 'embalaje', 'carpinteria'].includes(cu.role);
  sel.innerHTML = '<option value="">— Producción general —</option>' +
    (data || []).map(o => {
      const num = o.numero || o.id.slice(0, 8);
      const label = isPrivate ? `Pedido ${esc(num)}` : `${esc(num)} — ${esc(o.cliente)}`;
      return `<option value="${o.id}">${label}</option>`;
    }).join('');
}

async function submitProd() {
  const selVal = $('mp-model-sel').value;
  if (!selVal) { showToast('Seleccioná un producto', 'error'); $('mp-model-sel').focus(); return; }

  const unidades = parseInt($('mp-qty').value) || 0;
  if (unidades <= 0) { showToast('Ingresá la cantidad producida', 'error'); $('mp-qty').focus(); return; }

  // Carrier es obligatorio
  const subcanal = getProdCarrier();
  if (!subcanal) {
    const errEl = $('prod-carrier-error');
    if (errEl) errEl.style.display = '';
    showToast('Seleccioná Colecta o Flex', 'error');
    return;
  }

  // Resolve modelo/variante/sku from catalog selection
  let modelo, variante, sku;
  if (selVal.startsWith('__log__')) {
    modelo = selVal.replace('__log__', '');
    variante = null; sku = null;
  } else {
    const p = _prodCatalog.find(x => x.id === selVal);
    if (!p) { showToast('Producto no encontrado', 'error'); return; }
    modelo = p.modelo;
    variante = p.variante || null;
    sku = p.sku;
  }

  const fecha = $('mp-date').value;
  const sector = $('mp-sector').value;
  const etapa = $('mp-etapa')?.value || 'general';
  const notas = $('mp-notes').value.trim();
  const unidades_falla = parseInt($('mp-waste').value) || 0;
  const falla_descripcion = $('mp-waste-notes').value.trim();
  const orden_id = $('mp-ord').value || null;

  const btn = document.querySelector('#m-prod .btn.g');
  lockBtn(btn);

  const { error } = await sb.from('prod_logs').insert({
    modelo, variante, sku, etapa, unidades, fecha, sector, subcanal,
    notas: notas || null, unidades_falla,
    falla_descripcion: falla_descripcion || null,
    orden_id, usuario_id: cu.id, usuario_nombre: cu.name
  });

  if (error) { showToast('Error: ' + error.message, 'error'); unlockBtn(btn, '✓ Registrar'); return; }
  const carrierLabel = subcanal === 'colecta' ? 'Colecta' : 'Flex';
  await logActivity('produccion_registrada', `Producción: ${sku || modelo}${variante ? ' (' + variante + ')' : ''} ×${unidades} — ${sector} — ${carrierLabel}`, orden_id);
  closeM('m-prod');
  showToast(`✓ ${unidades} ${esc(sku || modelo)} (${carrierLabel}) registradas`);
  renderProduccion();
}

/* ═══════════════════════════════════════════════════════════
   NOTIFICACIONES
   ═══════════════════════════════════════════════════════════ */
async function renderNotifs() {
  showLoading('notifs-body');
  const { data } = await sb.from('notifications')
    .select('id,tipo,titulo,mensaje,para_roles,leida_por,created_at')
    .contains('para_roles', [cu.role])
    .order('created_at', { ascending: false })
    .limit(50);

  const notifs = data || [];
  if (!notifs.length) {
    $('notifs-body').innerHTML = '<div style="padding:32px;text-align:center;color:var(--ink-muted);font-size:13px">Sin notificaciones.</div>';
    return;
  }

  $('notifs-body').innerHTML = notifs.map(n => {
    const read = (n.leida_por || []).includes(cu.id);
    const icon = NOTIF_ICONS[n.tipo] || '◌';
    const color = NOTIF_COLORS[n.tipo] || 'b';
    return `
      <div class="notif-i${read ? '' : ' unread'}" onclick="markRead('${n.id}', this)">
        <div class="notif-ico ${color}">${icon}</div>
        <div style="flex:1;min-width:0">
          <div class="notif-ti">${esc(n.titulo)}</div>
          <div class="notif-msg">${esc(n.mensaje)}</div>
          <div class="notif-tm">${fdTime(n.created_at)}</div>
        </div>
        ${!read ? '<div class="unread-dot"></div>' : ''}
      </div>
    `;
  }).join('');
}

async function markRead(notifId, el) {
  if (!el || el.classList.contains('notif-i') && !el.classList.contains('unread')) return;
  el?.classList.remove('unread');
  el?.querySelector('.unread-dot')?.remove();
  await sb.rpc('mark_notification_read', { notif_id: notifId, user_id: cu.id });
  buildNav(); // refresh badge count
}

async function markAllRead() {
  await sb.rpc('mark_all_notifications_read', { user_id: cu.id, user_role: cu.role });
  showToast('Todas las notificaciones marcadas como leídas');
  renderNotifs();
  buildNav();
}

/* ═══════════════════════════════════════════════════════════
   CONFIG
   ═══════════════════════════════════════════════════════════ */
async function renderConfig() {
  if (!['owner', 'admin'].includes(cu.role)) {
    $('config-body').innerHTML = '<div style="padding:40px;text-align:center;color:var(--ink-muted)">Acceso restringido.</div>';
    return;
  }
  showLoading('config-body');

  const [usersRes, catalogRes] = await Promise.all([
    sb.from('profiles').select('id,name,username,role,area,active').order('name'),
    sb.from('product_catalog').select('*').order('categoria').order('modelo')
  ]);
  const users = usersRes.data || [];
  const catalog = catalogRes.data || [];

  const fabricados = catalog.filter(p => p.es_fabricado && p.activo).length;
  const revendidos = catalog.filter(p => !p.es_fabricado && p.activo).length;
  const inactivos = catalog.filter(p => !p.activo).length;

  $('config-body').innerHTML = `
    <div class="card" style="padding:20px;margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div style="font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-muted)">USUARIOS</div>
        ${isOwner() ? `<button class="btn" onclick="openAddUser()">+ Agregar Usuario</button>` : ''}
      </div>
      <div style="overflow-x:auto">
        <table class="dt">
          <thead><tr><th>Nombre</th><th>Username</th><th>Rol</th><th>Área</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            ${(users || []).map(u => `
              <tr>
                <td style="font-weight:600">${esc(u.name)}</td>
                <td style="font-family:monospace;font-size:11px">${esc(u.username || '—')}</td>
                <td>${esc(RL[u.role] || u.role)}</td>
                <td style="color:var(--ink-muted)">${esc(u.area || '—')}</td>
                <td><span class="badge-info ${u.active ? 'g' : 'r'}" style="display:inline-block">${u.active ? 'Activo' : 'Inactivo'}</span></td>
                <td style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
                  <button class="btn-ghost sm" onclick="openEditUserModal('${u.id}')">✎ Editar</button>
                  ${isOwner() && u.id !== cu.id ? `
                    <button class="btn-ghost sm" onclick="toggleUserActive('${u.id}',${!u.active})">${u.active ? 'Desactivar' : 'Activar'}</button>
                    <button class="btn-ghost sm r" onclick="confirmDeleteUser('${u.id}','${esc(u.name)}')">✕</button>
                  ` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card" style="padding:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div>
          <div style="font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-muted)">CATÁLOGO DE PRODUCTOS</div>
          <div style="font-size:11px;color:var(--ink-muted);margin-top:3px">${fabricados} fabricados · ${revendidos} revendidos${inactivos > 0 ? ` · ${inactivos} inactivos` : ''}</div>
        </div>
        <button class="btn" onclick="openAddCatalogProduct()">+ Agregar Producto</button>
      </div>
      ${catalog.length === 0 ? `
        <div style="padding:32px;text-align:center;color:var(--ink-muted);font-size:13px">
          Sin productos en el catálogo. Agregá los modelos que fabrica o revende Justo Makario.
        </div>` : `
      <div style="overflow-x:auto;margin-top:12px">
        <table class="dt">
          <thead><tr>
            <th>SKU / Abrev.</th><th>Modelo</th><th>Variante</th><th>Categoría</th>
            <th style="text-align:center">Tipo</th><th style="text-align:center">Estado</th><th></th>
          </tr></thead>
          <tbody>
            ${catalog.map(p => `
              <tr style="${!p.activo ? 'opacity:.5' : ''}">
                <td style="font-family:monospace;font-size:12px;font-weight:700;color:var(--blue)">${esc(p.sku)}</td>
                <td style="font-weight:600">${esc(p.modelo)}</td>
                <td style="color:var(--ink-muted);font-size:12px">${esc(p.variante || '—')}</td>
                <td style="font-size:12px;color:var(--ink-muted)">${esc(p.categoria || '—')}</td>
                <td style="text-align:center">
                  <span class="badge-info ${p.es_fabricado ? 'b' : 'a'}" style="font-size:10px">${p.es_fabricado ? 'Fabricado' : 'Revendido'}</span>
                </td>
                <td style="text-align:center">
                  <span class="badge-info ${p.activo ? 'g' : 'r'}" style="font-size:10px">${p.activo ? 'Activo' : 'Inactivo'}</span>
                </td>
                <td style="display:flex;gap:4px;flex-wrap:wrap">
                  <button class="btn-ghost sm b" onclick="showQR('${esc(p.sku)}','${esc(p.nombre_display || p.modelo)}')" title="Ver QR del SKU">QR</button>
                  <button class="btn-ghost sm" onclick="openEditCatalogProduct('${p.id}')">✎</button>
                  <button class="btn-ghost sm" onclick="toggleCatalogProductActive('${p.id}',${!p.activo})">${p.activo ? 'Desactivar' : 'Activar'}</button>
                  ${isOwner() ? `<button class="btn-ghost sm r" onclick="confirmDeleteCatalogProduct('${p.id}','${esc(p.sku)}')">✕</button>` : ''}
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`}
    </div>
  `;
}

/* ═══ Catálogo de Productos — CRUD ═══ */

function openAddCatalogProduct() {
  $('modal-container').innerHTML = `
    <div class="modal-hd"><span class="modal-ti">Agregar Producto al Catálogo</span><button class="modal-cl" onclick="closeM('modal-back')">×</button></div>
    <div class="modal-bd">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="fi"><label>SKU / Abreviación <span style="color:var(--red)">*</span></label>
          <input class="fi-inp" type="text" id="cp-sku" placeholder="ej: GB, RB, GN XL, MR-01" style="text-transform:uppercase">
          <div style="font-size:11px;color:var(--ink-muted);margin-top:4px">Código corto que usa el taller</div>
        </div>
        <div class="fi"><label>Categoría</label>
          <input class="fi-inp" type="text" id="cp-cat" placeholder="Mesas, Escritorios, Home Decor..." list="cat-list">
          <datalist id="cat-list">
            <option value="Mesas"><option value="Escritorios"><option value="Racks"><option value="Sillas"><option value="Camas"><option value="Home Decor"><option value="Accesorios">
          </datalist>
        </div>
      </div>
      <div class="fi"><label>Modelo / Nombre completo <span style="color:var(--red)">*</span></label>
        <input class="fi-inp" type="text" id="cp-modelo" placeholder="ej: Mesa Ratona Grande">
      </div>
      <div class="fi"><label>Variante <span style="font-size:11px;color:var(--ink-muted)">(opcional)</span></label>
        <input class="fi-inp" type="text" id="cp-variante" placeholder="ej: Blanco, Negro XL, 120cm">
      </div>
      <div class="fi"><label>Nombre para mostrar <span style="font-size:11px;color:var(--ink-muted)">(se completa solo si lo dejás vacío)</span></label>
        <input class="fi-inp" type="text" id="cp-display" placeholder="ej: Mesa Ratona Grande Blanco">
      </div>
      <div style="display:flex;gap:24px;margin-top:8px">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px">
          <input type="checkbox" id="cp-fabricado" checked style="width:16px;height:16px">
          <span><strong>Fabricado</strong> — pasa por el taller (aparece en Producción y KPIs)</span>
        </label>
      </div>
    </div>
    <div class="modal-ft">
      <button class="btn-ghost" onclick="closeM('modal-back')">Cancelar</button>
      <button class="btn" onclick="submitAddCatalogProduct()">Agregar Producto</button>
    </div>
  `;
  openM('modal-back');
  $('cp-sku').focus();
}

async function submitAddCatalogProduct() {
  const sku = $('cp-sku').value.trim().toUpperCase();
  const modelo = $('cp-modelo').value.trim();
  const variante = $('cp-variante').value.trim();
  const categoria = $('cp-cat').value.trim();
  const es_fabricado = $('cp-fabricado').checked;
  const nombre_display = $('cp-display').value.trim() || (modelo + (variante ? ' ' + variante : ''));

  if (!sku) { showToast('El SKU es obligatorio', 'error'); $('cp-sku').focus(); return; }
  if (!modelo) { showToast('El nombre del modelo es obligatorio', 'error'); $('cp-modelo').focus(); return; }

  const { error } = await sb.from('product_catalog').insert({
    sku, modelo, variante: variante || null, categoria: categoria || null,
    nombre_display, es_fabricado, activo: true, created_by: cu.id
  });

  if (error) {
    if (error.code === '23505') { showToast(`El SKU "${sku}" ya existe en el catálogo`, 'error'); return; }
    showToast('Error: ' + error.message, 'error');
    return;
  }

  await logActivity('producto_creado', `Producto agregado al catálogo: ${sku} — ${nombre_display}`);
  invalidateCache('catalog');
  closeM('modal-back');
  showToast(`Producto "${sku} — ${nombre_display}" agregado`);
  renderConfig();
}

async function openEditCatalogProduct(id) {
  const { data: p } = await sb.from('product_catalog').select('*').eq('id', id).single();
  if (!p) return;
  $('modal-container').innerHTML = `
    <div class="modal-hd"><span class="modal-ti">Editar Producto: ${esc(p.sku)}</span><button class="modal-cl" onclick="closeM('modal-back')">×</button></div>
    <div class="modal-bd">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="fi"><label>SKU / Abreviación <span style="color:var(--red)">*</span></label>
          <input class="fi-inp" type="text" id="ep-sku" value="${esc(p.sku)}" style="text-transform:uppercase">
        </div>
        <div class="fi"><label>Categoría</label>
          <input class="fi-inp" type="text" id="ep-cat" value="${esc(p.categoria || '')}" list="cat-list2">
          <datalist id="cat-list2">
            <option value="Mesas"><option value="Escritorios"><option value="Racks"><option value="Sillas"><option value="Camas"><option value="Home Decor"><option value="Accesorios">
          </datalist>
        </div>
      </div>
      <div class="fi"><label>Modelo / Nombre completo <span style="color:var(--red)">*</span></label>
        <input class="fi-inp" type="text" id="ep-modelo" value="${esc(p.modelo)}">
      </div>
      <div class="fi"><label>Variante</label>
        <input class="fi-inp" type="text" id="ep-variante" value="${esc(p.variante || '')}" placeholder="Blanco, Negro XL, 120cm">
      </div>
      <div class="fi"><label>Nombre para mostrar</label>
        <input class="fi-inp" type="text" id="ep-display" value="${esc(p.nombre_display || '')}">
      </div>
      <div style="display:flex;gap:24px;margin-top:8px">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px">
          <input type="checkbox" id="ep-fabricado" ${p.es_fabricado ? 'checked' : ''} style="width:16px;height:16px">
          <span><strong>Fabricado</strong> — pasa por el taller</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px">
          <input type="checkbox" id="ep-activo" ${p.activo ? 'checked' : ''} style="width:16px;height:16px">
          <span>Activo</span>
        </label>
      </div>
    </div>
    <div class="modal-ft">
      <button class="btn-ghost" onclick="closeM('modal-back')">Cancelar</button>
      <button class="btn" onclick="submitEditCatalogProduct('${id}')">Guardar Cambios</button>
    </div>
  `;
  openM('modal-back');
}

async function submitEditCatalogProduct(id) {
  const sku = $('ep-sku').value.trim().toUpperCase();
  const modelo = $('ep-modelo').value.trim();
  const variante = $('ep-variante').value.trim();
  const categoria = $('ep-cat').value.trim();
  const es_fabricado = $('ep-fabricado').checked;
  const activo = $('ep-activo').checked;
  const nombre_display = $('ep-display').value.trim() || (modelo + (variante ? ' ' + variante : ''));

  if (!sku) { showToast('El SKU es obligatorio', 'error'); return; }
  if (!modelo) { showToast('El nombre del modelo es obligatorio', 'error'); return; }

  const { error } = await sb.from('product_catalog').update({
    sku, modelo, variante: variante || null, categoria: categoria || null,
    nombre_display, es_fabricado, activo, updated_at: new Date().toISOString()
  }).eq('id', id);

  if (error) {
    if (error.code === '23505') { showToast(`El SKU "${sku}" ya existe en el catálogo`, 'error'); return; }
    showToast('Error: ' + error.message, 'error');
    return;
  }

  await logActivity('producto_editado', `Producto editado: ${sku} — ${nombre_display}`);
  invalidateCache('catalog');
  closeM('modal-back');
  showToast('Producto actualizado');
  renderConfig();
}

async function toggleCatalogProductActive(id, active) {
  await sb.from('product_catalog').update({ activo: active, updated_at: new Date().toISOString() }).eq('id', id);
  await logActivity('producto_' + (active ? 'activado' : 'desactivado'), `Producto ${active ? 'activado' : 'desactivado'} en catálogo`);
  showToast(`Producto ${active ? 'activado' : 'desactivado'}`);
  invalidateCache('catalog');
  renderConfig();
}

async function confirmDeleteCatalogProduct(id, sku) {
  showUndoToast(`Eliminando producto "${sku}" del catálogo...`, async () => {
    await sb.from('product_catalog').delete().eq('id', id);
    await logActivity('producto_eliminado', `Producto eliminado del catálogo: ${sku}`);
    showToast(`Producto "${sku}" eliminado`);
    invalidateCache('catalog');
    renderConfig();
  });
}

async function openEditUserModal(userId) {
  const { data: u } = await sb.from('profiles').select('*').eq('id', userId).single();
  if (!u) return;
  const isSelf = userId === cu.id;
  $('modal-container').innerHTML = `
    <div class="modal-hd"><span class="modal-ti">Editar Usuario: ${esc(u.name)}</span><button class="modal-cl" onclick="closeM('modal-back')">×</button></div>
    <div class="modal-bd">
      <div class="fi"><label>Nombre completo</label><input class="fi-inp" type="text" id="eu-nm" value="${esc(u.name)}"></div>
      <div class="fi"><label>Username</label><input class="fi-inp" type="text" id="eu-un" value="${esc(u.username || '')}" placeholder="ej: sebastian"></div>
      <div class="fi">
        <label>Email${isOwner() ? '' : ' (solo owner puede cambiar)'}</label>
        <input class="fi-inp" type="email" id="eu-em" value="${esc(u.email || '')}" ${isOwner() ? '' : 'readonly style="opacity:.6;cursor:default"'} placeholder="email@empresa.com">
      </div>
      <div class="fi"><label>Teléfono</label><input class="fi-inp" type="tel" id="eu-phone" value="${esc(u.phone || '')}" placeholder="+54 11 1234-5678"></div>
      <div class="fi"><label>Rol</label>
        <select class="fi-inp" id="eu-rol" ${isOwner() || (cu.role === 'admin' && !isSelf) ? '' : 'disabled'}>
          ${Object.entries(RL).map(([k, v]) => `<option value="${k}" ${u.role === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </div>
      <div class="fi"><label>Área</label><input class="fi-inp" type="text" id="eu-area" value="${esc(u.area || '')}" placeholder="produccion, ventas..."></div>
      ${isOwner() && u.email ? `
      <div style="padding-top:12px;border-top:1px solid var(--border);margin-top:4px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-muted);margin-bottom:8px">Contraseña</div>
        <button class="btn-ghost sm" onclick="sendPasswordReset(this.dataset.email)" data-email="${esc(u.email)}">Enviar email de restablecimiento</button>
      </div>` : ''}
    </div>
    <div class="modal-ft"><button class="btn-ghost" onclick="closeM('modal-back')">Cancelar</button><button class="btn" onclick="submitEditUser('${userId}')">Guardar Cambios</button></div>
  `;
  openM('modal-back');
}

async function sendPasswordReset(email) {
  if (!email) return;
  const { error } = await sb.auth.resetPasswordForEmail(email);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast(`Email de restablecimiento enviado a ${email}`);
}

async function submitEditUser(userId) {
  const name = $('eu-nm').value.trim();
  const username = $('eu-un').value.trim();
  const role = $('eu-rol').value;
  const area = $('eu-area').value.trim() || AREA_MAP[role] || 'general';
  const phone = $('eu-phone').value.trim();
  const email = isOwner() ? ($('eu-em').value.trim() || null) : undefined;
  if (!name) { showToast('El nombre es obligatorio', 'error'); return; }
  const updates = { name, username, role, area, phone };
  if (email !== undefined) updates.email = email;
  await sb.from('profiles').update(updates).eq('id', userId);
  await logActivity('usuario_editado', `Usuario editado: ${name} → ${role}`);
  closeM('modal-back');
  showToast('Usuario actualizado');
  renderConfig();
}

async function confirmDeleteUser(userId, nombre) {
  showUndoToast(`Eliminando usuario "${nombre}"...`, async () => {
    await sb.from('profiles').delete().eq('id', userId);
    await logActivity('usuario_eliminado', `Usuario eliminado: ${nombre}`);
    showToast(`Usuario "${nombre}" eliminado`);
    renderConfig();
  });
}

async function toggleUserActive(userId, active) {
  await sb.from('profiles').update({ active }).eq('id', userId);
  await logActivity('usuario_' + (active ? 'activado' : 'desactivado'), `Usuario ${active ? 'activado' : 'desactivado'}`, userId);
  showToast(`Usuario ${active ? 'activado' : 'desactivado'}`);
  renderConfig();
}

function openAddUser() {
  $('modal-container').innerHTML = `
    <div class="modal-hd"><span class="modal-ti">Agregar Usuario</span><button class="modal-cl" onclick="closeM('modal-back')">×</button></div>
    <div class="modal-bd">
      <div class="fi"><label>Nombre</label><input class="fi-inp" type="text" id="au-nm" placeholder="Nombre completo"></div>
      <div class="fi"><label>Username</label><input class="fi-inp" type="text" id="au-un" placeholder="ej: sebastian"></div>
      <div class="fi"><label>Email</label><input class="fi-inp" type="email" id="au-em" placeholder="email@empresa.com"></div>
      <div class="fi"><label>Contraseña temporal</label><input class="fi-inp" type="password" id="au-pw" placeholder="Mínimo 6 caracteres"></div>
      <div class="fi"><label>Rol</label>
        <select class="fi-inp" id="au-rol">
          ${Object.entries(RL).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
        </select>
      </div>
    </div>
      <div class="badge-info a" style="display:block;margin-top:8px;font-size:12px">Si la sesión se cierra automáticamente al crear el usuario, volvé a iniciar sesión. Es un comportamiento normal del sistema de autenticación.</div>
    </div>
    <div class="modal-ft"><button class="btn-ghost" onclick="closeM('modal-back')">Cancelar</button><button class="btn" onclick="submitAddUser()">Crear Usuario</button></div>
  `;
  openM('modal-back');
}

async function submitAddUser() {
  const name = $('au-nm').value.trim();
  const username = $('au-un').value.trim();
  const email = $('au-em').value.trim();
  const password = $('au-pw').value;
  const role = $('au-rol').value;
  const area = AREA_MAP[role] || 'general';
  if (!name || !email || !password) { showToast('Nombre, email y contraseña son obligatorios', 'error'); return; }

  /* FUTURO: usar Admin API de Supabase via Edge Function para crear usuario sin cerrar sesión */
  /* Por ahora: crea el usuario auth + profile directamente desde el cliente owner */
  const { data, error } = await sb.auth.signUp({
    email, password, options: { data: { name, username, role, area } }
  });
  if (error) { showToast('Error: ' + error.message, 'error'); return; }

  await sb.rpc('confirm_user_email', { user_id: data.user.id });
  await sb.from('profiles').upsert({ id: data.user.id, name, username, role, area, email, active: true });
  await logActivity('usuario_creado', `Nuevo usuario: ${name} (${role})`);
  closeM('modal-back');
  showToast(`Usuario ${name} creado`);
  renderConfig();
}

/* ═══════════════════════════════════════════════════════════
   MI PERFIL
   ═══════════════════════════════════════════════════════════ */
function renderMiPerfil() {
  $('mi-perfil-body').innerHTML = `
    <div class="card" style="max-width:500px;padding:22px">
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px">
        <div class="u-av" style="width:56px;height:56px;font-size:20px">${cu.name.substring(0,2).toUpperCase()}</div>
        <div>
          <div style="font-size:18px;font-weight:700">${esc(cu.name)}</div>
          <div style="font-size:13px;color:var(--ink-muted)">${esc(RL[cu.role] || cu.role)}</div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
          <span style="font-size:12px;color:var(--ink-muted)">Username</span>
          <span style="font-size:13px;font-weight:600;font-family:monospace">${esc(cu.username || '—')}</span>
        </div>
        ${cu.email ? `<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
          <span style="font-size:12px;color:var(--ink-muted)">Email</span>
          <span style="font-size:13px;font-weight:600">${esc(cu.email)}</span>
        </div>` : ''}
        ${cu.phone ? `<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
          <span style="font-size:12px;color:var(--ink-muted)">Teléfono</span>
          <span style="font-size:13px;font-weight:600">${esc(cu.phone)}</span>
        </div>` : ''}
        <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
          <span style="font-size:12px;color:var(--ink-muted)">Área</span>
          <span style="font-size:13px;font-weight:600">${esc(cu.area || '—')}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:10px 0">
          <span style="font-size:12px;color:var(--ink-muted)">Rol</span>
          <span style="font-size:13px;font-weight:600">${esc(RL[cu.role] || cu.role)}</span>
        </div>
      </div>
      <div style="margin-top:20px;padding-top:20px;border-top:1px solid var(--border)">
        <button class="btn-ghost" style="color:var(--red)" onclick="doLogout()">Cerrar Sesión</button>
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════
   REALTIME
   ═══════════════════════════════════════════════════════════ */
function setupRealtime() {
  sb.channel('macario-lite')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
      invalidateCache('orders');
      if (curPage === 'ventas') renderVentas();
      if (curPage === 'dashboard') renderDash();
      if (curPage === 'reporte') renderReporte();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'stock' }, () => {
      invalidateCache('stock');
      if (curPage === 'stock' && activeStockTab === 'materias') renderMaterias();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'finished_products' }, () => {
      if (curPage === 'stock' && activeStockTab === 'terminados') renderTerminados();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'prod_logs' }, () => {
      if (curPage === 'produccion') renderProduccion();
      if (curPage === 'reporte') renderReporte();
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
      const n = payload.new;
      if (n.para_roles && n.para_roles.includes(cu.role)) {
        showToast(`${n.titulo}: ${n.mensaje}`, 'info', 5000);
        buildNav();
      }
    })
    .subscribe();
}

/* ═══════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════ */
async function init() {
  /* Show loading state while checking session */
  const { data: { session } } = await sb.auth.getSession();

  if (session) {
    await loadProfile(session.user.id);
    if (cu) {
      showApp();
      return;
    }
  }

  const needsSetup = await checkSetup();
  if (needsSetup) {
    showSetup();
  } else {
    showLogin();
  }
}

sb.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    cu = null;
    showLogin();
  }
});

/* Clock update for dashboard timestamp */
setInterval(() => {
  const el = $('dts');
  if (el && curPage === 'dashboard') el.textContent = fdLong(new Date());
}, 60000);

init();
