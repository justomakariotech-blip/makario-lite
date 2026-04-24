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
let _scrollToCarrier = null;     // auto-scroll a sección carrier en renderReporte
let _currentCarrier = null;      // carrier activo en la vista de carrier page

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
  if (id === 'm-prod') closeProdCamScanner();
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
    owner: 'dashboard', admin: 'dashboard',
    encargado: 'produccion', ventas: 'ventas',
    cnc: 'produccion', melamina: 'produccion', pino: 'produccion',
    embalaje: 'produccion', carpinteria: 'produccion',
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
    { id: 'scanner', ic: '⊡', lb: 'Escaner ML' },
    { sec: 'Gestión' },
    { id: 'ventas', ic: '◈', lb: 'Ventas' },
    { id: 'stock', ic: '◇', lb: 'Stock', alerts: true },
    { sec: 'Producción' },
    { id: 'produccion', ic: '▣', lb: 'Producción' },
    { id: 'historico', ic: '◫', lb: 'Histórico' },
    { sec: 'Sistema' },
    { id: 'notificaciones', ic: '🔔', lb: 'Notificaciones', bell: true },
    { id: 'config', ic: '◌', lb: 'Configuración' },
    { id: 'mi-perfil', ic: '◉', lb: 'Mi Perfil' }
  ],
  admin: [
    { sec: 'Principal' },
    { id: 'dashboard', ic: '▦', lb: 'Dashboard' },
    { sec: 'Operaciones' },
    { id: 'scanner', ic: '⊡', lb: 'Escaner ML' },
    { sec: 'Gestión' },
    { id: 'ventas', ic: '◈', lb: 'Ventas' },
    { id: 'stock', ic: '◇', lb: 'Stock', alerts: true },
    { sec: 'Producción' },
    { id: 'produccion', ic: '▣', lb: 'Producción' },
    { id: 'historico', ic: '◫', lb: 'Histórico' },
    { sec: 'Sistema' },
    { id: 'notificaciones', ic: '🔔', lb: 'Notificaciones', bell: true },
    { id: 'mi-perfil', ic: '◉', lb: 'Mi Perfil' }
  ],
  encargado: [
    { id: 'produccion', ic: '▣', lb: 'Producción' },
    { id: 'scanner', ic: '⊡', lb: 'Escaner ML' },
    { id: 'stock', ic: '◇', lb: 'Stock' },
    { sec: 'Sistema' },
    { id: 'notificaciones', ic: '🔔', lb: 'Notificaciones', bell: true },
    { id: 'mi-perfil', ic: '◉', lb: 'Mi Perfil' }
  ],
  ventas: [
    { sec: 'Gestión' }, { id: 'ventas', ic: '◈', lb: 'Ventas' },
    { sec: 'Sistema' }, { id: 'notificaciones', ic: '🔔', lb: 'Notificaciones', bell: true }, { id: 'mi-perfil', ic: '◉', lb: 'Mi Perfil' }
  ],
  cnc: [
    { id: 'produccion', ic: '▣', lb: 'Producción' },
    { id: 'scanner', ic: '⊡', lb: 'QR / Escaner' },
    { sec: 'Sistema' }, { id: 'mi-perfil', ic: '◉', lb: 'Mi Perfil' }
  ],
  melamina: [
    { id: 'produccion', ic: '▣', lb: 'Producción' },
    { id: 'scanner', ic: '⊡', lb: 'QR / Escaner' },
    { sec: 'Sistema' }, { id: 'mi-perfil', ic: '◉', lb: 'Mi Perfil' }
  ],
  pino: [
    { id: 'produccion', ic: '▣', lb: 'Producción' },
    { id: 'scanner', ic: '⊡', lb: 'QR / Escaner' },
    { sec: 'Sistema' }, { id: 'mi-perfil', ic: '◉', lb: 'Mi Perfil' }
  ],
  embalaje: [
    { id: 'produccion', ic: '▣', lb: 'Producción' },
    { id: 'scanner', ic: '⊡', lb: 'QR / Escaner' },
    { sec: 'Sistema' }, { id: 'mi-perfil', ic: '◉', lb: 'Mi Perfil' }
  ],
  carpinteria: [
    { id: 'produccion', ic: '▣', lb: 'Producción' },
    { id: 'scanner', ic: '⊡', lb: 'QR / Escaner' },
    { sec: 'Sistema' }, { id: 'mi-perfil', ic: '◉', lb: 'Mi Perfil' }
  ],
  logistica: [
    { sec: 'Gestión' }, { id: 'ventas', ic: '◈', lb: 'Ventas' }, { id: 'scanner', ic: '⊡', lb: 'Escaner ML' },
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
  if (pg !== 'scanner') _jmsStopCamera();
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
    'carrier': renderCarrierPage,
    'reporte': renderReporte,
    'ventas': renderVentas,
    'stock': renderStock,
    'produccion': renderProduccion,
    'historico': renderHistorico,
    'scanner': renderScanner,
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
   CARRIER PAGE — Vista completa por carrier (Colecta/Flex/TN)
   ═══════════════════════════════════════════════════════════ */

function openCarrierPage(carrier) {
  _currentCarrier = carrier;
  navigate('carrier');
}

async function renderCarrierPage() {
  const carrier = _currentCarrier;
  if (!carrier) { navigate('dashboard'); return; }

  const isTN   = carrier === 'tiendanube';
  const isDist = carrier === 'distribuidor';
  const label  = carrier === 'colecta' ? 'Colecta' : carrier === 'flex' ? 'Flex' : carrier === 'distribuidor' ? 'Distribuidores' : 'Tienda Nube';
  const hora   = carrier === 'colecta' ? '· Retiro 12:00 hs' : carrier === 'flex' ? '· Retiro 14:00 hs' : carrier === 'distribuidor' ? '· Mayoristas / bulto' : '· Tienda Web';
  const color  = carrier === 'flex' ? 'var(--green)' : carrier === 'distribuidor' ? 'var(--amber)' : 'var(--blue)';

  showLoading('carrier-body');

  const _baseQ = 'id,numero,ml_order_id,fecha_pedido,productos,cantidad,sku,cliente,estado,created_at,canal,subcanal';
  const _notCancelled = '("cancelado","entregado","despachado")';
  const ordersQuery = isTN
    ? sb.from('orders').select(_baseQ).eq('canal','tiendanube').not('estado','in',_notCancelled).order('created_at',{ascending:false})
    : isDist
      ? sb.from('orders').select(_baseQ).eq('canal','distribuidor').not('estado','in',_notCancelled).order('created_at',{ascending:false})
      : sb.from('orders').select(_baseQ).eq('canal','mercadolibre').eq('subcanal',carrier).not('estado','in',_notCancelled).order('created_at',{ascending:false});

  // Último cierre de esta carrier — para filtrar prod_logs solo del período activo
  const { data: lastClosureArr } = await sb.from('production_closures')
    .select('id,fecha_cierre,snapshot,pedidos_cerrados,faltante_arrastrado,cerrado_por_nombre,created_at')
    .eq('carrier', carrier)
    .order('created_at', { ascending: false })
    .limit(10);
  const lastClosure = lastClosureArr?.[0] || null;
  const sinceDate = lastClosure?.fecha_cierre || null;

  const [qOrders, prodLogsRes, catRes, batchesRes] = await Promise.all([
    ordersQuery,
    (sinceDate
      ? sb.from('prod_logs').select('id,modelo,sku,variante,unidades,subcanal,created_at').gte('created_at', sinceDate)
      : sb.from('prod_logs').select('id,modelo,sku,variante,unidades,subcanal,created_at')),

    sb.from('product_catalog').select('sku,modelo,variante').eq('es_fabricado', true).eq('activo', true),
    sb.from('orders').select('import_batch_id,import_batch_meta,created_at,cantidad,productos')
      .eq('fuente','excel').not('import_batch_id','is',null)
      .or(isTN ? 'canal.eq.tiendanube' : isDist ? 'canal.eq.distribuidor' : `subcanal.eq.${carrier}`)
      .order('created_at',{ascending:false})
  ]);

  const prodLogs   = prodLogsRes.data || [];
  const orders     = qOrders.data || [];
  const catItems   = catRes.data || [];

  // Construir historial de lotes
  const batchMapC = {};
  for (const row of (batchesRes.data || [])) {
    const bid = row.import_batch_id;
    if (!batchMapC[bid]) batchMapC[bid] = { id: bid, fecha: row.created_at, meta: row.import_batch_meta || {}, pedidos: 0, unidades: 0 };
    batchMapC[bid].pedidos++;
    const prods = row.productos || [];
    batchMapC[bid].unidades += prods.length > 0 ? prods.reduce((s,p)=>s+parseInt(p.cantidad||0),0) : parseInt(row.cantidad||0);
  }
  const batches = Object.values(batchMapC).sort((a,b) => new Date(b.fecha)-new Date(a.fecha));

  // Catalog helpers for SKU-based matching
  const _cNorm = s => String(s||'').toLowerCase()
    .replace(/[áàä]/g,'a').replace(/[éèë]/g,'e').replace(/[íìï]/g,'i').replace(/[óòö]/g,'o').replace(/[úùü]/g,'u')
    .replace(/[^a-z0-9]/g,' ').replace(/\s+/g,' ').trim();
  const _cWIn = (w, t) => {
    if (t.includes(w)) return true;
    if (t.includes(w + 's')) return true;
    if (w.endsWith('s') && t.includes(w.slice(0,-1))) return true;
    if (w.endsWith('o') && t.includes(w.slice(0,-1) + 'a')) return true;  // blanco→blanca
    if (w.endsWith('a') && t.includes(w.slice(0,-1) + 'o')) return true;  // blanca→blanco
    if (w.endsWith('os') && t.includes(w.slice(0,-2) + 'as')) return true;
    if (w.endsWith('as') && t.includes(w.slice(0,-2) + 'os')) return true;
    return false;
  };
  const _cBySku = {};
  for (const c of catItems) _cBySku[c.sku.toLowerCase()] = c;
  const _cFind = (nombre, skuHint) => {
    if (skuHint) { const e = _cBySku[skuHint.toLowerCase()]; if (e) return e; }
    const n = _cNorm(nombre);
    let best = null, bestSc = 0;
    for (const c of catItems) {
      const ws = _cNorm(c.modelo).split(' ').filter(w => w.length >= 4);
      if (!ws.length) continue;
      const sc = ws.filter(w => _cWIn(w, n)).length / ws.length;
      if (sc < 0.6) continue;
      const vws = c.variante ? _cNorm(c.variante).split(' ').filter(w => w.length >= 3) : [];
      const tot = vws.length ? (sc + vws.filter(w => _cWIn(w, n)).length / vws.length) / 2 : sc;
      if (tot > bestSc) { bestSc = tot; best = c; }
    }
    return best;
  };

  const countUds = (list) => list.reduce((s,o) => {
    const prods = o.productos || [];
    return s + (prods.length > 0 ? prods.reduce((ss,p) => ss + parseInt(p.cantidad||0), 0) : parseInt(o.cantidad||0));
  }, 0);

  const totalPedidos = orders.length;
  const totalUds = countUds(orders);

  // Build pending map — key = catalog SKU, tracks blancos/negros separately
  const _isBlanco = v => (v||'').toLowerCase().includes('blanc');
  const _isNegro  = v => (v||'').toLowerCase().includes('negr');

  const mapa = {};
  const _mapaNew = (sku, label) => ({ sku, modelo: label, pedido: 0, blancos: 0, negros: 0, otros: 0 });

  for (const ord of orders) {
    const prods = ord.productos || [];
    if (prods.length === 0) {
      const catE = ord.sku ? _cBySku[ord.sku.toLowerCase()] : null;
      const key = catE ? catE.sku : (ord.sku || ord.id);
      const label = catE ? catE.modelo : (ord.sku || '(sin título)');
      if (!mapa[key]) mapa[key] = _mapaNew(catE?.sku || ord.sku || '', label);
      mapa[key].pedido += parseInt(ord.cantidad || 0);
    } else {
      for (const p of prods) {
        const catE = _cFind(p.nombre, p.sku);
        const key = catE ? catE.sku : ((p.nombre||'') + '||' + (p.color||''));
        const label = catE ? catE.modelo : (p.nombre||'');
        if (!mapa[key]) mapa[key] = _mapaNew(catE?.sku || '', label);
        mapa[key].pedido += parseInt(p.cantidad || 0);
      }
    }
  }

  // Deduct prod_logs — split by color (Blanco / Negro / Otros)
  const logsCarrier = prodLogs.filter(l => l.subcanal === carrier);
  for (const log of logsCarrier) {
    const key = (log.sku || log.modelo || '').trim();
    if (!key) continue;
    const target = mapa[key] || mapa[Object.keys(mapa).find(k => k === log.modelo || k.startsWith((log.modelo||'') + '||'))];
    if (!target) continue;
    const uds = parseInt(log.unidades || 0);
    if (_isBlanco(log.variante))     target.blancos += uds;
    else if (_isNegro(log.variante)) target.negros  += uds;
    else                             target.otros   += uds;
  }

  const filas = Object.values(mapa).filter(f => f.modelo && f.pedido > 0);
  const totalPend = filas.reduce((s,f) => s + Math.max(0, f.pedido - f.blancos - f.negros - f.otros), 0);
  // Guardar para que cerrarJornada() pueda leer el estado actual
  _currentCarrierFilas = filas;
  _currentCarrierFaltante = totalPend;
  _currentCarrierOrders = orders;

  const canEdit = ['owner','admin','encargado'].includes(cu.role);

  $('carrier-body').innerHTML = `
    <!-- Header -->
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px">
      <button class="btn-ghost" onclick="navigate('dashboard')" style="padding:8px 14px;font-size:13px">← Dashboard</button>
      <div>
        <div style="font-size:22px;font-weight:800;color:${color}">${label}</div>
        <div style="font-size:13px;color:var(--ink-muted)">${hora}</div>
      </div>
      <div style="margin-left:auto;display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn-ghost sm" onclick="openImportML()">↑ Importar Excel</button>
        ${canEdit ? `<button class="btn sm" onclick="openRegisterProd('${carrier}')">+ Registrar Prod.</button>` : ''}
        ${canEdit ? `<button class="btn-ghost sm" onclick="cerrarJornada('${carrier}')" style="border-color:var(--amber);color:var(--amber)" title="Cerrar jornada y archivar producción">⬛ Cerrar jornada</button>` : ''}
      </div>
    </div>

    ${lastClosure ? `
    <div style="margin-bottom:16px;padding:10px 16px;background:color-mix(in srgb,var(--amber) 8%,transparent);border:1px solid color-mix(in srgb,var(--amber) 30%,transparent);border-radius:8px;font-size:12px;color:var(--ink-soft);display:flex;align-items:center;gap:10px">
      <span style="font-size:16px">🕐</span>
      <span>Jornada abierta desde <strong>${fdLong(new Date(lastClosure.fecha_cierre))}</strong> · Cerrada por ${esc(lastClosure.cerrado_por_nombre || '—')}</span>
    </div>` : ''}

    ${totalPend === 0 && totalPedidos > 0 ? `
    <div style="margin-bottom:16px;padding:12px 16px;background:color-mix(in srgb,var(--green) 10%,transparent);border:1px solid color-mix(in srgb,var(--green) 30%,transparent);border-radius:8px;font-size:13px;color:var(--ink-soft);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <span>✅ <strong>¡Todo producido!</strong> Podés cerrar la jornada para limpiar los contadores.</span>
      ${canEdit ? `<button class="btn sm" onclick="cerrarJornada('${carrier}')" style="background:var(--green)">Cerrar jornada</button>` : ''}
    </div>` : ''}

    <!-- KPIs -->
    <div class="sg" style="margin-bottom:20px">
      <div class="sc">
        <div class="sc-l">Pedidos activos</div>
        <div class="sc-v">${totalPedidos}</div>
      </div>
      <div class="sc">
        <div class="sc-l">Unidades pedidas</div>
        <div class="sc-v">${totalUds}</div>
      </div>
      <div class="sc ${totalPend > 0 ? 'r' : 'g'}">
        <div class="sc-l">Pendiente producción</div>
        <div class="sc-v">${totalPend}</div>
      </div>
    </div>

    <!-- Tabla pendiente de producción -->
    <div class="card" style="padding:20px;margin-bottom:20px">
      <div style="font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-muted);margin-bottom:16px">PRODUCCIÓN PENDIENTE</div>
      ${filas.length === 0 ? `<div style="color:var(--green);font-size:13px;padding:8px 0">Sin producción pendiente para ${label}.</div>` : `
      <table class="dt">
        <thead><tr>
          <th style="font-family:monospace">SKU</th>
          <th>Modelo</th>
          <th style="text-align:center">Pedido</th>
          <th style="text-align:center">⬜ Blanco</th>
          <th style="text-align:center">⬛ Negro</th>
          <th style="text-align:center">Faltante</th>
          ${canEdit ? '<th></th>' : ''}
        </tr></thead>
        <tbody>
          ${filas.map(f => {
            const producido = f.blancos + f.negros + f.otros;
            const faltante  = Math.max(0, f.pedido - producido);
            const surplus   = Math.max(0, producido - f.pedido);
            const faltCell  = surplus > 0
              ? `<span style="color:var(--green);font-weight:700">+${surplus} stock</span>`
              : faltante > 0 ? `<span style="color:var(--red);font-weight:700;font-size:16px">${faltante}</span>`
              : `<span style="color:var(--green);font-weight:700">✓ 0</span>`;
            return `<tr>
              <td style="font-family:monospace;font-size:11px;font-weight:700;color:var(--blue)">${esc(f.sku || '—')}</td>
              <td style="font-weight:600;max-width:220px">${esc(f.modelo)}</td>
              <td style="text-align:center;font-family:monospace;font-weight:700">${f.pedido}</td>
              <td style="text-align:center;font-family:monospace;font-weight:700;color:${f.blancos > 0 ? 'var(--green)' : 'var(--ink-muted)'}">${f.blancos}</td>
              <td style="text-align:center;font-family:monospace;font-weight:700;color:${f.negros > 0 ? 'var(--green)' : 'var(--ink-muted)'}">${f.negros}</td>
              <td style="text-align:center">${faltCell}</td>
              ${canEdit ? `<td><button class="btn-ghost sm" onclick="openRegisterProd('${carrier}')" style="font-size:11px">+ Registrar</button></td>` : ''}
            </tr>`;
          }).join('')}
        </tbody>
      </table>`}
    </div>

    <!-- Lista de pedidos — colapsable -->
    <div class="card" style="overflow:hidden">
      <button onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none';this.querySelector('.carr-arr').style.transform=this.nextElementSibling.style.display==='none'?'rotate(0deg)':'rotate(180deg')"
        style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:none;border:none;cursor:pointer;font-family:inherit">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-muted)">PEDIDOS INDIVIDUALES</span>
          <span style="font-size:11px;font-weight:700;padding:2px 8px;background:var(--paper-dim);border-radius:20px;color:var(--ink-muted)">${orders.length}</span>
        </div>
        <span class="carr-arr" style="font-size:16px;color:var(--ink-muted);transition:transform .2s;display:inline-block">▾</span>
      </button>
      <div style="display:none;padding:0 20px 16px">
        ${orders.length === 0 ? `<div style="color:var(--ink-muted);font-size:13px;padding:8px 0">Sin pedidos activos.</div>` : `
        <table class="dt">
          <thead><tr><th>N°</th><th>Fecha</th><th>Productos</th><th>Estado</th></tr></thead>
          <tbody>
            ${orders.map(o => {
              const prods = (o.productos||[]).map(p => `${esc(p.nombre||'')}${p.color?' ('+esc(p.color)+')':''} ×${p.cantidad}`).join(', ')
                || (o.sku ? `${esc(o.sku)} ×${o.cantidad||1}` : '—');
              return `<tr>
                <td style="font-family:monospace;font-size:11px;font-weight:700">${esc(o.numero||o.id?.slice(0,8))}</td>
                <td style="font-size:12px;color:var(--ink-muted)">${o.fecha_pedido ? fdDate(o.fecha_pedido) : fdDate(o.created_at)}</td>
                <td style="font-size:12px;max-width:300px">${prods}</td>
                <td>${statusB(o.estado, o.id)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>`}
      </div>
    </div>

    ${batches.length > 0 ? `
    <!-- Lotes de importación -->
    <div class="card" style="overflow:hidden;margin-bottom:12px">
      <button onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'"
        style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:none;border:none;cursor:pointer;font-family:inherit">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-muted)">LOTES IMPORTADOS</span>
          <span style="font-size:11px;font-weight:700;padding:2px 8px;background:var(--paper-dim);border-radius:20px;color:var(--ink-muted)">${batches.length}</span>
        </div>
        <span style="font-size:16px;color:var(--ink-muted)">▾</span>
      </button>
      <div style="display:none;padding:0 20px 16px;overflow-x:auto">
        <table class="dt">
          <thead><tr>
            <th>Fecha y hora</th><th>Importado por</th>
            <th style="text-align:center">Pedidos</th><th style="text-align:center">Uds.</th>
            ${canEdit ? '<th style="text-align:center">Acción</th>' : ''}
          </tr></thead>
          <tbody>
            ${batches.map(b => {
              const esHoy = b.fecha.startsWith(new Date().toISOString().split('T')[0]);
              return `<tr>
                <td style="font-size:12px">${fdTime(b.fecha)} ${esHoy?'<span class="badge-info g" style="font-size:10px;margin-left:4px">hoy</span>':''}</td>
                <td style="font-size:12px;color:var(--ink-muted)">${esc(b.meta.importado_por||'—')}</td>
                <td style="text-align:center;font-family:monospace;font-weight:700">${b.pedidos}</td>
                <td style="text-align:center;font-family:monospace">${b.unidades}</td>
                ${canEdit ? `<td style="text-align:center"><button class="btn-ghost sm r" onclick="deleteImportBatch('${b.id}',${b.pedidos})" title="Borrar este lote">✕ Eliminar</button></td>` : ''}
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}

    ${lastClosureArr && lastClosureArr.length > 0 ? `
    <!-- Histórico de cierres -->
    <div class="card" style="overflow:hidden">
      <button onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none';this.querySelector('.cl-arr').style.transform=this.nextElementSibling.style.display==='none'?'rotate(0deg)':'rotate(180deg')"
        style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:none;border:none;cursor:pointer;font-family:inherit">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-muted)">HISTÓRICO DE CIERRES</span>
          <span style="font-size:11px;font-weight:700;padding:2px 8px;background:var(--paper-dim);border-radius:20px;color:var(--ink-muted)">${lastClosureArr.length}</span>
        </div>
        <span class="cl-arr" style="font-size:16px;color:var(--ink-muted);transition:transform .2s;display:inline-block">▾</span>
      </button>
      <div style="display:none;padding:0 20px 16px">
        <table class="dt">
          <thead><tr><th>Fecha cierre</th><th>Cerrado por</th><th style="text-align:center">Pedidos</th><th style="text-align:center">Producido</th><th style="text-align:center">Faltante al cierre</th></tr></thead>
          <tbody>
            ${lastClosureArr.map(c => {
              const snap = c.snapshot || [];
              const totalProd = snap.reduce((s, r) => s + (r.blancos||0) + (r.negros||0), 0);
              return `<tr>
                <td style="font-size:12px">${fdLong(new Date(c.fecha_cierre))}</td>
                <td style="font-size:12px;color:var(--ink-muted)">${esc(c.cerrado_por_nombre || '—')}</td>
                <td style="text-align:center;font-family:monospace;font-weight:700">${c.pedidos_cerrados || 0}</td>
                <td style="text-align:center;font-family:monospace;color:var(--green)">${totalProd}</td>
                <td style="text-align:center;font-family:monospace;color:${c.faltante_arrastrado > 0 ? 'var(--amber)' : 'var(--green)'}">${c.faltante_arrastrado || 0}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}
  `;
}

/* ═══════════════════════════════════════════════════════════
   CIERRE DE JORNADA
   ═══════════════════════════════════════════════════════════ */
async function cerrarJornada(carrier) {
  const labelMap = { colecta:'Colecta', flex:'Flex', tiendanube:'Tienda Nube', distribuidor:'Distribuidores' };
  const label = labelMap[carrier] || carrier;

  const hayFaltante = _currentCarrierFaltante > 0;
  const msg = hayFaltante
    ? `¿Cerrar jornada de ${label}?\n\nQuedan ${_currentCarrierFaltante} unidades sin producir. Esas unidades NO se marcan como hechas — quedan pendientes para la próxima jornada.\n\nLo que ya fue producido se archiva.`
    : `¿Cerrar jornada de ${label}?\n\nTodo está producido. Los contadores vuelven a cero y queda guardado como histórico.`;

  if (!confirm(msg)) return;

  // Leer estado actual del mapa (calculado en renderCarrierPage, guardado globalmente)
  const snapshot = _currentCarrierFilas || [];
  const faltanteTotal = snapshot.reduce((s, f) => s + Math.max(0, f.pedido - f.blancos - f.negros - f.otros), 0);
  const pedidosActivos = _currentCarrierOrders?.length || 0;

  const { error } = await sb.from('production_closures').insert({
    carrier,
    fecha_cierre: new Date().toISOString(),
    snapshot: snapshot.map(f => ({
      sku: f.sku,
      modelo: f.modelo,
      pedido: f.pedido,
      blancos: f.blancos,
      negros: f.negros,
      otros: f.otros,
      faltante: Math.max(0, f.pedido - f.blancos - f.negros - f.otros)
    })),
    pedidos_cerrados: pedidosActivos,
    faltante_arrastrado: faltanteTotal,
    cerrado_por: cu.id,
    cerrado_por_nombre: cu.name
  });

  if (error) { showToast('Error al cerrar jornada: ' + error.message, 'error'); return; }

  await logActivity('jornada_cerrada', `Jornada ${label} cerrada · ${pedidosActivos} pedidos · ${faltanteTotal} faltante arrastrado`);
  showToast(`✓ Jornada ${label} cerrada${faltanteTotal > 0 ? ` · ${faltanteTotal} uds. pasan a la próxima jornada` : ' · Todo producido'}`);
  renderCarrierPage();
}

// Variables globales para que cerrarJornada() acceda al estado actual del carrier
let _currentCarrierFilas = [];
let _currentCarrierFaltante = 0;
let _currentCarrierOrders = [];

/* ═══════════════════════════════════════════════════════════
   ESCANER ML — UX App de Herramienta integrada
   ═══════════════════════════════════════════════════════════ */

var _jmsCameraScanner = null;
var _jmsCameraActive  = false;
var _jmsResultTimer   = null;
var _jmsCountdownInterval = null;
var _jmsVisHookAdded  = false;
var JMS_TIMEOUT = 8000;

var JMS_PH = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300' viewBox='0 0 300 300'%3E%3Crect width='300' height='300' fill='%23F0F0F0'/%3E%3Crect x='90' y='80' width='120' height='100' rx='8' fill='%23D0D0D0'/%3E%3Ccircle cx='125' cy='115' r='15' fill='%23B8B8B8'/%3E%3Cpolygon points='90,180 140,130 175,160 200,140 210,180' fill='%23C0C0C0'/%3E%3C/svg%3E";

function _jmsCSS() {
  if (document.getElementById('jms-styles')) return;
  var s = document.createElement('style');
  s.id = 'jms-styles';
  s.textContent = [
    '.jms-screen{position:absolute;inset:0;display:flex;flex-direction:column;background:#fff;overflow-y:auto;-webkit-overflow-scrolling:touch}',
    '.jms-hidden{display:none!important}',
    '#jms-screen-scan{align-items:center;justify-content:center;padding:20px;gap:0;text-align:center}',
    '.jms-logo{display:flex;flex-direction:column;align-items:center;line-height:1;user-select:none;margin-bottom:40px}',
    '.jms-logo-top{font-size:clamp(1.3rem,5vw,2rem);font-weight:900;letter-spacing:.06em;text-transform:uppercase;color:#0D0D0D}',
    '.jms-logo-top sup{font-size:.45em;font-weight:700;vertical-align:super;letter-spacing:0}',
    '.jms-logo-btm{display:flex;align-items:center;gap:6px;margin-top:2px}',
    '.jms-logo-line{flex:1;height:1px;width:28px;background:#0D0D0D}',
    '.jms-logo-home{font-size:clamp(.9rem,3vw,1.2rem);font-style:italic;font-weight:400;letter-spacing:.02em;color:#0D0D0D;font-family:Georgia,serif}',
    '.jms-ring{position:relative;width:96px;height:96px;margin-bottom:28px}',
    '.jms-ring::before,.jms-ring::after{content:"";position:absolute;inset:0;border-radius:50%;border:2px solid #0D0D0D;animation:jms-pulse 2.2s ease-out infinite}',
    '.jms-ring::after{animation-delay:1.1s}',
    '.jms-ring-inner{position:absolute;inset:16px;border-radius:50%;background:#0D0D0D;display:flex;align-items:center;justify-content:center}',
    '@keyframes jms-pulse{0%{transform:scale(1);opacity:.5}100%{transform:scale(1.7);opacity:0}}',
    '.jms-instr{font-size:clamp(1.2rem,4.5vw,1.8rem);font-weight:300;color:#0D0D0D;letter-spacing:-.01em}',
    '.jms-instr strong{display:block;font-weight:800}',
    '#jms-hid{position:fixed;top:-100px;left:-100px;width:1px;height:1px;opacity:0;font-size:16px}',
    '#jms-btn-cam{display:flex;align-items:center;gap:8px;background:transparent;color:#0D0D0D;border:1.5px solid #E2E2E2;padding:13px 26px;border-radius:99px;font-size:.9375rem;font-weight:600;margin-top:28px;letter-spacing:.01em;cursor:pointer;font-family:inherit;transition:background .15s,border-color .15s}',
    '#jms-btn-cam:hover{background:#F0F0F0;border-color:#aaa}',
    '#jms-btn-cam:active{transform:scale(.97)}',
    '#jms-screen-result{overflow:hidden}',
    '.jms-photo-wrap{width:100%;flex:0 0 46vh;min-height:180px;background:#F7F7F7;display:flex;align-items:center;justify-content:center;overflow:hidden;border-bottom:1px solid #E2E2E2}',
    '#jms-photo{width:100%;height:100%;object-fit:contain}',
    '.jms-result-info{flex:1;padding:20px;display:flex;flex-direction:column;overflow-y:auto}',
    '.jms-tag{display:inline-block;background:#F0F0F0;color:#888;font-size:.7rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:4px 10px;border-radius:99px;margin-bottom:10px;align-self:flex-start}',
    '#jms-nombre{font-size:clamp(1.3rem,5.5vw,2rem);font-weight:800;line-height:1.15;letter-spacing:-.02em;margin-bottom:6px}',
    '#jms-color{font-size:1rem;color:#888;margin-bottom:20px;font-weight:400}',
    '.jms-units-card{background:#0D0D0D;color:#fff;border-radius:12px;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}',
    '.jms-units-lbl{font-size:.8125rem;text-transform:uppercase;letter-spacing:.1em;opacity:.6}',
    '#jms-units{font-size:clamp(2rem,8vw,3.2rem);font-weight:900;letter-spacing:-.03em;line-height:1}',
    '#jms-btn-back{width:100%;margin-bottom:8px;background:#0D0D0D;color:#fff;font-weight:700;padding:15px;letter-spacing:.04em;text-transform:uppercase;font-size:.875rem;border:none;border-radius:8px;cursor:pointer;font-family:inherit;transition:background .15s}',
    '#jms-btn-back:hover{background:#333}',
    '#jms-btn-back:active{transform:scale(.97)}',
    '.jms-countdown{text-align:center;font-size:.75rem;color:#888}',
    '#jms-screen-error{align-items:center;justify-content:center;padding:20px;text-align:center;gap:0}',
    '.jms-err-badge{width:68px;height:68px;border-radius:50%;border:2px solid rgba(204,34,0,.2);background:rgba(204,34,0,.05);display:flex;align-items:center;justify-content:center;margin:0 auto 20px}',
    '.jms-err-title{font-size:1rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#CC2200;margin-bottom:12px}',
    '#jms-err-msg{font-size:1rem;color:#0D0D0D;max-width:320px;line-height:1.6;margin-bottom:32px;white-space:pre-line}',
    '#jms-btn-err{background:#0D0D0D;color:#fff;font-weight:700;padding:15px 32px;letter-spacing:.04em;text-transform:uppercase;font-size:.875rem;border:none;border-radius:8px;cursor:pointer;font-family:inherit}',
    '#jms-btn-err:hover{background:#333}',
    '#jms-btn-err:active{transform:scale(.97)}',
    '#jms-cam-ov{position:absolute;inset:0;background:#000;z-index:50;display:flex;flex-direction:column;overflow:hidden}',
    '.jms-cam-hd{display:flex;align-items:center;gap:12px;padding:14px 20px;background:rgba(0,0,0,.9);flex-shrink:0;border-bottom:1px solid rgba(255,255,255,.1)}',
    '.jms-cam-hd h2{flex:1;color:#fff;font-size:.875rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em}',
    '#jms-cam-close{background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.2);padding:9px 18px;border-radius:99px;font-size:.8125rem;min-height:40px;cursor:pointer;font-family:inherit}',
    '#jms-cam-close:hover{background:rgba(255,255,255,.22)}',
    '.jms-cam-body{flex:1;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#111;min-height:0}',
    '#jms-cam-reader{width:100%;height:100%}',
    '#jms-cam-reader>div{width:100%!important;height:100%!important;padding-bottom:0!important}',
    '#jms-cam-reader video{width:100%!important;height:100%!important;object-fit:cover!important;display:block}',
    '#jms-cam-reader button{display:none!important}',
    '#jms-cam-reader select{display:none!important}',
    '.jms-cam-ft{background:rgba(0,0,0,.9);padding:18px 20px;text-align:center;flex-shrink:0;border-top:1px solid rgba(255,255,255,.1)}',
    '#jms-cam-status{color:rgba(255,255,255,.8);font-size:.8125rem;font-weight:500;letter-spacing:.02em}',
    '#jms-loading{position:absolute;inset:0;background:rgba(255,255,255,.88);backdrop-filter:blur(4px);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:60}',
    '.jms-spin{width:40px;height:40px;border:3px solid #E2E2E2;border-top-color:#0D0D0D;border-radius:50%;animation:jms-spin .7s linear infinite;margin-bottom:14px}',
    '@keyframes jms-spin{to{transform:rotate(360deg)}}'
  ].join('');
  document.head.appendChild(s);
}

function renderScanner() {
  _jmsCSS();
  var body = $('scanner-body');
  if (!body) return;
  _jmsStopCamera();
  _jmsCleanup();

  body.innerHTML =
    '<div class="jms-screen" id="jms-screen-scan">' +
      '<div class="jms-logo">' +
        '<span class="jms-logo-top">Justo Makario<sup>®</sup></span>' +
        '<div class="jms-logo-btm"><span class="jms-logo-line"></span><span class="jms-logo-home">Home</span><span class="jms-logo-line"></span></div>' +
      '</div>' +
      '<div class="jms-ring">' +
        '<div class="jms-ring-inner">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:28px;height:28px">' +
            '<path d="M3 9V6a1 1 0 0 1 1-1h3M3 15v3a1 1 0 0 0 1 1h3M21 9V6a1 1 0 0 0-1-1h-3M21 15v3a1 1 0 0 1-1 1h-3"/>' +
            '<line x1="8" y1="12" x2="8" y2="12.01"/><line x1="12" y1="9" x2="12" y2="15"/><line x1="16" y1="12" x2="16" y2="12.01"/>' +
          '</svg>' +
        '</div>' +
      '</div>' +
      '<p class="jms-instr">Escaneá una etiqueta<strong>de MercadoLibre</strong></p>' +
      '<button id="jms-btn-cam">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>' +
        ' Escanear con cámara' +
      '</button>' +
      '<input id="jms-hid" type="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" aria-label="Input de escaneo">' +
    '</div>' +

    '<div class="jms-screen jms-hidden" id="jms-screen-result">' +
      '<div class="jms-photo-wrap"><img id="jms-photo" alt="Producto"></div>' +
      '<div class="jms-result-info">' +
        '<span class="jms-tag">Pedido encontrado</span>' +
        '<p id="jms-nombre"></p>' +
        '<p id="jms-color"></p>' +
        '<div class="jms-units-card"><span class="jms-units-lbl">Unidades a preparar</span><span id="jms-units"></span></div>' +
        '<button id="jms-btn-back">Siguiente escaneo</button>' +
        '<p class="jms-countdown" id="jms-countdown"></p>' +
      '</div>' +
    '</div>' +

    '<div class="jms-screen jms-hidden" id="jms-screen-error">' +
      '<div class="jms-err-badge">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="#CC2200" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:32px;height:32px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="0.5" fill="#CC2200"/></svg>' +
      '</div>' +
      '<p class="jms-err-title">No encontrado</p>' +
      '<p id="jms-err-msg"></p>' +
      '<button id="jms-btn-err">Volver a escanear</button>' +
    '</div>' +

    '<div id="jms-cam-ov" class="jms-hidden">' +
      '<div class="jms-cam-hd"><h2>Escaneando con cámara</h2><button id="jms-cam-close">✕ Cerrar</button></div>' +
      '<div class="jms-cam-body"><div id="jms-cam-reader"></div></div>' +
      '<div class="jms-cam-ft"><p id="jms-cam-status">Iniciando cámara...</p></div>' +
    '</div>' +

    '<div id="jms-loading" class="jms-hidden">' +
      '<div class="jms-spin"></div>' +
      '<p style="font-size:.8125rem;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:.08em">Buscando...</p>' +
    '</div>';

  var hid = document.getElementById('jms-hid');
  hid.addEventListener('keydown', function(e) {
    if (e.key !== 'Enter') return;
    var raw = hid.value.trim();
    hid.value = '';
    if (raw) _jmsHandleScan(raw);
  });

  document.getElementById('jms-btn-cam').addEventListener('click', _jmsStartCamera);
  document.getElementById('jms-cam-close').addEventListener('click', _jmsStopCamera);
  document.getElementById('jms-btn-back').addEventListener('click', function() {
    _jmsCleanup(); _jmsShowScreen('scan');
  });
  document.getElementById('jms-btn-err').addEventListener('click', function() {
    _jmsShowScreen('scan');
  });

  body.addEventListener('click', function(e) {
    if (!e.target.closest('#jms-cam-ov')) _jmsEnforceFocus();
  });

  if (!_jmsVisHookAdded) {
    _jmsVisHookAdded = true;
    document.addEventListener('visibilitychange', function() {
      if (document.hidden) { _jmsStopCamera(); }
      else { _jmsEnforceFocus(); }
    });
  }

  setTimeout(_jmsEnforceFocus, 100);
}

function _jmsShowScreen(name) {
  ['scan', 'result', 'error'].forEach(function(s) {
    var el = document.getElementById('jms-screen-' + s);
    if (el) el.classList.toggle('jms-hidden', s !== name);
  });
  if (name === 'scan') { _jmsCleanup(); setTimeout(_jmsEnforceFocus, 60); }
}

function _jmsEnforceFocus() {
  if (_jmsCameraActive || curPage !== 'scanner') return;
  var el = document.getElementById('jms-hid');
  if (el) el.focus({ preventScroll: true });
}

function _jmsCleanup() {
  clearTimeout(_jmsResultTimer);
  clearInterval(_jmsCountdownInterval);
  var cd = document.getElementById('jms-countdown');
  if (cd) cd.textContent = '';
}

function _jmsParse(raw) {
  if (!raw) throw new Error('El escaner no envió ningún dato.');
  var parsed;
  try { parsed = JSON.parse(raw); } catch (e) {
    throw new Error('Formato inválido.\nSe esperaba JSON, se recibió:\n"' + raw + '"');
  }
  if (!parsed.id) throw new Error('El código no contiene un campo "id" válido.');
  if (parsed.t && parsed.t !== 'lm') throw new Error('Tipo desconocido: "' + parsed.t + '".\nSolo se acepta "lm".');
  return parsed;
}

async function _jmsHandleScan(raw) {
  var loading = document.getElementById('jms-loading');
  if (loading) loading.classList.remove('jms-hidden');
  try {
    var barcode;
    try { barcode = _jmsParse(raw); } catch (err) {
      if (loading) loading.classList.add('jms-hidden');
      _jmsShowErr(err.message);
      return;
    }
    var mlId = String(barcode.id).trim();
    var res = await sb.from('orders')
      .select('id,numero,canal,subcanal,productos,cantidad,sku,estado,notas,fecha_pedido')
      .eq('ml_order_id', mlId)
      .limit(1);
    if (loading) loading.classList.add('jms-hidden');
    if (res.error || !res.data || !res.data.length) {
      _jmsShowErr('ID "' + mlId + '" no encontrado en los pedidos.\n\nVerificá que el pedido esté importado desde MercadoLibre.');
      return;
    }
    _jmsShowResult(res.data[0], mlId);
  } catch (e) {
    if (loading) loading.classList.add('jms-hidden');
    _jmsShowErr('Error al buscar el pedido.\nIntentá de nuevo.');
  }
}

function _jmsShowResult(order, mlId) {
  _jmsCleanup();
  var photo = document.getElementById('jms-photo');
  if (photo) { photo.src = JMS_PH; photo.onerror = function() { this.src = JMS_PH; }; }

  var prods = Array.isArray(order.productos) ? order.productos : [];
  var nombre = (prods[0] && prods[0].nombre) ? prods[0].nombre : (order.sku || mlId);
  var color  = (prods[0] && prods[0].color)  ? prods[0].color  : '';
  var units  = order.cantidad || (prods[0] && prods[0].cantidad) || 1;

  var subLbl = order.subcanal === 'colecta' ? 'Colecta'
    : order.subcanal === 'flex' ? 'Flex'
    : order.canal === 'tiendanube' ? 'Tienda Nube'
    : order.canal || '';
  var stLbl  = SL[order.estado] || order.estado || '';
  var colorLine = [color, subLbl, stLbl].filter(Boolean).join(' · ');

  var n = document.getElementById('jms-nombre'); if (n) n.textContent = nombre;
  var c = document.getElementById('jms-color');  if (c) c.textContent = colorLine;
  var u = document.getElementById('jms-units');  if (u) u.textContent = units;

  _jmsShowScreen('result');

  var remaining = Math.round(JMS_TIMEOUT / 1000);
  var cd = document.getElementById('jms-countdown');
  if (cd) cd.textContent = 'Volviendo en ' + remaining + 's...';

  _jmsCountdownInterval = setInterval(function() {
    remaining--;
    if (cd) cd.textContent = remaining > 0 ? 'Volviendo en ' + remaining + 's...' : '';
  }, 1000);

  _jmsResultTimer = setTimeout(function() {
    clearInterval(_jmsCountdownInterval);
    _jmsShowScreen('scan');
  }, JMS_TIMEOUT);
}

function _jmsShowErr(msg) {
  var el = document.getElementById('jms-err-msg');
  if (el) el.textContent = msg;
  _jmsShowScreen('error');
}

async function _jmsStartCamera() {
  if (_jmsCameraActive) return;
  if (typeof Html5Qrcode === 'undefined') {
    var ok = await new Promise(function(resolve) {
      var s = document.createElement('script');
      s.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
      s.onload = function() { resolve(true); };
      s.onerror = function() { resolve(false); };
      document.head.appendChild(s);
    });
    if (!ok || typeof Html5Qrcode === 'undefined') {
      _jmsShowErr('La librería de cámara no se pudo cargar.\n\nVerificá tu conexión a internet e intentá de nuevo.');
      return;
    }
  }
  _jmsCameraActive = true;
  var ov = document.getElementById('jms-cam-ov');
  var st = document.getElementById('jms-cam-status');
  if (ov) ov.classList.remove('jms-hidden');
  if (st) st.textContent = 'Iniciando cámara...';
  try {
    _jmsCameraScanner = new Html5Qrcode('jms-cam-reader');
    await _jmsCameraScanner.start(
      { facingMode: 'environment' },
      { fps: 12, qrbox: function(w, h) { var side = Math.floor(Math.min(w, h) * 0.72); return { width: side, height: side }; } },
      function(decoded) { _jmsStopCamera(); _jmsHandleScan(decoded); },
      function() {}
    );
    if (st) st.textContent = 'Apuntá al código de barras de la etiqueta';
  } catch (err) {
    _jmsStopCamera();
    var msg = 'No se pudo acceder a la cámara.';
    if (err && /[Pp]ermission|[Dd]enied|[Nn]ot[Aa]llowed/.test(err.message || '')) {
      msg = 'Permiso de cámara denegado.\n\nAndá a configuración del navegador, permití cámara para este sitio, y recargá la página.';
    } else if (err && /[Nn]ot[Ff]ound|[Nn]o.*[Cc]amera|[Ss]ource/.test(err.message || '')) {
      msg = 'No se encontró ninguna cámara en este dispositivo.';
    }
    _jmsShowErr(msg);
  }
}

function _jmsStopCamera() {
  if (!_jmsCameraActive) return;
  _jmsCameraActive = false;
  var ov = document.getElementById('jms-cam-ov');
  if (ov) ov.classList.add('jms-hidden');
  var rd = document.getElementById('jms-cam-reader');
  if (rd) rd.innerHTML = '';
  if (_jmsCameraScanner) {
    var sc = _jmsCameraScanner;
    _jmsCameraScanner = null;
    sc.stop().catch(function() {});
  }
}

function stopScannerCam() { _jmsStopCamera(); }

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
      .in('canal', ['mercadolibre', 'tiendanube'])
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

  const ordersColecta   = orders.filter(o => o.subcanal === 'colecta');
  const ordersFlex      = orders.filter(o => o.subcanal === 'flex');
  const ordersTN        = orders.filter(o => o.canal === 'tiendanube');
  const ordersOtros     = orders.filter(o => o.subcanal !== 'colecta' && o.subcanal !== 'flex' && o.canal !== 'tiendanube');

  const udsColecta = countUnidades(ordersColecta);
  const udsFlex    = countUnidades(ordersFlex);
  const udsTN      = countUnidades(ordersTN);

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
  const mapaTN      = buildMapa(ordersTN);
  const mapaTotal   = buildMapa(orders);
  subtractLogs(mapaColecta, prodLogs.filter(l => l.subcanal === 'colecta'));
  subtractLogs(mapaFlex,    prodLogs.filter(l => l.subcanal === 'flex'));
  subtractLogs(mapaTN,      prodLogs.filter(l => l.subcanal === 'tiendanube'));
  subtractLogs(mapaTotal,   prodLogs);

  const filasColecta = Object.values(mapaColecta).filter(f => f.modelo && f.pedido > 0);
  const filasFlex    = Object.values(mapaFlex).filter(f => f.modelo && f.pedido > 0);
  const filasTN      = Object.values(mapaTN).filter(f => f.modelo && f.pedido > 0);
  const totalPendiente = Object.values(mapaTotal).reduce((s, f) => s + Math.max(0, f.pedido - f.producido), 0);
  const pendColecta = filasColecta.reduce((s, f) => s + Math.max(0, f.pedido - f.producido), 0);
  const pendFlex    = filasFlex.reduce((s, f) => s + Math.max(0, f.pedido - f.producido), 0);
  const pendTN      = filasTN.reduce((s, f) => s + Math.max(0, f.pedido - f.producido), 0);

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
              const diff = f.pedido - f.producido;           // negativo = surplus
              const pendiente = Math.max(0, diff);
              const surplus   = Math.max(0, -diff);          // producido > pedido
              const pct = f.pedido > 0 ? Math.min(100, Math.round((f.producido / f.pedido) * 100)) : 100;
              const pendCell = surplus > 0
                ? `<span style="color:var(--green);font-weight:700">+${surplus} stock</span>`
                : pendiente > 0
                  ? `<span style="color:var(--red);font-weight:700">${pendiente}</span>`
                  : `<span style="color:var(--green)">✓ 0</span>`;
              return `<tr>
                <td style="font-weight:600">${esc(f.modelo)}</td>
                <td>
                  ${f.color
                    ? `<span style="display:inline-block;padding:2px 8px;background:color-mix(in srgb,var(--blue) 8%,transparent);border:1px solid var(--blue);border-radius:12px;font-size:11px;font-weight:600;color:var(--blue)">${esc(f.color)}</span>`
                    : '<span style="color:var(--ink-muted)">—</span>'}
                </td>
                <td style="text-align:center;font-family:var(--mono);font-weight:700">${f.pedido}</td>
                <td style="text-align:center;font-family:var(--mono);font-weight:700;color:var(--green)">${f.producido}</td>
                <td style="text-align:center;font-family:var(--mono)">${pendCell}</td>
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
        <div style="font-size:13px;color:var(--ink-muted);margin-bottom:24px">Importá el Excel de MercadoLibre (Colecta / Flex) o Tienda Nube para registrar los pedidos del día.</div>
        <button class="btn" onclick="openImportML()">↑ Importar Excel</button>
      </div>`;
    return;
  }

  // ── Render ──────────────────────────────────────────────────────────────
  const carrierBadge = (c) => c === 'colecta'
    ? `<span class="badge-info b" style="font-size:10px">Colecta</span>`
    : c === 'flex'
    ? `<span class="badge-info g" style="font-size:10px">Flex</span>`
    : c === 'tiendanube'
    ? `<span class="badge-info b" style="font-size:10px">Tienda Nube</span>`
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
        <div class="sc-v">${ordersColecta.length} <span style="font-size:13px;font-weight:500;color:var(--ink-muted)">· ${pendColecta > 0 ? `<span style="color:var(--red)">${pendColecta} pend.</span>` : '✓ al día'}</span></div>
      </div>
      <div class="sc b" style="cursor:pointer" onclick="document.getElementById('section-flex').scrollIntoView({behavior:'smooth'})">
        <div class="sc-l">Flex · 14:00 hs</div>
        <div class="sc-v">${ordersFlex.length} <span style="font-size:13px;font-weight:500;color:var(--ink-muted)">· ${pendFlex > 0 ? `<span style="color:var(--red)">${pendFlex} pend.</span>` : '✓ al día'}</span></div>
      </div>
      <div class="sc b" style="cursor:pointer" onclick="document.getElementById('section-tn').scrollIntoView({behavior:'smooth'})">
        <div class="sc-l">Tienda Nube</div>
        <div class="sc-v">${ordersTN.length} <span style="font-size:13px;font-weight:500;color:var(--ink-muted)">· ${pendTN > 0 ? `<span style="color:var(--red)">${pendTN} pend.</span>` : '✓ al día'}</span></div>
      </div>
    </div>

    ${ordersHoy.length === 0 ? `
      <div class="card" style="padding:14px 18px;margin-bottom:16px;border-left:3px solid var(--ink-muted)">
        <div style="font-size:11px;font-weight:700;letter-spacing:.08em;color:var(--ink-muted);text-transform:uppercase;margin-bottom:4px">Sin importaciones hoy</div>
        <div style="font-size:13px;color:var(--ink-muted)">Los datos acumulados provienen de importaciones anteriores.</div>
      </div>` : `
      <div class="card" style="padding:14px 18px;margin-bottom:16px;border-left:3px solid var(--blue)">
        <div style="font-size:11px;font-weight:700;letter-spacing:.08em;color:var(--ink-muted);text-transform:uppercase;margin-bottom:4px">Importaciones de hoy</div>
        <div style="font-size:13px">${ordersHoy.length} pedidos · ${unidadesHoy} unidades · ${ordersHoy.filter(o=>o.subcanal==='colecta').length} Colecta · ${ordersHoy.filter(o=>o.subcanal==='flex').length} Flex · ${ordersHoy.filter(o=>o.canal==='tiendanube').length} TN</div>
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

    <!-- Sección Tienda Nube -->
    <div id="section-tn" class="card" style="padding:20px;margin-bottom:16px;border-top:3px solid var(--blue)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--blue);margin-bottom:4px">TIENDA NUBE — Web propia</div>
          <div style="font-size:13px;color:var(--ink-muted)">${ordersTN.length} pedidos · ${udsTN} unidades · <span style="color:${pendTN > 0 ? 'var(--red)' : 'var(--green)'};font-weight:700">${pendTN} pendientes</span></div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button id="carrier-detail-btn-tiendanube" class="btn-ghost sm" onclick="toggleCarrierDetail('tiendanube')">Ver pedidos ▾</button>
          <button class="btn-ghost sm" onclick="openImportML()">↑ Importar</button>
        </div>
      </div>
      <div id="carrier-detail-tiendanube" style="display:none;border-bottom:1px solid var(--border);margin-bottom:16px;padding-bottom:16px"></div>
      ${buildPendingTable(filasTN, 'Tienda Nube')}
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

  // Auto-scroll al carrier si se llegó desde el dashboard
  if (_scrollToCarrier) {
    const sectionId = _scrollToCarrier === 'tn' ? 'section-tn' : `section-${_scrollToCarrier}`;
    _scrollToCarrier = null;
    setTimeout(() => {
      const el = document.getElementById(sectionId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.style.outline = '2px solid var(--blue)';
        el.style.outlineOffset = '4px';
        setTimeout(() => { el.style.outline = ''; el.style.outlineOffset = ''; }, 1800);
      }
    }, 150);
  }
}

/* ═══ QR + Scanner ═══ */

// Genera y muestra el QR de un SKU en el modal m-qr
function showQR(sku, nombre) {
  $('qr-modal-title').textContent = `QR — ${sku}`;
  $('qr-sku-label').textContent = sku;
  $('qr-nombre-label').textContent = nombre || '';
  const wrap = $('qr-canvas-wrap');
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(sku)}&format=png&bgcolor=ffffff&color=0f0f0f&margin=8`;
  wrap.innerHTML = `<img src="${url}" width="220" height="220" style="display:block;border-radius:6px" alt="QR ${esc(sku)}" id="qr-img-rendered">`;
  openM('m-qr');
}

// Abre el QR en nueva pestaña para imprimir/guardar
function downloadQR() {
  const sku = $('qr-sku-label').textContent || 'qr';
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(sku)}&format=png&bgcolor=ffffff&color=0f0f0f&margin=10`;
  window.open(url, '_blank');
}

/* ═══ Cámara QR inline en modal de producción ═══ */
let _prodCamScanner = null;

async function openProdCamScanner() {
  const wrap = $('mp-cam-wrap');
  if (!wrap) return;

  // Cargar html5-qrcode dinámicamente si no está
  if (typeof Html5Qrcode === 'undefined') {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  wrap.style.display = 'block';
  if (_prodCamScanner) { try { await _prodCamScanner.stop(); } catch(_) {} }
  _prodCamScanner = new Html5Qrcode('mp-cam-reader');
  try {
    await _prodCamScanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 220, height: 220 } },
      (decodedText) => {
        closeProdCamScanner();
        _processProdScanResult(decodedText.trim());
      },
      () => {}
    );
  } catch (err) {
    wrap.style.display = 'none';
    showToast('No se pudo acceder a la cámara', 'error');
  }
}

