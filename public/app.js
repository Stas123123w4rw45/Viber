// ============ STATE ============
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
        errorEl.textContent = 'Помилка з\'єднання з сервером';
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

// ============ STATS ============
async function loadStats() {
    try {
        const res = await fetch('/api/stats', { headers: { 'Authorization': authToken } });
        if (res.status === 401) return logout();
        const data = await res.json();
        document.getElementById('statsAll').innerHTML = `📦 Магазинів: <b>${data.totalStores}</b>`;
        document.getElementById('statsSupport').innerHTML = `🔧 Підтримка: <b>${data.supportStores}</b>`;
    } catch (err) { console.error(err); }
}

// ============ TABS ============
function switchTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
    document.getElementById(`tab-${tab}`).classList.add('active');
}

// ============ IMAGE PREVIEW ============
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

// ============ EXCEL UPLOAD ============
async function uploadExcel(type) {
    const fileInput = type === 'stores' ? document.getElementById('storesFile') : document.getElementById('supportFile');
    if (!fileInput.files[0]) return;

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    const endpoint = type === 'stores' ? '/api/upload-stores' : '/api/upload-support';

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Authorization': authToken },
            body: formData
        });

        if (res.status === 401) return logout();
        const data = await res.json();

        if (data.success) {
            alert(`✅ ${data.message}\n📦 Всього магазинів: ${data.stats.totalStores}\n🔧 Підтримка: ${data.stats.supportStores}`);
            loadStats();
        } else {
            alert('❌ ' + (data.error || 'Щось пішло не так'));
        }
    } catch (err) {
        alert('❌ Помилка завантаження файлу');
    }

    fileInput.value = '';
}

// ============ BROADCAST ============
function startBroadcast(type) {
    const text = document.getElementById('broadcastText').value.trim();
    const image = document.getElementById('broadcastImage').files[0];

    if (!text && !image) {
        alert('Введіть текст або додайте зображення!');
        return;
    }

    pendingType = type;

    // Заповнюємо модалку
    const typeLabel = type === 'all' ? 'у ВСІ магазини' : 'тільки магазинам НА ПІДТРИМЦІ';
    document.getElementById('confirmText').textContent = `Ви дійсно хочете розіслати цей пост ${typeLabel}?`;

    let preview = '';
    if (text) preview += text;
    if (image) preview += (preview ? '\n\n' : '') + `📷 Зображення: ${image.name}`;
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

    // Показуємо прогрес
    const progressCard = document.getElementById('progressCard');
    progressCard.style.display = 'block';
    document.getElementById('progressTitle').textContent = '🚀 Розсилка запущена...';
    updateProgress(0, 0, 0, 0);

    try {
        const res = await fetch('/api/broadcast', {
            method: 'POST',
            headers: { 'Authorization': authToken },
            body: formData
        });

        if (res.status === 401) return logout();
        const data = await res.json();

        if (data.success) {
            // Опитуємо стан розсилки
            pollBroadcastStatus(data.broadcastId);
        } else {
            alert('❌ ' + (data.error || 'Помилка запуску'));
            progressCard.style.display = 'none';
        }
    } catch (err) {
        alert('❌ Помилка з\'єднання з сервером');
        progressCard.style.display = 'none';
    }
}

async function pollBroadcastStatus(broadcastId) {
    const interval = setInterval(async () => {
        try {
            const res = await fetch(`/api/broadcast/${broadcastId}/status`, {
                headers: { 'Authorization': authToken }
            });
            const data = await res.json();

            updateProgress(data.progress || 0, data.total || 0, data.success || 0, data.errors || 0);

            if (data.status === 'done') {
                clearInterval(interval);
                document.getElementById('progressTitle').textContent = '✅ Розсилку завершено!';
                // Очищуємо форму
                document.getElementById('broadcastText').value = '';
                clearImage();
            } else if (data.status === 'error') {
                clearInterval(interval);
                document.getElementById('progressTitle').textContent = '❌ Помилка: ' + (data.error || 'Невідома');
            }
        } catch (err) {
            clearInterval(interval);
        }
    }, 1000);
}

function updateProgress(progress, total, success, errors) {
    const percent = total > 0 ? Math.round((progress / total) * 100) : 0;
    document.getElementById('progressBar').style.width = percent + '%';
    document.getElementById('progressCount').textContent = `${progress} / ${total}`;
    document.getElementById('progressPercent').textContent = percent + '%';
    document.getElementById('successCount').textContent = success;
    document.getElementById('errorCount').textContent = errors;
}

// ============ INIT ============
(function init() {
    if (authToken) {
        // Перевіряємо валідність токена
        fetch('/api/stats', { headers: { 'Authorization': authToken } })
            .then(res => {
                if (res.ok) showDashboard();
                else logout();
            })
            .catch(() => logout());
    }
})();
