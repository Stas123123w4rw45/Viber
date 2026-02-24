let authToken = localStorage.getItem('viber_token') || '';
let pendingType = null;

// ============ AUTH ============
async function login() {
    const password = document.getElementById('passwordInput').value;
    const errorEl = document.getElementById('loginError');
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        const data = await res.json();
        if (data.success) {
            authToken = data.token;
            localStorage.setItem('viber_token', authToken);
            showDashboard();
        } else {
            errorEl.textContent = data.error || 'Невірний пароль';
        }
    } catch (err) {
        errorEl.textContent = 'Помилка з\'єднання';
    }
}

function logout() {
    authToken = '';
    localStorage.removeItem('viber_token');
    document.getElementById('loginScreen').classList.add('active');
    document.getElementById('dashboard').classList.remove('active');
}

function showDashboard() {
    document.getElementById('loginScreen').classList.remove('active');
    document.getElementById('dashboard').classList.add('active');
    loadStats();
}

// ============ API ============
async function api(url, options = {}) {
    const res = await fetch(url, {
        ...options,
        headers: { 'Authorization': authToken, ...options.headers }
    });
    if (res.status === 401) { logout(); throw new Error('Unauthorized'); }
    return res;
}

// ============ STATS ============
async function loadStats() {
    try {
        const res = await api('/api/stats');
        const data = await res.json();
        document.getElementById('statsAll').innerHTML = `📦 <b>${data.totalStores}</b>`;
        document.getElementById('statsSupport').innerHTML = `🔧 <b>${data.supportStores}</b>`;
    } catch (err) { console.error(err); }
}

// ============ TABS ============
function switchTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
    document.getElementById(`tab-${tab}`).classList.add('active');
    if (tab === 'stores') loadStoresList();
}

// ============ STORES LIST ============
async function loadStoresList() {
    const container = document.getElementById('storesList');
    try {
        const res = await api('/api/stores');
        const stores = await res.json();
        if (stores.length === 0) {
            container.innerHTML = '<p class="hint">База порожня. Імпортуйте Excel у вкладці "📋 База".</p>';
            return;
        }
        container.innerHTML = stores.map(s => `
            <div class="store-item">
                <div class="store-info">
                    <b>${s.name}</b>
                    <span class="store-token">${s.token.substring(0, 12)}...</span>
                    ${s.is_support ? '<span class="badge-support">підтримка</span>' : ''}
                </div>
                <div class="store-actions">
                    <button class="btn btn-small ${s.is_support ? 'btn-secondary' : 'btn-outline'}" onclick="toggleStoreSupport(${s.id}, ${!s.is_support})">
                        ${s.is_support ? '🔧' : '➕🔧'}
                    </button>
                    <button class="btn btn-small btn-danger" onclick="deleteStoreItem(${s.id})">✕</button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        container.innerHTML = '<p class="error-text">Помилка завантаження</p>';
    }
}

async function toggleStoreSupport(id, isSupport) {
    await api(`/api/stores/${id}/support`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_support: isSupport })
    });
    loadStoresList();
    loadStats();
}

async function deleteStoreItem(id) {
    if (!confirm('Видалити цей магазин з бази?')) return;
    await api(`/api/stores/${id}`, { method: 'DELETE' });
    loadStoresList();
    loadStats();
}

// ============ IMAGE ============
function previewImage(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('previewImg').src = e.target.result;
            document.getElementById('imagePreview').style.display = 'block';
            document.getElementById('uploadPlaceholder').style.display = 'none';
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function clearImage() {
    document.getElementById('broadcastImage').value = '';
    document.getElementById('imagePreview').style.display = 'none';
    document.getElementById('uploadPlaceholder').style.display = 'block';
}

// ============ EXCEL IMPORT ============
async function uploadExcel(type) {
    const fileInput = type === 'support' ? document.getElementById('supportFile') : document.getElementById('storesFile');
    if (!fileInput.files[0]) return;

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('type', type);

    try {
        const res = await api('/api/import-stores', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success) {
            alert(`✅ ${data.message}\n📦 Всього: ${data.stats.totalStores}\n🔧 Підтримка: ${data.stats.supportStores}`);
            loadStats();
        } else {
            alert('❌ ' + (data.error || 'Помилка'));
        }
    } catch (err) {
        alert('❌ Помилка завантаження');
    }
    fileInput.value = '';
}

// ============ BROADCAST ============
function startBroadcast(type) {
    const text = document.getElementById('broadcastText').value.trim();
    const image = document.getElementById('broadcastImage').files[0];
    if (!text && !image) return alert('Введіть текст або додайте фото!');

    pendingType = type;
    const label = type === 'all' ? 'у ВСІ магазини' : 'тільки ПІДТРИМКА';
    document.getElementById('confirmText').textContent = `Розіслати ${label}?`;
    let preview = text || '';
    if (image) preview += (preview ? '\n\n' : '') + '📷 ' + image.name;
    document.getElementById('modalPreview').textContent = preview;
    document.getElementById('confirmModal').style.display = 'flex';
}

function cancelBroadcast() {
    pendingType = null;
    document.getElementById('confirmModal').style.display = 'none';
}

async function confirmBroadcast() {
    document.getElementById('confirmModal').style.display = 'none';
    const text = document.getElementById('broadcastText').value.trim();
    const image = document.getElementById('broadcastImage').files[0];

    const formData = new FormData();
    if (text) formData.append('text', text);
    if (image) formData.append('image', image);
    formData.append('type', pendingType);

    const progressCard = document.getElementById('progressCard');
    progressCard.style.display = 'block';
    document.getElementById('progressTitle').textContent = '🚀 Розсилка...';
    updateProgress(0, 0, 0, 0);

    try {
        const res = await api('/api/broadcast', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success) pollBroadcastStatus(data.broadcastId);
        else { alert('❌ ' + data.error); progressCard.style.display = 'none'; }
    } catch (err) {
        alert('❌ Помилка'); progressCard.style.display = 'none';
    }
}

async function pollBroadcastStatus(id) {
    const interval = setInterval(async () => {
        try {
            const res = await api(`/api/broadcast/${id}/status`);
            const d = await res.json();
            updateProgress(d.progress || 0, d.total || 0, d.success || 0, d.errors || 0);
            if (d.status === 'done') {
                clearInterval(interval);
                document.getElementById('progressTitle').textContent = '✅ Розсилку завершено!';
                document.getElementById('broadcastText').value = '';
                clearImage();
            } else if (d.status === 'error') {
                clearInterval(interval);
                document.getElementById('progressTitle').textContent = '❌ ' + (d.error || 'Помилка');
            }
        } catch { clearInterval(interval); }
    }, 1000);
}

function updateProgress(progress, total, success, errors) {
    const pct = total > 0 ? Math.round((progress / total) * 100) : 0;
    document.getElementById('progressBar').style.width = pct + '%';
    document.getElementById('progressCount').textContent = `${progress} / ${total}`;
    document.getElementById('progressPercent').textContent = pct + '%';
    document.getElementById('successCount').textContent = success;
    document.getElementById('errorCount').textContent = errors;
}

// ============ INIT ============
(async function () {
    if (authToken) {
        try {
            const res = await fetch('/api/stats', { headers: { 'Authorization': authToken } });
            if (res.ok) showDashboard();
            else logout();
        } catch { logout(); }
    }
})();
