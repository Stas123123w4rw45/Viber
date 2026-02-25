let authToken = localStorage.getItem('viber_token') || '';
let pendingType = null;
let allStoresCache = [];

// ============ API HELPER ============
async function api(url, opts = {}) {
    const res = await fetch(url, { ...opts, headers: { 'Authorization': authToken, ...(opts.headers || {}) } });
    if (res.status === 401) { logout(); throw new Error('Unauthorized'); }
    return res;
}
async function apiJson(url, method = 'GET', body = null) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    return (await api(url, opts)).json();
}

// ============ AUTH ============
async function login() {
    const pw = document.getElementById('passwordInput').value;
    const err = document.getElementById('loginError');
    try {
        const d = await (await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) })).json();
        if (d.success) { authToken = d.token; localStorage.setItem('viber_token', authToken); showDashboard(); }
        else err.textContent = d.error || 'Невірний пароль';
    } catch { err.textContent = 'Помилка з\'єднання'; }
}
function logout() { authToken = ''; localStorage.removeItem('viber_token'); document.getElementById('loginScreen').classList.add('active'); document.getElementById('dashboard').classList.remove('active'); }
function showDashboard() { document.getElementById('loginScreen').classList.remove('active'); document.getElementById('dashboard').classList.add('active'); loadStats(); loadSettings(); }

// ============ STATS ============
async function loadStats() {
    try {
        const d = await apiJson('/api/stats');
        document.getElementById('statsAll').innerHTML = `📦 <b>${d.totalStores}</b>`;
        document.getElementById('statsSupport').innerHTML = `🔧 <b>${d.supportStores}</b>`;
    } catch { }
}

// ============ TABS ============
function switchTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
    document.getElementById(`tab-${tab}`).classList.add('active');
    if (tab === 'stores') loadStoresList();
    if (tab === 'settings') loadSettings();
}

// ============ STORES ============
async function loadStoresList() {
    const container = document.getElementById('storesList');
    try {
        allStoresCache = await apiJson('/api/stores');
        renderStores(allStoresCache);
    } catch { container.innerHTML = '<p class="error-text">Помилка</p>'; }
}

function renderStores(stores) {
    const container = document.getElementById('storesList');
    if (stores.length === 0) { container.innerHTML = '<p class="hint">База порожня. Натисніть "+ Додати" або "📊 Імпорт".</p>'; return; }
    container.innerHTML = stores.map(s => `
        <div class="store-item" data-id="${s.id}">
            <div class="store-info">
                <div class="store-name">${esc(s.name)} ${s.is_support ? '<span class="badge-support">підтримка</span>' : ''}</div>
                <div class="store-meta">
                    <span>🔑 ${s.token.substring(0, 14)}...</span>
                    ${s.region ? `<span>📍 ${esc(s.region)}</span>` : ''}
                    ${s.address ? `<span>📌 ${esc(s.address)}</span>` : ''}
                </div>
            </div>
            <div class="store-actions">
                <button class="btn btn-small btn-outline" onclick="editStore(${s.id})">✏️</button>
                <button class="btn btn-small btn-danger" onclick="delStore(${s.id})">✕</button>
            </div>
        </div>
    `).join('');
}

function filterStores() {
    const q = document.getElementById('storeSearch').value.toLowerCase();
    const filtered = allStoresCache.filter(s => s.name.toLowerCase().includes(q) || (s.region || '').toLowerCase().includes(q));
    renderStores(filtered);
}