async function closeProdCamScanner() {
  const wrap = $('mp-cam-wrap');
  if (wrap) wrap.style.display = 'none';
  if (_prodCamScanner) {
    try { await _prodCamScanner.stop(); } catch(_) {}
    _prodCamScanner = null;
  }
}

function _processProdScanResult(raw) {
  let sku = raw;
  try { const p = JSON.parse(raw); if (p.sku) sku = p.sku; else if (p.id) sku = p.id; } catch(_) {}
  const found = _prodCatalog.find(p => p.sku.toLowerCase() === sku.toLowerCase());
  if (found) {
    const sel = $('mp-model-sel');
    sel.value = found.id;
    onProdModelChange(sel);
    showToast(`✓ ${esc(found.sku)} — ${esc(found.modelo || '')}`, 'success');
  } else {
    showToast(`SKU "${esc(sku)}" no encontrado en el catálogo`, 'error');
  }
}

/* ═══ Panel QR — imprimir QRs por SKU ═══ */
async function openQrPanel() {
  const { data: catalog } = await sb.from('product_catalog')
    .select('sku,modelo,variante,nombre_display')
    .eq('es_fabricado', true)
    .eq('activo', true)
    .order('sku');

  if (!catalog || !catalog.length) {
    showToast('No hay productos fabricados en el catálogo', 'error');
    return;
  }

  const items = catalog.map(p => {
    const label = p.nombre_display || (p.modelo + (p.variante ? ' ' + p.variante : ''));
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(p.sku)}&size=180x180&margin=6`;
    return `
      <div style="display:inline-block;text-align:center;padding:16px;border:1px solid #ddd;border-radius:8px;break-inside:avoid">
        <img src="${qrUrl}" width="180" height="180" alt="${p.sku}" style="display:block;margin:0 auto">
        <div style="margin-top:8px;font-family:monospace;font-weight:800;font-size:14px;color:#000">${p.sku}</div>
        <div style="font-size:11px;color:#555;margin-top:2px;max-width:180px">${label}</div>
      </div>`;
  }).join('');

  const win = window.open('', '_blank', 'width=900,height=700');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>QRs de Producción — Justo Makario</title>
    <style>
      body{font-family:-apple-system,sans-serif;padding:24px;background:#fff;color:#000}
      h1{font-size:18px;font-weight:800;margin:0 0 4px}
      .sub{font-size:12px;color:#888;margin-bottom:20px}
      .grid{display:flex;flex-wrap:wrap;gap:16px}
      @media print{button{display:none!important}}
    </style></head><body>
    <h1>QRs de Producción · Justo Makario</h1>
    <div class="sub">Escanear con la app para registrar producción · ${new Date().toLocaleDateString('es-AR')}</div>
    <button onclick="window.print()" style="margin-bottom:20px;padding:10px 20px;background:#0A0A0A;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer">🖨 Imprimir / Guardar PDF</button>
    <div class="grid">${items}</div>
    </body></html>`);
  win.document.close();
}

