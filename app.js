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
  pendiente: 'Pendiente',
  en_produccion: 'En producción',
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
  const [ordersRes, stockRes, prodRes] = await Promise.all([
    cached('orders', () => sb.from('orders').select('id,estado,numero,cliente,productos,created_at')),
    cached('stock', () => sb.from('stock').select('id,nombre,cantidad,min_warn,min_crit,categoria,unidad')),
    sb.from('prod_logs').select('id,unidades,unidades_falla,created_at').gte('created_at', today + 'T00:00:00')
  ]);

  const orders = ordersRes.data || [];
  const stockItems = stockRes.data || [];
  const prodLogs = prodRes.data || [];

  const byStatus = (s) => orders.filter(o => o.estado === s).length;
  const stockCrit = stockItems.filter(s => s.cantidad <= s.min_crit).length;
  const stockWarn = stockItems.filter(s => s.cantidad > s.min_crit && s.cantidad <= s.min_warn).length;
  const todayProd = prodLogs.reduce((acc, l) => acc + (l.unidades || 0), 0);

  $('dash-body').innerHTML = `
    <div class="stats-grid">
      <div class="stat-card" onclick="navigate('ventas')">
        <div class="sc-val">${byStatus('pendiente')}</div>
        <div class="sc-lbl">Pendientes</div>
      </div>
      <div class="stat-card" onclick="navigate('ventas')">
        <div class="sc-val">${byStatus('en_produccion')}</div>
        <div class="sc-lbl">En producción</div>
      </div>
      <div class="stat-card" onclick="navigate('ventas')">
        <div class="sc-val">${byStatus('listo_despacho')}</div>
        <div class="sc-lbl">Listos despacho</div>
      </div>
      <div class="stat-card" onclick="navigate('produccion')">
        <div class="sc-val">${todayProd}</div>
        <div class="sc-lbl">Unidades hoy</div>
      </div>
    </div>
    ${stockCrit > 0 || stockWarn > 0 ? `
    <div class="card" style="margin-bottom:16px">
      <div style="font-size:12px;font-weight:700;letter-spacing:.08em;color:var(--ink-muted);margin-bottom:12px">ALERTAS DE STOCK</div>
      ${stockCrit > 0 ? `<div class="badge-info r" style="margin-bottom:8px">⚠ ${stockCrit} insumo${stockCrit > 1 ? 's' : ''} en nivel crítico</div>` : ''}
      ${stockWarn > 0 ? `<div class="badge-info a">▲ ${stockWarn} insumo${stockWarn > 1 ? 's' : ''} bajo mínimo recomendado</div>` : ''}
    </div>` : ''}
    <div class="card">
      <div style="font-size:12px;font-weight:700;letter-spacing:.08em;color:var(--ink-muted);margin-bottom:12px">PEDIDOS RECIENTES</div>
      ${orders.slice(0, 5).map(o => `
        <div class="trow" style="display:flex;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)">
          <div style="font-size:11px;font-weight:700;font-family:monospace">${esc(o.numero || o.id?.slice(0,8))}</div>
          <div style="flex:1;font-size:13px">${esc(o.cliente)}</div>
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

  let query = sb.from('orders').select('id,numero,canal,subcanal,cliente,productos,estado,prioridad,fuente,created_at').order('created_at', { ascending: false });
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
      <table class="tbl">
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
      en_produccion: ['listo_despacho', 'cancelado'],
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
  await sb.from('orders').update({ cliente, canal, prioridad, productos, notas: notas || null }).eq('id', ordId);
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
  tabs[0].classList.toggle('active', tab === 'materias');
  tabs[1].classList.toggle('active', tab === 'terminados');
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
      <div class="stock-grid">
        ${its.map(s => {
          const tc = tlClass(s);
          return `
          <div class="stock-card ${tc}">
            <div class="sc-top">
              <span class="sc-nm">${esc(s.nombre)}</span>
              <span class="sc-unit">${esc(s.unidad)}</span>
            </div>
            <div class="sc-qty">${s.cantidad}</div>
            <div class="sc-limits">Mín: ${s.min_warn} · Crit: ${s.min_crit}</div>
            <div class="sc-acts">
              <button class="btn-ghost sm" onclick="openStockUpd('${s.id}','${esc(s.nombre)}',${s.cantidad})">Actualizar</button>
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
  const { data, error } = await sb.from('finished_products').select('id,nombre,sku,categoria,stock_actual,stock_minimo').order('categoria').order('nombre');
  if (error) { $('stock-terminados-body').innerHTML = '<div style="padding:20px;color:var(--ink-muted)">Error al cargar productos terminados.</div>'; return; }
  const items = data || [];

  if (!items.length) {
    $('stock-terminados-body').innerHTML = '<div style="padding:32px;text-align:center;color:var(--ink-muted);font-size:13px">Sin productos terminados cargados. Usá "+ Agregar Producto" para comenzar.</div>';
    return;
  }

  $('stock-terminados-body').innerHTML = `
    <div style="overflow-x:auto">
      <table class="tbl">
        <thead><tr>
          <th>Producto</th><th>SKU</th><th>Categoría</th>
          <th>Stock</th><th>Mínimo</th><th>Estado</th><th></th>
        </tr></thead>
        <tbody>
          ${items.map(p => {
            const low = p.stock_actual <= p.stock_minimo;
            return `
            <tr>
              <td style="font-weight:600">${esc(p.nombre)}</td>
              <td style="font-family:monospace;font-size:11px">${esc(p.sku || '—')}</td>
              <td style="color:var(--ink-muted);font-size:12px">${esc(p.categoria || '—')}</td>
              <td style="font-weight:700;color:${low ? 'var(--red)' : 'var(--green)'}">${p.stock_actual}</td>
              <td style="color:var(--ink-muted)">${p.stock_minimo}</td>
              <td><span class="badge-info ${low ? 'r' : 'g'}">${low ? 'Bajo stock' : 'OK'}</span></td>
              <td style="display:flex;gap:4px">
                <button class="btn-ghost sm" onclick="openProductUpd('${p.id}','${esc(p.nombre)}',${p.stock_actual})">Actualizar</button>
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
  ['pa-nm','pa-sku','pa-qty','pa-min','pa-cat','pa-notes'].forEach(id => { const el = $(id); if (el) el.value = ''; });
  openM('m-product-add');
}

async function confirmAddProduct() {
  const nombre = $('pa-nm').value.trim();
  const sku = $('pa-sku').value.trim();
  const stock_actual = parseInt($('pa-qty').value) || 0;
  const stock_minimo = parseInt($('pa-min').value) || 0;
  const categoria = $('pa-cat').value.trim() || 'General';
  const notas = $('pa-notes').value.trim();
  if (!nombre) { showToast('El nombre es obligatorio', 'error'); return; }
  const { error } = await sb.from('finished_products').insert({ nombre, sku: sku || null, stock_actual, stock_minimo, categoria, notas: notas || null });
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  await logActivity('producto_creado', `Nuevo producto terminado: ${nombre}`);
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
      <div class="fi"><label>SKU</label><input class="fi-inp" type="text" id="ep-sku" value="${esc(p.sku || '')}"></div>
      <div class="fi-row">
        <div class="fi"><label>Stock mínimo</label><input class="fi-inp" type="number" id="ep-min" value="${p.stock_minimo}"></div>
        <div class="fi"><label>Categoría</label><input class="fi-inp" type="text" id="ep-cat" value="${esc(p.categoria || '')}"></div>
      </div>
    </div>
    <div class="modal-ft"><button class="btn-ghost" onclick="closeM('modal-back')">Cancelar</button><button class="btn" onclick="submitEditFinishedProduct('${id}')">Guardar</button></div>
  `;
  openM('modal-back');
}

async function submitEditFinishedProduct(id) {
  const nombre = $('ep-nm').value.trim();
  const sku = $('ep-sku').value.trim();
  const stock_minimo = parseInt($('ep-min').value) || 0;
  const categoria = $('ep-cat').value.trim();
  if (!nombre) { showToast('El nombre es obligatorio', 'error'); return; }
  await sb.from('finished_products').update({ nombre, sku: sku || null, stock_minimo, categoria }).eq('id', id);
  closeM('modal-back');
  renderTerminados();
}

/* ═══════════════════════════════════════════════════════════
   PRODUCCIÓN
   ═══════════════════════════════════════════════════════════ */
async function renderProduccion() {
  showLoading('produccion-body');
  const { data, error } = await sb.from('prod_logs').select('id,modelo,unidades,unidades_falla,sector,notas,usuario_nombre,created_at').order('created_at', { ascending: false }).limit(50);
  if (error) { $('produccion-body').innerHTML = '<div style="padding:20px;color:var(--ink-muted)">Error al cargar registros.</div>'; return; }
  const logs = data || [];

  const today = new Date().toISOString().split('T')[0];
  const todayLogs = logs.filter(l => l.created_at?.startsWith(today));
  const todayUnits = todayLogs.reduce((a, l) => a + (l.unidades || 0), 0);
  const todayWaste = todayLogs.reduce((a, l) => a + (l.unidades_falla || 0), 0);

  $('produccion-body').innerHTML = `
    <div class="stats-grid" style="margin-bottom:20px">
      <div class="stat-card">
        <div class="sc-val">${todayUnits}</div>
        <div class="sc-lbl">Unidades hoy</div>
      </div>
      <div class="stat-card">
        <div class="sc-val">${todayWaste}</div>
        <div class="sc-lbl">Fallas hoy</div>
      </div>
      <div class="stat-card">
        <div class="sc-val">${logs.length}</div>
        <div class="sc-lbl">Registros totales</div>
      </div>
    </div>
    <div class="card">
      <div style="font-size:12px;font-weight:700;letter-spacing:.08em;color:var(--ink-muted);margin-bottom:12px">REGISTROS RECIENTES</div>
      ${logs.length ? `
        <div style="overflow-x:auto">
          <table class="tbl">
            <thead><tr><th>Fecha</th><th>Modelo</th><th>Sector</th><th>Unidades</th><th>Fallas</th><th>Usuario</th><th></th></tr></thead>
            <tbody>
              ${logs.map(l => `
                <tr>
                  <td style="font-size:11px;color:var(--ink-muted)">${fdDate(l.created_at)}</td>
                  <td style="font-weight:600">${esc(l.modelo || '—')}</td>
                  <td><span class="badge-info b">${esc(l.sector || '—')}</span></td>
                  <td style="font-weight:700">${l.unidades || 0}</td>
                  <td style="color:${(l.unidades_falla || 0) > 0 ? 'var(--red)' : 'var(--ink-muted)'}">${l.unidades_falla || 0}</td>
                  <td style="font-size:12px;color:var(--ink-muted)">${esc(l.usuario_nombre || '—')}</td>
                  <td>${ownerBtns('prod_log', l.id)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : '<div style="color:var(--ink-muted);font-size:13px;padding:16px 0">Sin registros de producción aún.</div>'}
    </div>
  `;
}

function openRegisterProd() {
  const today = new Date().toISOString().split('T')[0];
  $('mp-model').value = '';
  $('mp-qty').value = '';
  $('mp-date').value = today;
  $('mp-notes').value = '';
  $('mp-waste').value = '0';
  $('mp-waste-notes-wrap').style.display = 'none';
  $('mp-waste-notes').value = '';
  loadOrdersForProd();
  openM('m-prod');
}

async function loadOrdersForProd() {
  const { data } = await sb.from('orders').select('id,numero,cliente').in('estado', ['pendiente', 'en_produccion']).order('created_at', { ascending: false });
  const sel = $('mp-ord');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Producción general —</option>' +
    (data || []).map(o => `<option value="${o.id}">${esc(o.numero || o.id.slice(0,8))} — ${esc(o.cliente)}</option>`).join('');
}

async function submitProd() {
  const modelo = $('mp-model').value.trim();
  const unidades = parseInt($('mp-qty').value) || 0;
  const fecha = $('mp-date').value;
  const sector = $('mp-sector').value;
  const notas = $('mp-notes').value.trim();
  const unidades_falla = parseInt($('mp-waste').value) || 0;
  const falla_descripcion = $('mp-waste-notes').value.trim();
  const orden_id = $('mp-ord').value || null;

  if (!modelo || unidades <= 0) { showToast('Modelo y unidades son obligatorios', 'error'); return; }

  const { error } = await sb.from('prod_logs').insert({
    modelo, unidades, fecha, sector, notas: notas || null,
    unidades_falla, falla_descripcion: falla_descripcion || null,
    orden_id, usuario_id: cu.id, usuario_nombre: cu.name
  });

  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  await logActivity('produccion_registrada', `Producción: ${modelo} ×${unidades} (${sector})`, orden_id);
  closeM('m-prod');
  showToast('Producción registrada');
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
      <div class="notif-row${read ? '' : ' unread'}" onclick="markRead('${n.id}', this)">
        <div class="notif-ic badge-info ${color}">${icon}</div>
        <div class="notif-bd">
          <div class="notif-ti">${esc(n.titulo)}</div>
          <div class="notif-msg">${esc(n.mensaje)}</div>
          <div class="notif-ts">${fdTime(n.created_at)}</div>
        </div>
        ${!read ? '<div class="notif-dot"></div>' : ''}
      </div>
    `;
  }).join('');
}

async function markRead(notifId, el) {
  if (!el || el.classList.contains('notif-row') && !el.classList.contains('unread')) return;
  el?.classList.remove('unread');
  el?.querySelector('.notif-dot')?.remove();
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
  const { data: users } = await sb.from('profiles').select('id,name,username,role,area,active').order('name');

  $('config-body').innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div style="font-size:12px;font-weight:700;letter-spacing:.08em;color:var(--ink-muted)">USUARIOS</div>
        ${isOwner() ? `<button class="btn" onclick="openAddUser()">+ Agregar Usuario</button>` : ''}
      </div>
      <div style="overflow-x:auto">
        <table class="tbl">
          <thead><tr><th>Nombre</th><th>Username</th><th>Rol</th><th>Área</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            ${(users || []).map(u => `
              <tr>
                <td style="font-weight:600">${esc(u.name)}</td>
                <td style="font-family:monospace;font-size:11px">${esc(u.username || '—')}</td>
                <td>${esc(RL[u.role] || u.role)}</td>
                <td style="color:var(--ink-muted)">${esc(u.area || '—')}</td>
                <td><span class="badge-info ${u.active ? 'g' : 'r'}">${u.active ? 'Activo' : 'Inactivo'}</span></td>
                <td>${isOwner() && u.id !== cu.id ? `<button class="btn-ghost sm r" onclick="toggleUserActive('${u.id}',${!u.active})">${u.active ? 'Desactivar' : 'Activar'}</button>` : ''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
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
  await sb.from('profiles').upsert({ id: data.user.id, name, username, role, area, active: true });
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
    <div class="card" style="max-width:500px">
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