function esc(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

// ============ STORE MODAL ============
function showAddStoreModal() {
    document.getElementById('storeModalTitle').textContent = 'Додати магазин';
    document.getElementById('editStoreId').value = '';
    ['editStoreName', 'editStoreToken', 'editStoreRegion', 'editStoreAddress', 'editStoreManager'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('editStoreSupport').checked = false;
    document.getElementById('storeModal').style.display = 'flex';
}

function editStore(id) {
    const s = allStoresCache.find(x => x.id === id);
    if (!s) return;
    document.getElementById('storeModalTitle').textContent = 'Редагувати магазин';
    document.getElementById('editStoreId').value = id;
    document.getElementById('editStoreName').value = s.name;
    document.getElementById('editStoreToken').value = s.token;
    document.getElementById('editStoreRegion').value = s.region || '';
    document.getElementById('editStoreAddress').value = s.address || '';
    document.getElementById('editStoreManager').value = s.manager_contact || '';
    document.getElementById('editStoreSupport').checked = !!s.is_support;
    document.getElementById('storeModal').style.display = 'flex';
}

function closeStoreModal() { document.getElementById('storeModal').style.display = 'none'; }

async function saveStore() {
    const id = document.getElementById('editStoreId').value;
    const data = {
        name: document.getElementById('editStoreName').value.trim(),
        token: document.getElementById('editStoreToken').value.trim(),
        region: document.getElementById('editStoreRegion').value.trim(),
        address: document.getElementById('editStoreAddress').value.trim(),
        manager_contact: document.getElementById('editStoreManager').value.trim(),
        is_support: document.getElementById('editStoreSupport').checked
    };
    if (!data.name || !data.token) return alert('Назва і токен обов\'язкові!');
    try {
        if (id) await apiJson(`/api/stores/${id}`, 'PUT', data);
        else await apiJson('/api/stores', 'POST', data);
        closeStoreModal(); loadStoresList(); loadStats();
    } catch (e) { alert('Помилка: ' + e.message); }
}

async function delStore(id) {
    if (!confirm('Видалити магазин з бази?')) return;
    await apiJson(`/api/stores/${id}`, 'DELETE');
    loadStoresList(); loadStats();
}

// ============ IMPORT ============
function showImportModal() { document.getElementById('importModal').style.display = 'flex'; }
function closeImportModal() { document.getElementById('importModal').style.display = 'none'; }

async function doImport() {
    const fileInput = document.getElementById('importFile');
    if (!fileInput.files[0]) return alert('Оберіть файл!');
    const fd = new FormData();
    fd.append('file', fileInput.files[0]);
    fd.append('type', document.getElementById('importAsSupport').checked ? 'support' : 'all');
    try {
        const d = await (await api('/api/import-stores', { method: 'POST', body: fd })).json();
        if (d.success) { alert(`✅ ${d.message}`); closeImportModal(); loadStoresList(); loadStats(); }
        else alert('❌ ' + d.error);
    } catch { alert('❌ Помилка'); }
    fileInput.value = '';
}

// ============ IMAGE ============
function previewImage(input) {
    if (input.files?.[0]) {
        const r = new FileReader();
        r.onload = e => { document.getElementById('previewImg').src = e.target.result; document.getElementById('imagePreview').style.display = 'block'; document.getElementById('uploadPlaceholder').style.display = 'none'; };
        r.readAsDataURL(input.files[0]);
    }
}
function clearImage() { document.getElementById('broadcastImage').value = ''; document.getElementById('imagePreview').style.display = 'none'; document.getElementById('uploadPlaceholder').style.display = 'block'; }

// ============ BROADCAST ============
function startBroadcast(type) {
    const text = document.getElementById('broadcastText').value.trim();
    const img = document.getElementById('broadcastImage').files[0];
    if (!text && !img) return alert('Введіть текст або додайте фото!');
    pendingType = type;
    document.getElementById('confirmText').textContent = `Розіслати ${type === 'all' ? 'у ВСІ магазини' : 'тільки ПІДТРИМКА'}?`;
    let preview = text || '';
    if (img) preview += (preview ? '\n\n' : '') + '📷 ' + img.name;
    document.getElementById('modalPreview').textContent = preview;
    document.getElementById('confirmModal').style.display = 'flex';
}
function cancelBroadcast() { pendingType = null; document.getElementById('confirmModal').style.display = 'none'; }

async function confirmBroadcast() {
    document.getElementById('confirmModal').style.display = 'none';
    const text = document.getElementById('broadcastText').value.trim();
    const img = document.getElementById('broadcastImage').files[0];
    const fd = new FormData();
    if (text) fd.append('text', text);
    if (img) fd.append('image', img);
    fd.append('type', pendingType);

    showProgress('progressCard', 'progressTitle', '🚀 Розсилка...');
    try {
        const d = await (await api('/api/broadcast', { method: 'POST', body: fd })).json();
        if (d.success) pollStatus(d.broadcastId, 'progressCard', 'progressTitle', 'progressBar', 'progressCount', 'progressPercent', 'successCount', 'errorCount', () => { document.getElementById('broadcastText').value = ''; clearImage(); });
        else { alert('❌ ' + d.error); document.getElementById('progressCard').style.display = 'none'; }
    } catch { alert('❌ Помилка'); document.getElementById('progressCard').style.display = 'none'; }
}

// ============ MENU ============
async function sendMenu(type) {
    if (!confirm(`Надіслати меню ${type === 'all' ? 'у ВСІ' : 'тільки ПІДТРИМКА'}?`)) return;
    showProgress('menuProgressCard', 'menuProgressTitle', '🚀 Надсилання меню...');
    try {
        const d = await apiJson('/api/send-menu', 'POST', { type });
        if (d.success) pollStatus(d.broadcastId, 'menuProgressCard', 'menuProgressTitle', 'menuProgressBar', 'menuProgressCount', 'menuProgressPercent', 'menuSuccessCount', 'menuErrorCount');
        else { alert('❌ ' + d.error); document.getElementById('menuProgressCard').style.display = 'none'; }
    } catch { alert('❌ Помилка'); document.getElementById('menuProgressCard').style.display = 'none'; }
}

// ============ PROGRESS HELPERS ============
function showProgress(cardId, titleId, title) {
    document.getElementById(cardId).style.display = 'block';
    document.getElementById(titleId).textContent = title;
}
function pollStatus(broadcastId, cardId, titleId, barId, countId, pctId, successId, errorId, onDone) {
    const iv = setInterval(async () => {
        try {
            const d = await apiJson(`/api/broadcast/${broadcastId}/status`);
            const pct = d.total > 0 ? Math.round((d.progress / d.total) * 100) : 0;
            document.getElementById(barId).style.width = pct + '%';
            document.getElementById(countId).textContent = `${d.progress || 0} / ${d.total || 0}`;
            document.getElementById(pctId).textContent = pct + '%';
            document.getElementById(successId).textContent = d.success || 0;
            document.getElementById(errorId).textContent = d.errors || 0;
            if (d.status === 'done') { clearInterval(iv); document.getElementById(titleId).textContent = '✅ Завершено!'; if (onDone) onDone(); }
            else if (d.status === 'error') { clearInterval(iv); document.getElementById(titleId).textContent = '❌ ' + (d.error || 'Помилка'); }
        } catch { clearInterval(iv); }
    }, 1000);
}

// ============ SETTINGS ============
const SETTINGS_KEYS = ['menu_banner_text', 'complaint_button_text', 'google_form_url', 'vacancies_button_text', 'vacancies_url', 'pizza_button_text', 'pizza_url', 'phone_number'];

async function loadSettings() {
    try {
        const s = await apiJson('/api/settings');
        SETTINGS_KEYS.forEach(k => {
            const el = document.getElementById('set_' + k);
            if (el) el.value = s[k] || '';
        });
    } catch { }
}

async function saveSettings() {
    const data = {};
    SETTINGS_KEYS.forEach(k => {
        const el = document.getElementById('set_' + k);
        if (el) data[k] = el.value;
    });
    try {
        await apiJson('/api/settings', 'PUT', data);
        alert('✅ Налаштування збережено!');
    } catch { alert('❌ Помилка збереження'); }
}

// ============ INIT ============
(async () => {
    if (authToken) {
        try { if ((await fetch('/api/stats', { headers: { 'Authorization': authToken } })).ok) showDashboard(); else logout(); }
        catch { logout(); }
    }
})();