// Escucha Enter del scanner HID en el campo mp-scan-input del modal de producción
function onProdScanKey(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const raw = $('mp-scan-input').value.trim();
  if (!raw) return;
  $('mp-scan-input').value = '';
  _processProdScanResult(raw);
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

  let query = sb.from('orders')
    .select('id,numero,ml_order_id,cliente,productos,cantidad,sku,estado,fecha_pedido,created_at,canal,subcanal')
    .not('estado', 'in', '("cancelado","entregado","despachado")')
    .order('created_at', { ascending: false });

  if (carrier === 'tiendanube') {
    query = query.eq('canal', 'tiendanube');
  } else {
    query = query.eq('canal', 'mercadolibre').eq('subcanal', carrier);
  }

  const { data: orders } = await query;

  const carrierLabel = carrier === 'colecta' ? 'Colecta' : carrier === 'flex' ? 'Flex' : 'Tienda Nube';
  const lista = orders || [];
  const isOwnerAdmin = ['owner', 'admin'].includes(cu.role);

  if (!lista.length) {
    container.innerHTML = `<div style="color:var(--ink-muted);font-size:13px;padding:12px 0">Sin pedidos activos para ${carrierLabel}.</div>`;
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
  const confirmBtn = $('btn-import-confirm');
  confirmBtn.style.display = 'none';
  unlockBtn(confirmBtn, 'Importar Pedidos'); // siempre resetear estado del botón al abrir
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
  const map = {
    colecta:      { el: $('import-lbl-colecta'),      color: 'var(--blue)' },
    flex:         { el: $('import-lbl-flex'),          color: 'var(--blue)' },
    tiendanube:   { el: $('import-lbl-tiendanube'),   color: 'var(--blue)' },
    distribuidor: { el: $('import-lbl-distribuidor'), color: 'var(--amber)' }
  };
  for (const [k, { el, color }] of Object.entries(map)) {
    if (!el) continue;
    el.style.borderColor = val === k ? color : 'var(--border)';
    el.style.background  = val === k ? `color-mix(in srgb, ${color} 8%, transparent)` : '';
  }
}

function previewML(input) {
  const file = input.files[0];
  if (!file) return;
  if (typeof XLSX === 'undefined') { showToast('Error: librería Excel no cargada. Recargá la página.', 'error'); return; }

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (!rows || rows.length < 2) { showToast('El archivo está vacío o no tiene datos', 'error'); return; }

      // ── Buscar la fila de encabezados (ML tiene texto intro antes) ──────
      const ML_HEADER_MARKERS  = ['# de venta', 'título de la publicación', 'titulo de la publicacion', 'fecha de venta', 'nro. de venta'];
      const TN_HEADER_MARKERS  = ['número de pedido', 'numero de pedido', 'nombre y apellido', 'nombre del producto', 'variantes del producto', 'variante del producto'];
      let headerRowIdx = 0;
      for (let i = 0; i < Math.min(15, rows.length); i++) {
        const rowStr = rows[i].map(String).join('|').toLowerCase();
        if ([...ML_HEADER_MARKERS, ...TN_HEADER_MARKERS].some(m => rowStr.includes(m.toLowerCase()))) { headerRowIdx = i; break; }
      }
      const headers = rows[headerRowIdx].map(String);
      const headersLow = headers.map(h => h.toLowerCase());
      // Normalizar unicode (NFC) antes de comparar — ML exporta con composición diferente
      const norm = s => s.normalize('NFC').toLowerCase()
        .replace(/á/g,'a').replace(/é/g,'e').replace(/í/g,'i').replace(/ó/g,'o').replace(/ú/g,'u').replace(/ñ/g,'n');
      const headersNorm = headers.map(h => norm(h));
      const findCol = (...terms) => {
        for (const t of terms) {
          const nt = norm(t);
          const idx = headersNorm.findIndex(h => h.includes(nt));
          if (idx >= 0) return idx;
        }
        return -1;
      };

      // ── Detectar fuente: Tienda Nube vs MercadoLibre ────────────────────
      const isTN = TN_HEADER_MARKERS.some(m => headersLow.some(h => h.includes(m.toLowerCase())));
      const isML = ML_HEADER_MARKERS.some(m => headersLow.some(h => h.includes(m.toLowerCase())));

      // ── Para ML: intentar detectar Colecta vs Flex en los datos ─────────
      let autoCarrier = null;
      if (isTN) {
        autoCarrier = 'tiendanube';
      } else if (isML) {
        // Buscar columna de tipo de envío y escanear valores
        const envioCol = findCol('tipo de envío', 'tipo de envio', 'modalidad', 'shipping', 'logística', 'logistica', 'modo de envio', 'tipo de logística');
        if (envioCol >= 0) {
          const envioVals = rows.slice(headerRowIdx + 1, headerRowIdx + 20).map(r => String(r[envioCol] || '').toLowerCase());
          const hasColecta = envioVals.some(v => v.includes('colecta') || v.includes('collect'));
          const hasFlex    = envioVals.some(v => v.includes('flex'));
          if (hasColecta && !hasFlex)      autoCarrier = 'colecta';
          else if (hasFlex && !hasColecta) autoCarrier = 'flex';
        }
        // Si no pudo detectar por datos, dejar al usuario elegir
        if (!autoCarrier) autoCarrier = getImportCarrier(); // mantener selección actual si existe
      }

      // ── Auto-seleccionar radio si se detectó ────────────────────────────
      if (autoCarrier) {
        const radio = document.querySelector(`input[name="import-carrier"][value="${autoCarrier}"]`);
        if (radio) { radio.checked = true; updateCarrierStyles(autoCarrier); }
        const errEl = $('import-carrier-error');
        if (errEl) errEl.style.display = 'none';
      }

      const hasVenta    = findCol('# de venta', 'nro. de venta', 'número de venta', 'numero de venta', 'n° de venta', 'nro venta', 'venta') >= 0;
      const hasTitulo   = findCol('título', 'titulo', 'publicación', 'publicacion', 'title', 'producto', 'artículo', 'articulo', 'descripcion', 'descripción', 'nombre del producto') >= 0;
      const hasUnidades = findCol('unidades', 'cantidad', 'qty', 'units') >= 0;

      const detectInfo = $('ml-detect-info');
      detectInfo.style.display = 'block';

      const sourceLabel = isTN ? '🟦 Tienda Nube' : isML ? '🟡 MercadoLibre' : null;
      const carrierLabel = autoCarrier === 'colecta' ? 'Colecta 12:00 hs' : autoCarrier === 'flex' ? 'Flex 14:00 hs' : autoCarrier === 'tiendanube' ? 'Tienda Nube' : null;

      if (!hasVenta && !hasTitulo && !hasUnidades) {
        const headerList = headers.filter(h => h.trim()).slice(0, 20).join(' | ');
        detectInfo.innerHTML = `<div class="badge-info r" style="display:block">No pudimos reconocer este archivo. Verificá que sea un export de MercadoLibre o Tienda Nube.<br><small style="opacity:.75">Columnas encontradas: <em>${esc(headerList)}</em></small></div>`;
        return;
      }

      // ── Mapeo de columnas — cubre ML y Tienda Nube ──────────────────────
      const COL = {
        venta:    findCol('# de venta', 'nro. de venta', 'numero de venta', 'n de venta', 'nro venta', 'numero de pedido', 'order'),
        titulo:   findCol('titulo de la publicacion', 'titulo del articulo', 'nombre del articulo', 'descripcion del articulo', 'titulo', 'title', 'nombre del producto', 'descripcion', 'articulo'),
        unidades: findCol('unidades', 'cantidad', 'qty', 'units'),
        comprador:findCol('comprador', 'buyer', 'nombre del comprador', 'nombre y apellido', 'nombre completo', 'cliente'),
        sku:      findCol('sku', 'codigo del publicante', 'código del publicante', 'codigo de articulo', 'código de artículo', 'cod. articulo', 'cod articulo', 'codigo articulo', 'item code', 'seller sku'),
        variante: findCol('variante', 'variacion', 'variant', 'variantes del producto', 'variante del producto'),
        dni:      findCol('dni', 'cuit', 'documento'),
        fecha:    findCol('fecha de venta', 'fecha de creacion', 'fecha'),
        estado:   findCol('estado', 'status'),
        canal:    findCol('canal de venta', 'canal')
      };

      const dataRows = rows.slice(headerRowIdx + 1).filter(r => r.some(c => String(c).trim() !== ''));

      // ── Seguridad: si la columna título tiene valores boolean, es la columna equivocada ──
      if (COL.titulo >= 0) {
        const BOOL_VALS = new Set(['si', 'no', 'sí', 'true', 'false', '1', '0', '']);
        const sample = dataRows.slice(0, 20).map(r => String(r[COL.titulo] || '').trim().toLowerCase());
        const boolCount = sample.filter(v => BOOL_VALS.has(v)).length;
        if (boolCount > sample.length * 0.4) {
          // Columna incorrecta — buscar primera columna con texto largo (>15 chars en promedio)
          const better = headers.findIndex((_, i) => {
            if (i === COL.titulo) return false;
            const vals = dataRows.slice(0, 10).map(r => String(r[i] || '').trim());
            const avgLen = vals.reduce((s, v) => s + v.length, 0) / (vals.length || 1);
            return avgLen > 15;
          });
          COL.titulo = better; // -1 si no encuentra nada mejor
        }
      }
      excelParsedData = { headers, rows: dataRows, COL, sourceType: isTN ? 'tiendanube' : 'mercadolibre' };

      const detectedMsg = sourceLabel
        ? `✓ ${sourceLabel} detectado${carrierLabel ? ` — <strong>${carrierLabel}</strong>` : ' — seleccioná el retiro arriba'} — ${dataRows.length} filas encontradas`
        : `✓ Formato detectado — ${dataRows.length} filas encontradas`;
      const needsCarrierWarn = isML && !autoCarrier
        ? `<br><span style="color:var(--amber);font-size:11px">⚠ No pudimos detectar si es Colecta o Flex — seleccionalo arriba antes de importar.</span>`
        : '';
      detectInfo.innerHTML = `<div class="badge-info g" style="display:block">${detectedMsg}${needsCarrierWarn}</div>`;

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
    if (errEl) { errEl.style.display = ''; errEl.textContent = 'Seleccioná el canal / tipo de retiro antes de importar'; }
    showToast('Seleccioná el canal antes de importar', 'error');
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

  // Determinar canal y subcanal según el carrier seleccionado
  const isTN   = carrier === 'tiendanube';
  const isDist = carrier === 'distribuidor';
  const canalInsertar    = isTN ? 'tiendanube' : isDist ? 'distribuidor' : 'mercadolibre';
  const subcanalInsertar = (isTN || isDist) ? null : carrier;

  const inserts = [];
  for (const g of listaGrupos) {
    if (g.ml_order_id && existingIds.has(g.ml_order_id)) continue;
    const totalUnidades = g.productos.reduce((s, p) => s + p.cantidad, 0);
    const firstSku = g.productos.find(p => p.sku)?.sku || null;
    inserts.push({
      canal: canalInsertar,
      subcanal: subcanalInsertar,
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
  unlockBtn(btn, 'Importar Pedidos');
  closeM('m-excel-import');
  showToast(`✓ ${inserts.length} pedidos importados${skipped > 0 ? ` · ${skipped} ya existían` : ''}`);
  if (curPage === 'carrier') renderCarrierPage();
  else navigate('dashboard');
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
      if (curPage === 'carrier') renderCarrierPage();
      else if (curPage === 'produccion') renderProduccion();
      else renderDash();
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
  if (!document.getElementById('dash-anim-style')) {
    const _s = document.createElement('style');
    _s.id = 'dash-anim-style';
    _s.textContent = '@keyframes dash-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.7)}}';
    document.head.appendChild(_s);
  }

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

  // Carrier split — pedidos activos por canal
  const countUds = (list) => list.reduce((s, o) => {
    const prods = o.productos || [];
    return s + (prods.length > 0 ? prods.reduce((ss, p) => ss + parseInt(p.cantidad || 0), 0) : parseInt(o.cantidad || 0));
  }, 0);
  const colectaActivos = activeOrders.filter(o => o.subcanal === 'colecta');
  const flexActivos    = activeOrders.filter(o => o.subcanal === 'flex');
  const tnActivos      = activeOrders.filter(o => o.canal === 'tiendanube');

  const distribActivos = activeOrders.filter(o => o.canal === 'distribuidor');
  const totalUdsActivas = countUds(activeOrders);

  $('dash-body').innerHTML = `
    <!-- ═══ HERO VENTAS ═══ -->
    <div style="
      background:#080808;
      border-radius:20px;
      padding:32px 36px 28px;
      margin-bottom:20px;
      position:relative;
      overflow:hidden;
    ">
      <!-- líneas de cuadrícula decorativas -->
      <div style="position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.03) 1px,transparent 1px);background-size:40px 40px;pointer-events:none"></div>
      <!-- glow central -->
      <div style="position:absolute;top:-60px;left:50%;transform:translateX(-50%);width:400px;height:200px;background:radial-gradient(ellipse,rgba(99,102,241,.18) 0%,transparent 70%);pointer-events:none"></div>

      <div style="position:relative;display:flex;align-items:flex-end;justify-content:space-between;gap:24px;flex-wrap:wrap">

        <!-- Lado izquierdo: label + número gigante -->
        <div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
            <div style="width:6px;height:6px;border-radius:50%;background:#6366f1;box-shadow:0 0 8px #6366f1,0 0 20px rgba(99,102,241,.6);animation:dash-pulse 2s ease-in-out infinite"></div>
            <span style="font-size:10px;font-weight:800;letter-spacing:.25em;text-transform:uppercase;color:rgba(255,255,255,.35)">Ventas activas</span>
          </div>
          <div style="font-size:clamp(5rem,14vw,9rem);font-weight:900;color:#fff;line-height:.9;letter-spacing:-.06em;font-variant-numeric:tabular-nums;text-shadow:0 0 60px rgba(99,102,241,.3)">
            ${activeOrders.length}
          </div>
          <div style="margin-top:14px;font-size:12px;color:rgba(255,255,255,.3);letter-spacing:.06em;text-transform:uppercase">
            ${totalUdsActivas} unidades · ${fdLong(new Date())}
          </div>
        </div>

        <!-- Lado derecho: pills de canal -->
        <div style="display:flex;flex-direction:column;gap:10px;align-self:center">
          <div onclick="openCarrierPage('colecta')" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:12px 18px;border-radius:12px;background:${colectaActivos.length ? 'rgba(99,102,241,.15)' : 'rgba(255,255,255,.04)'};border:1px solid ${colectaActivos.length ? 'rgba(99,102,241,.35)' : 'rgba(255,255,255,.07)'};transition:background .2s" title="Ver Colecta">
            <div style="display:flex;align-items:center;gap:8px">
              <div style="width:8px;height:8px;border-radius:50%;background:${colectaActivos.length ? '#818cf8' : 'rgba(255,255,255,.15)'}${colectaActivos.length ? ';box-shadow:0 0 6px #818cf8' : ''}"></div>
              <span style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${colectaActivos.length ? '#c7d2fe' : 'rgba(255,255,255,.3)'}">Colecta 12:00</span>
            </div>
            <span style="font-size:20px;font-weight:900;color:${colectaActivos.length ? '#fff' : 'rgba(255,255,255,.25)'};font-variant-numeric:tabular-nums">${colectaActivos.length}</span>
          </div>
          <div onclick="openCarrierPage('flex')" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:12px 18px;border-radius:12px;background:${flexActivos.length ? 'rgba(34,197,94,.12)' : 'rgba(255,255,255,.04)'};border:1px solid ${flexActivos.length ? 'rgba(34,197,94,.3)' : 'rgba(255,255,255,.07)'};transition:background .2s" title="Ver Flex">
            <div style="display:flex;align-items:center;gap:8px">
              <div style="width:8px;height:8px;border-radius:50%;background:${flexActivos.length ? '#4ade80' : 'rgba(255,255,255,.15)'}${flexActivos.length ? ';box-shadow:0 0 6px #4ade80' : ''}"></div>
              <span style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${flexActivos.length ? '#bbf7d0' : 'rgba(255,255,255,.3)'}">Flex 14:00</span>
            </div>
            <span style="font-size:20px;font-weight:900;color:${flexActivos.length ? '#fff' : 'rgba(255,255,255,.25)'};font-variant-numeric:tabular-nums">${flexActivos.length}</span>
          </div>
          <div onclick="openCarrierPage('tiendanube')" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:12px 18px;border-radius:12px;background:${tnActivos.length ? 'rgba(59,130,246,.12)' : 'rgba(255,255,255,.04)'};border:1px solid ${tnActivos.length ? 'rgba(59,130,246,.3)' : 'rgba(255,255,255,.07)'};transition:background .2s" title="Ver Tienda Nube">
            <div style="display:flex;align-items:center;gap:8px">
              <div style="width:8px;height:8px;border-radius:50%;background:${tnActivos.length ? '#60a5fa' : 'rgba(255,255,255,.15)'}${tnActivos.length ? ';box-shadow:0 0 6px #60a5fa' : ''}"></div>
              <span style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${tnActivos.length ? '#bfdbfe' : 'rgba(255,255,255,.3)'}">Tienda Nube</span>
            </div>
            <span style="font-size:20px;font-weight:900;color:${tnActivos.length ? '#fff' : 'rgba(255,255,255,.25)'};font-variant-numeric:tabular-nums">${tnActivos.length}</span>
          </div>
          <div onclick="openCarrierPage('distribuidor')" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:12px 18px;border-radius:12px;background:${distribActivos.length ? 'rgba(245,158,11,.15)' : 'rgba(255,255,255,.04)'};border:1px solid ${distribActivos.length ? 'rgba(245,158,11,.35)' : 'rgba(255,255,255,.07)'};transition:background .2s" title="Ver Distribuidores">
            <div style="display:flex;align-items:center;gap:8px">
              <div style="width:8px;height:8px;border-radius:50%;background:${distribActivos.length ? '#fbbf24' : 'rgba(255,255,255,.15)'}${distribActivos.length ? ';box-shadow:0 0 6px #fbbf24' : ''}"></div>
              <span style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${distribActivos.length ? '#fde68a' : 'rgba(255,255,255,.3)'}">Distribuidores</span>
            </div>
            <span style="font-size:20px;font-weight:900;color:${distribActivos.length ? '#fff' : 'rgba(255,255,255,.25)'};font-variant-numeric:tabular-nums">${distribActivos.length}</span>
          </div>
        </div>
      </div>
    </div>
    <!-- Fila 2: Estado de producción -->
    <div class="sg" style="margin-top:12px">
      <div class="sc" onclick="navigate('ventas')" style="cursor:pointer">
        <div class="sc-l">Pedidos activos</div>
        <div class="sc-v">${activeOrders.length}</div>
      </div>
      <div class="sc b" onclick="navigate('ventas')" style="cursor:pointer">
        <div class="sc-l">En producción</div>
        <div class="sc-v">${byStatus('en_produccion')}</div>
      </div>
      <div class="sc ${pendingProd > 0 ? 'r' : 'g'}" onclick="navigate('produccion')" style="cursor:pointer">
        <div class="sc-l">Pendiente prod.</div>
        <div class="sc-v">${pendingProd}</div>
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
    <div class="card" style="overflow:hidden">
      <button onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none';this.querySelector('.dash-rec-arr').style.transform=this.nextElementSibling.style.display==='none'?'rotate(0deg)':'rotate(180deg')"
        style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:none;border:none;cursor:pointer;font-family:inherit">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-muted)">PEDIDOS RECIENTES</span>
          <span style="font-size:11px;font-weight:700;padding:2px 8px;background:var(--paper-dim);border-radius:20px;color:var(--ink-muted)">${orders.length}</span>
        </div>
        <span class="dash-rec-arr" style="font-size:16px;color:var(--ink-muted);transition:transform .2s;display:inline-block">▾</span>
      </button>
      <div style="display:none;padding:0 20px 16px">
        ${orders.slice(0, 10).map(o => `
          <div style="display:flex;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)">
            <div class="onum">${esc(o.numero || o.id?.slice(0,8))}</div>
            <div style="flex:1;font-size:13px;color:var(--ink-soft)">${esc(o.cliente)}</div>
            ${statusB(o.estado, o.id)}
          </div>
        `).join('') || '<div style="color:var(--ink-muted);font-size:13px;padding:8px 0">Sin pedidos aún.</div>'}
      </div>
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
/* Estado del filtro de canal en la pantalla de Producción */
let _prodFilter = 'todos';
function setProdFilter(val) { _prodFilter = val; renderProduccion(); }

async function renderProduccion() {
  showLoading('produccion-body');
  const today = new Date().toISOString().split('T')[0];
  const CARRIERS = ['colecta','flex','tiendanube','distribuidor'];
  const CLABEL = { colecta:'Colecta 12hs', flex:'Flex 14hs', tiendanube:'Tienda Nube', distribuidor:'Distribuidores' };
  const CCOLOR = { colecta:'var(--blue)', flex:'var(--green)', tiendanube:'var(--blue)', distribuidor:'var(--amber)' };

  const [ordersRes, allLogsRes, recentLogsRes, catalogRes, closuresRes] = await Promise.all([
    sb.from('orders').select('id,sku,cantidad,productos,canal,subcanal').neq('canal','reporte').not('estado','in','("cancelado","entregado","despachado")'),
    sb.from('prod_logs').select('modelo,sku,variante,unidades,subcanal,created_at'),
    sb.from('prod_logs').select('id,modelo,sku,variante,unidades,subcanal,sector,usuario_nombre,created_at').order('created_at',{ascending:false}).limit(30),
    sb.from('product_catalog').select('sku,modelo,variante').eq('es_fabricado',true).eq('activo',true),
    sb.from('production_closures').select('carrier,fecha_cierre').order('created_at',{ascending:false})
  ]);

  const activeOrders  = ordersRes.data    || [];
  const allLogs       = allLogsRes.data   || [];
  const recentLogs    = recentLogsRes.data || [];
  const catalogItems  = catalogRes.data   || [];

  // Último cierre por carrier
  const lastClose = {};
  for (const c of (closuresRes.data || [])) {
    if (!lastClose[c.carrier]) lastClose[c.carrier] = c.fecha_cierre;
  }

  // Helpers catálogo
  const _nrm = s => String(s||'').toLowerCase()
    .replace(/[áàä]/g,'a').replace(/[éèë]/g,'e').replace(/[íìï]/g,'i').replace(/[óòö]/g,'o').replace(/[úùü]/g,'u')
    .replace(/[^a-z0-9]/g,' ').replace(/\s+/g,' ').trim();
  const _wIn = (w,t) => t.includes(w)||t.includes(w+'s')||(w.endsWith('s')&&t.includes(w.slice(0,-1)))||
    (w.endsWith('o')&&t.includes(w.slice(0,-1)+'a'))||(w.endsWith('a')&&t.includes(w.slice(0,-1)+'o'));
  const _catBySku = {};
  for (const c of catalogItems) _catBySku[c.sku.toLowerCase()] = c;
  const _matchC = (nombre, skuHint) => {
    if (skuHint) { const e = _catBySku[skuHint.toLowerCase()]; if (e) return e; }
    const n = _nrm(nombre); let best=null, bs=0;
    for (const c of catalogItems) {
      const ws = _nrm(c.modelo).split(' ').filter(w=>w.length>=4);
      if (!ws.length) continue;
      const sc = ws.filter(w=>_wIn(w,n)).length/ws.length;
      if (sc<0.6) continue;
      const vws = c.variante?_nrm(c.variante).split(' ').filter(w=>w.length>=3):[];
      const tot = vws.length?(sc+vws.filter(w=>_wIn(w,n)).length/vws.length)/2:sc;
      if (tot>bs){bs=tot;best=c;}
    }
    return best;
  };
  const ISBL = v=>(v||'').toLowerCase().includes('blanc');
  const ISNG = v=>(v||'').toLowerCase().includes('negr');

  // Pedidos por carrier
  const ordByC = {
    colecta:     activeOrders.filter(o=>o.canal==='mercadolibre'&&o.subcanal==='colecta'),
    flex:        activeOrders.filter(o=>o.canal==='mercadolibre'&&o.subcanal==='flex'),
    tiendanube:  activeOrders.filter(o=>o.canal==='tiendanube'),
    distribuidor:activeOrders.filter(o=>o.canal==='distribuidor')
  };

  // Logs por carrier (filtrados por último cierre)
  const logsByC = {};
  for (const c of CARRIERS) {
    const since = lastClose[c]||null;
    logsByC[c] = allLogs.filter(l=>l.subcanal===c&&(!since||l.created_at>=since));
  }

  // Construir filas
  const rows = [];
  for (const carrier of CARRIERS) {
    const mapa = {};
    const newE = (sku,label) => ({sku,modelo:label,carrier,pedido:0,blancos:0,negros:0,otros:0});
    for (const ord of ordByC[carrier]) {
      if (ord.sku&&ord.cantidad) {
        const e=_catBySku[ord.sku.toLowerCase()]; const key=e?e.sku:ord.sku;
        if(!mapa[key]) mapa[key]=newE(key, e?e.modelo:ord.sku);
        mapa[key].pedido+=parseInt(ord.cantidad||0);
      } else {
        for (const p of (ord.productos||[])) {
          const e=_matchC(p.nombre,p.sku); const key=e?e.sku:(p.nombre||'').trim();
          if(!key) continue;
          if(!mapa[key]) mapa[key]=newE(e?.sku||'', e?e.modelo:(p.nombre||key));
          mapa[key].pedido+=parseInt(p.cantidad||1);
        }
      }
    }
    for (const l of logsByC[carrier]) {
      const key=(l.sku||l.modelo||'').trim(); if(!key) continue;
      const t=mapa[key]||mapa[Object.keys(mapa).find(k=>k===l.modelo||k.startsWith(l.modelo+'||'))];
      if(!t) continue;
      const u=parseInt(l.unidades||0);
      if(ISBL(l.variante)) t.blancos+=u; else if(ISNG(l.variante)) t.negros+=u; else t.otros+=u;
    }
    for (const e of Object.values(mapa)) {
      if(e.pedido<=0) continue;
      e.faltante=Math.max(0,e.pedido-e.blancos-e.negros-e.otros);
      rows.push(e);
    }
  }

  // Filtrar y ordenar
  const fRows = _prodFilter==='todos' ? rows : rows.filter(r=>r.carrier===_prodFilter);
  fRows.sort((a,b)=>(a.faltante>0&&b.faltante===0)?-1:(a.faltante===0&&b.faltante>0)?1:b.faltante-a.faltante);

  // KPIs
  const totPedido  = fRows.reduce((s,r)=>s+r.pedido,0);
  const totBlancos = fRows.reduce((s,r)=>s+r.blancos,0);
  const totNegros  = fRows.reduce((s,r)=>s+r.negros,0);
  const totProd    = totBlancos+totNegros;
  const totFalt    = fRows.reduce((s,r)=>s+r.faltante,0);
  const todayUnits = recentLogs.filter(l=>l.created_at?.startsWith(today)).reduce((s,l)=>s+(l.unidades||0),0);
  const progPct    = totPedido>0?Math.min(100,Math.round((totProd/totPedido)*100)):0;

  const showCanal  = _prodFilter==='todos';
  const presetC    = _prodFilter==='todos'?'':_prodFilter;

  $('produccion-body').innerHTML = `
    <!-- Header sticky -->
    <div style="position:sticky;top:0;z-index:10;background:var(--paper);padding:12px 0 8px;margin-bottom:16px;border-bottom:1px solid var(--border)">
      <!-- Barra de progreso -->
      <div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <span style="font-size:10px;font-weight:700;color:var(--ink-muted);letter-spacing:.08em;text-transform:uppercase">Progreso del día</span>
          <span style="font-size:11px;font-weight:700;color:var(--ink-soft)">${todayUnits} uds. producidas hoy · ${progPct}%</span>
        </div>
        <div style="height:7px;background:var(--paper-dim);border-radius:4px;overflow:hidden">
          <div style="height:100%;width:${progPct}%;background:${progPct>=100?'var(--green)':'var(--blue)'};border-radius:4px;transition:width .5s ease"></div>
        </div>
      </div>
      <!-- Tabs de canal + botones -->
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <div style="display:flex;gap:4px;flex-wrap:wrap;flex:1">
          ${['todos',...CARRIERS].map(c=>{
            const lbl=c==='todos'?'Todos':CLABEL[c];
            const cnt=c==='todos'?rows.length:rows.filter(r=>r.carrier===c).length;
            const isOn=_prodFilter===c;
            const col=c==='todos'?'#0A0A0A':(CCOLOR[c]||'#0A0A0A');
            return `<button onclick="setProdFilter('${c}')" style="padding:6px 12px;border-radius:20px;border:1.5px solid ${isOn?col:'var(--border)'};background:${isOn?(c==='todos'?'#0A0A0A':col.replace(')',',0.12)').replace('var(','rgba(').replace('--blue','59,130,246').replace('--green','34,197,94').replace('--amber','245,158,11')):'transparent'};color:${isOn?(c==='todos'?'#fff':col):'var(--ink-muted)'};font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;transition:all .15s">${lbl}${cnt>0?` (${cnt})`:''}</button>`;
          }).join('')}
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn sm" onclick="openRegisterProd('${presetC}')">+ Registrar</button>
          <button class="btn-ghost sm" onclick="openProdCamScanner()" title="Escanear QR">📷 QR</button>
        </div>
      </div>
    </div>

    <!-- KPIs -->
    <div class="sg" style="margin-bottom:16px">
      <div class="sc ${totFalt>0?'r':'g'}"><div class="sc-l">Faltante</div><div class="sc-v">${totFalt}</div></div>
      <div class="sc"><div class="sc-l">⬜ Blancos</div><div class="sc-v">${totBlancos}</div></div>
      <div class="sc"><div class="sc-l">⬛ Negros</div><div class="sc-v">${totNegros}</div></div>
      <div class="sc b"><div class="sc-l">Total pedido</div><div class="sc-v">${totPedido}</div></div>
    </div>

    <!-- Tabla -->
    ${fRows.length===0 ? `
      <div style="text-align:center;padding:56px 20px;color:var(--ink-muted)">
        <div style="font-size:44px;opacity:.12;margin-bottom:12px">✓</div>
        <div style="font-size:14px;font-weight:700">Sin pendiente${_prodFilter!=='todos'?' en '+CLABEL[_prodFilter]:''}</div>
      </div>
    ` : `
    <div class="card" style="padding:20px;margin-bottom:12px">
      <div style="overflow-x:auto">
        <table class="dt">
          <thead><tr>
            <th style="font-family:monospace">SKU</th>
            <th>Modelo</th>
            ${showCanal?'<th>Canal</th>':''}
            <th style="text-align:center">Pedido</th>
            <th style="text-align:center">⬜ Blanco</th>
            <th style="text-align:center">⬛ Negro</th>
            <th style="text-align:center">Faltante</th>
          </tr></thead>
          <tbody>
            ${fRows.map(r=>{
              const done=r.faltante===0;
              const faltCell=done
                ?`<span style="color:var(--green);font-weight:700">✓ 0</span>`
                :`<span style="color:var(--red);font-weight:700;font-size:16px">${r.faltante}</span>`;
              const cBadge=`<span style="font-size:10px;padding:2px 8px;border-radius:10px;font-weight:700;color:${CCOLOR[r.carrier]};background:color-mix(in srgb,${CCOLOR[r.carrier]} 12%,transparent)">${CLABEL[r.carrier]||r.carrier}</span>`;
              return `<tr style="${done?'opacity:.5':''}">
                <td style="font-family:monospace;font-size:11px;font-weight:700;color:var(--blue)">${esc(r.sku||'—')}</td>
                <td style="font-weight:${done?400:600}">${esc(r.modelo)}</td>
                ${showCanal?`<td>${cBadge}</td>`:''}
                <td style="text-align:center;font-family:monospace;font-weight:700">${r.pedido}</td>
                <td style="text-align:center;font-family:monospace;font-weight:700;color:${r.blancos>0?'var(--green)':'var(--ink-muted)'}">${r.blancos}</td>
                <td style="text-align:center;font-family:monospace;font-weight:700;color:${r.negros>0?'var(--green)':'var(--ink-muted)'}">${r.negros}</td>
                <td style="text-align:center">${faltCell}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`}

    <!-- Registros recientes (colapsable) -->
    <div class="card" style="overflow:hidden">
      <button onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'"
        style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:none;border:none;cursor:pointer;font-family:inherit">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-muted)">REGISTROS RECIENTES</span>
          <span style="font-size:11px;font-weight:700;padding:2px 8px;background:var(--paper-dim);border-radius:20px;color:var(--ink-muted)">${recentLogs.length}</span>
        </div>
        <span style="font-size:16px;color:var(--ink-muted)">▾</span>
      </button>
      <div style="display:none;padding:0 20px 16px;overflow-x:auto">
        ${recentLogs.length ? `
        <table class="dt">
          <thead><tr><th>Fecha</th><th style="font-family:monospace">SKU</th><th>Modelo</th><th>Color</th><th>Canal</th><th style="text-align:center">Uds.</th><th>Operario</th><th></th></tr></thead>
          <tbody>
            ${recentLogs.map(l=>{
              const cBadge=`<span style="font-size:10px;padding:2px 8px;border-radius:10px;font-weight:700;color:${CCOLOR[l.subcanal]||'var(--ink-muted)'};background:color-mix(in srgb,${CCOLOR[l.subcanal]||'var(--border)'} 12%,transparent)">${CLABEL[l.subcanal]||l.subcanal||'—'}</span>`;
              return `<tr>
                <td style="font-size:11px;color:var(--ink-muted)">${fdDate(l.created_at)}</td>
                <td style="font-family:monospace;font-size:11px;font-weight:700;color:var(--blue)">${esc(l.sku||'—')}</td>
                <td style="font-weight:600">${esc(l.modelo||'—')}</td>
                <td style="font-size:12px">${esc(l.variante||'—')}</td>
                <td>${cBadge}</td>
                <td style="text-align:center;font-weight:700">${l.unidades||0}</td>
                <td style="font-size:12px;color:var(--ink-muted)">${esc(l.usuario_nombre||'—')}</td>
                <td>${ownerBtns('prod_log',l.id)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>` : '<div style="font-size:13px;color:var(--ink-muted);padding:8px 0">Sin registros aún.</div>'}
      </div>
    </div>
  `;
}

// Mapa de rol → sector para auto-seleccionar
const ROLE_SECTOR = { cnc:'CNC', melamina:'Melamina', pino:'Pino', embalaje:'Embalaje', carpinteria:'Carpinteria', encargado:'General', owner:'General', admin:'General' };

// Catálogo cacheado para el modal de producción
let _prodCatalog = [];

async function openRegisterProd(presetCarrier) {
  const today = new Date().toISOString().split('T')[0];
  const sel = $('mp-model-sel');
  if (sel) sel.value = '';
  const info = $('mp-selected-info');
  if (info) { info.style.display = 'none'; info.innerHTML = ''; }
  $('mp-qty').value = '';
  $('mp-date').value = today;
  const notasEl = $('mp-notes'); if (notasEl) notasEl.value = '';

  // Reset scan input
  const scanEl = $('mp-scan-input');
  if (scanEl) { scanEl.value = ''; scanEl.style.borderColor = ''; }

  // Reset/preset carrier
  document.querySelectorAll('input[name="prod-carrier"]').forEach(r => r.checked = false);
  if (presetCarrier) {
    const radioEl = document.querySelector(`input[name="prod-carrier"][value="${presetCarrier}"]`);
    if (radioEl) radioEl.checked = true;
  }
  updateProdCarrierStyles(presetCarrier || null);
  const errEl = $('prod-carrier-error');
  if (errEl) errEl.style.display = 'none';
  // Reset color
  document.querySelectorAll('input[name="prod-color"]').forEach(r => r.checked = false);
  onProdColorChange();
  const colorErrEl = $('prod-color-error');
  if (colorErrEl) colorErrEl.style.display = 'none';
  const prodBtn = document.querySelector('#m-prod .btn.g');
  if (prodBtn) unlockBtn(prodBtn, '✓ Registrar');

  await Promise.all([loadOrdersForProd(), loadProductCatalogForProd()]);
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

function onProdColorChange() {
  const val = document.querySelector('input[name="prod-color"]:checked')?.value;
  const lblB = $('prod-lbl-blanco'), lblN = $('prod-lbl-negro');
  if (lblB) {
    lblB.style.borderColor = val === 'Blanco' ? '#555' : 'var(--border)';
    lblB.style.background  = val === 'Blanco' ? 'color-mix(in srgb,#555 8%,transparent)' : '';
  }
  if (lblN) {
    lblN.style.borderColor = val === 'Negro' ? '#111' : 'var(--border)';
    lblN.style.background  = val === 'Negro' ? 'color-mix(in srgb,#111 8%,transparent)' : '';
  }
  const errEl = $('prod-color-error');
  if (errEl) errEl.style.display = 'none';
}

function updateProdCarrierStyles(val) {
  const map = {
    colecta:      { el: $('prod-lbl-colecta'),      color: 'var(--blue)'  },
    flex:         { el: $('prod-lbl-flex'),          color: 'var(--green)' },
    tiendanube:   { el: $('prod-lbl-tiendanube'),   color: 'var(--blue)'  },
    distribuidor: { el: $('prod-lbl-distribuidor'), color: 'var(--amber)' }
  };
  for (const [k, { el, color }] of Object.entries(map)) {
    if (!el) continue;
    el.style.borderColor = val === k ? color : 'var(--border)';
    el.style.background  = val === k ? `color-mix(in srgb, ${color} 8%, transparent)` : '';
  }
}

function onProdModelChange(sel) {
  const info = $('mp-selected-info');
  if (!sel.value) { info.style.display = 'none'; return; }
  const p = _prodCatalog.find(x => x.id === sel.value);
  if (p) {
    const colorBadge = p.variante
      ? `<span style="display:inline-block;margin-left:10px;padding:3px 10px;background:color-mix(in srgb,var(--blue) 10%,transparent);border:1px solid var(--blue);border-radius:20px;font-size:12px;font-weight:700;color:var(--blue)">${esc(p.variante)}</span>`
      : '';
    info.style.display = 'block';
    info.innerHTML = `
      <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px">
        <strong style="font-family:monospace;color:var(--blue);font-size:14px">${esc(p.sku)}</strong>
        <span style="color:var(--ink-soft);font-size:13px">${esc(p.modelo)}</span>
        ${colorBadge}
      </div>
      ${p.categoria ? `<div style="font-size:11px;color:var(--ink-muted);margin-top:2px">${esc(p.categoria)}</div>` : ''}
    `;
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
    // Fallback: unique models from prod_logs + recent orders
    const [logRes, ordRes] = await Promise.all([
      sb.from('prod_logs').select('modelo').order('modelo'),
      sb.from('orders').select('productos').neq('canal','reporte').not('estado','in','("cancelado","entregado","despachado")').limit(200)
    ]);
    const fromLogs = (logRes.data || []).map(l => l.modelo).filter(Boolean);
    const fromOrders = [];
    for (const o of (ordRes.data || [])) {
      for (const p of (o.productos || [])) { if (p.nombre) fromOrders.push(p.nombre); }
    }
    const unique = [...new Set([...fromLogs, ...fromOrders])].sort();
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
    showToast('Seleccioná el destino: Colecta, Flex o Tienda Nube', 'error');
    return;
  }

  // Color es obligatorio
  const colorSel = document.querySelector('input[name="prod-color"]:checked')?.value;
  if (!colorSel) {
    const errEl = $('prod-color-error');
    if (errEl) errEl.style.display = '';
    showToast('Seleccioná el color: Blanco o Negro', 'error');
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

  // El color seleccionado siempre sobreescribe la variante del catálogo
  variante = colorSel;  // "Blanco" o "Negro"

  const fecha = $('mp-date').value;
  const sector = ROLE_SECTOR[cu.role] || 'General';
  const notas = $('mp-notes')?.value.trim() || null;

  // Advertir si se registran más unidades que el faltante actual (sobreproducción)
  const filaActual = _currentCarrierFilas?.find(f => f.sku === sku || f.modelo === modelo);
  if (filaActual && unidades > filaActual.faltante && filaActual.faltante > 0) {
    showToast(`⚠ Estás registrando ${unidades} pero el faltante es ${filaActual.faltante}. Se guarda como excedente.`, 'info', 4000);
  }

  const btn = document.querySelector('#m-prod .btn.g');
  lockBtn(btn);

  const { error } = await sb.from('prod_logs').insert({
    modelo, variante, sku, etapa: 'general', unidades, fecha, sector, subcanal,
    notas, unidades_falla: 0,
    falla_descripcion: null,
    orden_id: null, usuario_id: cu.id, usuario_nombre: cu.name
  });

  if (error) { showToast('Error: ' + error.message, 'error'); unlockBtn(btn, '✓ Registrar'); return; }
  unlockBtn(btn, '✓ Registrar');
  const carrierLabel = subcanal === 'colecta' ? 'Colecta' : subcanal === 'flex' ? 'Flex' : subcanal === 'distribuidor' ? 'Distribuidores' : 'Tienda Nube';
  await logActivity('produccion_registrada', `Producción: ${sku || modelo}${variante ? ' (' + variante + ')' : ''} ×${unidades} — ${sector} — ${carrierLabel}`, orden_id);
  closeM('m-prod');
  showToast(`✓ ${unidades} ${esc(sku || modelo)} (${carrierLabel}) registradas`);
  // Refresh whichever view is currently active
  if (curPage === 'carrier') renderCarrierPage();
  else if (curPage === 'dashboard') renderDash();
  else renderProduccion();
}

/* ═══════════════════════════════════════════════════════════
   HISTÓRICO DE PRODUCCIÓN
   ═══════════════════════════════════════════════════════════ */
let _histState = { year: new Date().getFullYear(), month: new Date().getMonth(), selDay: null, filterCarrier: '', filterSku: '', dateFrom: '', dateTo: '' };

async function renderHistorico() {
  if (!['owner','admin'].includes(cu.role)) {
    $('historico-body').innerHTML = '<div style="padding:40px;text-align:center;color:var(--ink-muted)">Acceso restringido.</div>';
    return;
  }
  showLoading('historico-body');
  const s = _histState;

  // Rango del mes visible
  const firstDay = new Date(s.year, s.month, 1);
  const lastDay  = new Date(s.year, s.month + 1, 0);
  const fromISO  = firstDay.toISOString().split('T')[0];
  const toISO    = lastDay.toISOString().split('T')[0];

  // Traer prod_logs del mes + filtros adicionales si hay
  let q = sb.from('prod_logs')
    .select('id,modelo,sku,variante,unidades,subcanal,sector,usuario_nombre,fecha,created_at')
    .gte('fecha', s.dateFrom || fromISO)
    .lte('fecha', s.dateTo   || toISO)
    .order('fecha', { ascending: false });
  if (s.filterCarrier) q = q.eq('subcanal', s.filterCarrier);
  if (s.filterSku)     q = q.ilike('sku', `%${s.filterSku}%`);

  const { data: logs } = await q;
  const allLogs = logs || [];

  // Agrupar por fecha para el calendario
  const byDay = {};
  for (const l of allLogs) {
    const d = l.fecha || l.created_at?.split('T')[0];
    if (!d) continue;
    if (!byDay[d]) byDay[d] = 0;
    byDay[d] += l.unidades || 0;
  }

  // Construir calendario
  const DIAS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const startDow = firstDay.getDay(); // día de semana del 1ro
  const daysInMonth = lastDay.getDate();

  let calCells = '';
  for (let i = 0; i < startDow; i++) calCells += '<div></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${s.year}-${String(s.month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const uds = byDay[iso] || 0;
    const isToday = iso === new Date().toISOString().split('T')[0];
    const isSel   = iso === s.selDay;
    calCells += `<div onclick="_histSelectDay('${iso}')" style="
      padding:8px 4px;border-radius:8px;text-align:center;cursor:${uds?'pointer':'default'};
      background:${isSel?'#0A0A0A':uds?'color-mix(in srgb,var(--green) 15%,transparent)':'transparent'};
      border:2px solid ${isSel?'#0A0A0A':isToday?'var(--blue)':'transparent'};
      transition:background .15s">
      <div style="font-size:13px;font-weight:${uds?700:400};color:${isSel?'#fff':uds?'var(--green)':'var(--ink-muted)'}">${d}</div>
      ${uds?`<div style="font-size:9px;font-weight:700;color:${isSel?'#aaffaa':'var(--green)'}">${uds}u</div>`:''}
    </div>`;
  }

  // Detalle del día seleccionado
  let dayDetail = '';
  if (s.selDay) {
    const dayLogs = allLogs.filter(l => (l.fecha || l.created_at?.split('T')[0]) === s.selDay);
    if (dayLogs.length) {
      const carrierLabel = { colecta:'Colecta', flex:'Flex', tiendanube:'Tienda Nube', distribuidor:'Distribuidores' };
      dayDetail = `
        <div class="card" style="padding:20px;margin-top:20px">
          <div style="font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-muted);margin-bottom:14px">DETALLE — ${s.selDay}</div>
          <table class="dt">
            <thead><tr><th>SKU</th><th>Modelo</th><th>Canal</th><th>Color</th><th style="text-align:center">Uds.</th><th>Operario</th></tr></thead>
            <tbody>
              ${dayLogs.map(l => `<tr>
                <td style="font-family:monospace;font-size:11px;font-weight:700;color:var(--blue)">${esc(l.sku||'—')}</td>
                <td style="font-weight:600">${esc(l.modelo||'—')}</td>
                <td><span style="font-size:11px;padding:2px 8px;border-radius:12px;background:var(--paper-dim)">${esc(carrierLabel[l.subcanal]||l.subcanal||'—')}</span></td>
                <td style="font-size:12px">${esc(l.variante||'—')}</td>
                <td style="text-align:center;font-family:monospace;font-weight:700;color:var(--green)">${l.unidades}</td>
                <td style="font-size:12px;color:var(--ink-muted)">${esc(l.usuario_nombre||'—')}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    } else {
      dayDetail = `<div style="margin-top:16px;padding:20px;text-align:center;color:var(--ink-muted);font-size:13px">Sin registros para ${s.selDay}.</div>`;
    }
  }

  // Totales del período
  const totalUds     = allLogs.reduce((a,l) => a + (l.unidades||0), 0);
  const totalBlancos = allLogs.filter(l => (l.variante||'').toLowerCase().includes('blanc')).reduce((a,l)=>a+(l.unidades||0),0);
  const totalNegros  = allLogs.filter(l => (l.variante||'').toLowerCase().includes('negr')).reduce((a,l)=>a+(l.unidades||0),0);
  const diasActivos  = Object.keys(byDay).length;

  $('historico-body').innerHTML = `
    <!-- Filtros -->
    <div class="card" style="padding:16px 20px;margin-bottom:20px;display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap">
      <div class="fi" style="margin:0;min-width:120px">
        <label style="font-size:11px">Canal</label>
        <select class="fi-inp" style="height:36px;font-size:12px" onchange="_histFilter('filterCarrier',this.value)">
          <option value="">Todos</option>
          <option value="colecta" ${s.filterCarrier==='colecta'?'selected':''}>Colecta</option>
          <option value="flex" ${s.filterCarrier==='flex'?'selected':''}>Flex</option>
          <option value="tiendanube" ${s.filterCarrier==='tiendanube'?'selected':''}>Tienda Nube</option>
          <option value="distribuidor" ${s.filterCarrier==='distribuidor'?'selected':''}>Distribuidores</option>
        </select>
      </div>
      <div class="fi" style="margin:0;min-width:120px">
        <label style="font-size:11px">SKU / Modelo</label>
        <input class="fi-inp" style="height:36px;font-size:12px" type="text" placeholder="Buscar..." value="${esc(s.filterSku)}" oninput="_histFilter('filterSku',this.value)">
      </div>
      <div class="fi" style="margin:0">
        <label style="font-size:11px">Desde</label>
        <input class="fi-inp" style="height:36px;font-size:12px" type="date" value="${s.dateFrom}" onchange="_histFilter('dateFrom',this.value)">
      </div>
      <div class="fi" style="margin:0">
        <label style="font-size:11px">Hasta</label>
        <input class="fi-inp" style="height:36px;font-size:12px" type="date" value="${s.dateTo}" onchange="_histFilter('dateTo',this.value)">
      </div>
      <button class="btn-ghost sm" onclick="exportHistoricoXlsx()" style="height:36px">⬇ Exportar Excel</button>
    </div>

    <!-- KPIs del período -->
    <div class="sg" style="margin-bottom:20px">
      <div class="sc g"><div class="sc-l">Total producido</div><div class="sc-v">${totalUds}</div></div>
      <div class="sc"><div class="sc-l">⬜ Blancos</div><div class="sc-v">${totalBlancos}</div></div>
      <div class="sc"><div class="sc-l">⬛ Negros</div><div class="sc-v">${totalNegros}</div></div>
      <div class="sc b"><div class="sc-l">Días activos</div><div class="sc-v">${diasActivos}</div></div>
    </div>

    <!-- Calendario -->
    <div class="card" style="padding:20px;margin-bottom:0">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <button class="btn-ghost sm" onclick="_histNavMonth(-1)">← Anterior</button>
        <span style="font-weight:800;font-size:16px">${MESES[s.month]} ${s.year}</span>
        <button class="btn-ghost sm" onclick="_histNavMonth(1)">Siguiente →</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:8px">
        ${DIAS.map(d=>`<div style="text-align:center;font-size:10px;font-weight:700;color:var(--ink-muted);padding:4px">${d}</div>`).join('')}
        ${calCells}
      </div>
    </div>
    ${dayDetail}
  `;
}

function _histNavMonth(dir) {
  _histState.month += dir;
  if (_histState.month < 0)  { _histState.month = 11; _histState.year--; }
  if (_histState.month > 11) { _histState.month = 0;  _histState.year++; }
  _histState.selDay = null;
  renderHistorico();
}

function _histSelectDay(iso) {
  _histState.selDay = _histState.selDay === iso ? null : iso;
  renderHistorico();
}

function _histFilter(key, val) {
  _histState[key] = val;
  _histState.selDay = null;
  clearTimeout(_histState._debounce);
  _histState._debounce = setTimeout(renderHistorico, 350);
}

async function exportHistoricoXlsx() {
  if (typeof XLSX === 'undefined') { showToast('Librería Excel no cargada', 'error'); return; }
  const s = _histState;
  const today = new Date().toISOString().split('T')[0];
  let q = sb.from('prod_logs')
    .select('fecha,modelo,sku,variante,unidades,subcanal,sector,usuario_nombre,created_at')
    .gte('fecha', s.dateFrom || '2020-01-01')
    .lte('fecha', s.dateTo || today)
    .order('fecha', { ascending: false });
  if (s.filterCarrier) q = q.eq('subcanal', s.filterCarrier);
  if (s.filterSku)     q = q.ilike('sku', `%${s.filterSku}%`);
  const { data } = await q;
  if (!data?.length) { showToast('Sin datos para exportar', 'error'); return; }

  const rows = data.map(l => ({
    Fecha: l.fecha || l.created_at?.split('T')[0],
    SKU: l.sku || '',
    Modelo: l.modelo || '',
    Color: l.variante || '',
    Canal: l.subcanal || '',
    Sector: l.sector || '',
    Unidades: l.unidades || 0,
    Operario: l.usuario_nombre || ''
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Histórico');
  XLSX.writeFile(wb, `historico_produccion_${today}.xlsx`);
  showToast('✓ Excel exportado');
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
    <!-- QR Panel -->
    <div class="card" style="padding:20px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">
      <div>
        <div style="font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-muted);margin-bottom:4px">QRS DE PRODUCCIÓN</div>
        <div style="font-size:13px;color:var(--ink-soft)">Generá e imprimí los QRs para escanear en producción (uno por SKU)</div>
      </div>
      <button class="btn" onclick="openQrPanel()" style="white-space:nowrap">🖨 Ver e imprimir QRs</button>
    </div>

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

  const { error: rpcErr } = await sb.rpc('confirm_user_email', { user_id: data.user.id });
  if (rpcErr) { showToast('Usuario creado pero no se pudo confirmar el email: ' + rpcErr.message, 'error'); return; }
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
      if (curPage === 'ventas')    renderVentas();
      if (curPage === 'dashboard') renderDash();
      if (curPage === 'carrier')   renderCarrierPage();
      if (curPage === 'produccion') renderProduccion();
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
      if (curPage === 'carrier')   renderCarrierPage();
      if (curPage === 'historico') renderHistorico();
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
