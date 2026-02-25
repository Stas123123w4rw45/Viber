require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const xlsx = require('xlsx');
const { broadcastToAll, broadcastToSupport, sendMenuToChannels } = require('./broadcaster');
const {
    getAllStores, getSupportStores, getStoreById, addStore, updateStore,
    deleteStore, getStats, clearAllStores, getAllSettings, setSetting
} = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || require('crypto').randomBytes(32).toString('hex');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const PASSWORD_HASH = bcrypt.hashSync(ADMIN_PASSWORD, 10);

app.set('trust proxy', 1);

// Rate limiters
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: { error: 'Забагато спроб. Зачекайте 15 хв.' } });
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 100, message: { error: 'Забагато запитів.' } });

// File upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const safeName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        cb(null, Date.now() + '-' + safeName);
    }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api', apiLimiter);

// ============= AUTH =============
app.post('/api/login', loginLimiter, (req, res) => {
    const { password } = req.body;
    if (bcrypt.compareSync(password, PASSWORD_HASH)) {
        const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ success: true, token });
    } else {
        res.status(401).json({ success: false, error: 'Невірний пароль' });
    }
});

function auth(req, res, next) {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: 'Не авторизовано' });
    try { jwt.verify(token, JWT_SECRET); next(); }
    catch { return res.status(401).json({ error: 'Сесія закінчилась' }); }
}

// ============= STORES CRUD =============
app.get('/api/stores', auth, async (req, res) => {
    try { res.json(await getAllStores()); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/stores', auth, async (req, res) => {
    const { name, token, region, address, manager_contact, is_support } = req.body;
    if (!name || !token) return res.status(400).json({ error: 'Назва і токен обов\'язкові' });
    try {
        const id = await addStore(name, token, region, address, manager_contact, is_support);
        res.json({ success: true, id, stats: await getStats() });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/stores/:id', auth, async (req, res) => {
    try {
        await updateStore(req.params.id, req.body);
        res.json({ success: true, stats: await getStats() });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/stores/:id', auth, async (req, res) => {
    try { await deleteStore(req.params.id); res.json({ success: true, stats: await getStats() }); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/stores', auth, async (req, res) => {
    try { await clearAllStores(); res.json({ success: true, stats: await getStats() }); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

// ============= EXCEL IMPORT =============
app.post('/api/import-stores', auth, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Файл не завантажено' });
    try {
        const workbook = xlsx.readFile(req.file.path);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false });
        if (rawData.length === 0) return res.status(400).json({ error: 'Файл порожній' });

        const firstRow = rawData[0] || [];
        const firstRowStr = firstRow.map(c => String(c || '').toLowerCase());
        const hasHeaders = firstRowStr.some(c =>
            c.includes('назва') || c.includes('name') ||
            c.includes('токен') || c.includes('token') ||
            c.includes('апі') || c.includes('api') ||
            c.includes('ключ') || c.includes('маркер')
        );
        const startRow = hasHeaders ? 1 : 0;
        const isSupport = req.body.type === 'support';
        let imported = 0;

        for (let i = startRow; i < rawData.length; i++) {
            const row = rawData[i];
            if (!row || row.length < 2) continue;
            const name = String(row[0] || 'Без назви').trim();
            const token = String(row[1] || '').trim();
            if (token.length > 20) {
                await addStore(name, token, '', '', '', isSupport);
                imported++;
            }
        }
        fs.unlinkSync(req.file.path);
        res.json({ success: true, message: `Імпортовано ${imported} магазин(ів)!`, stats: await getStats() });
    } catch (e) { res.status(500).json({ error: 'Помилка: ' + e.message }); }
});

// ============= STATS =============
app.get('/api/stats', auth, async (req, res) => {
    try { res.json(await getStats()); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

// ============= SETTINGS =============
app.get('/api/settings', auth, async (req, res) => {
    try { res.json(await getAllSettings()); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/settings', auth, async (req, res) => {
    try {
        for (const [key, value] of Object.entries(req.body)) {
            await setSetting(key, value);
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============= BROADCAST =============
const activeBroadcasts = new Map();

app.post('/api/broadcast', auth, upload.single('image'), async (req, res) => {
    const { text, type } = req.body;
    const imageFile = req.file;
    if (!text && !imageFile) return res.status(400).json({ error: 'Потрібен текст або зображення' });

    const broadcastId = Date.now().toString();
    activeBroadcasts.set(broadcastId, { status: 'running', progress: 0, total: 0, success: 0, errors: 0 });
    res.json({ success: true, broadcastId });

    const baseUrl = `https://${req.get('host')}`;
    const imageUrl = imageFile ? `${baseUrl}/uploads/${imageFile.filename}` : null;
    const webhookUrl = `${baseUrl}/viber/webhook`;
    const onProgress = (p) => activeBroadcasts.set(broadcastId, { ...activeBroadcasts.get(broadcastId), ...p, status: 'running' });

    try {
        const result = type === 'support'
            ? await broadcastToSupport(text, imageUrl, onProgress, webhookUrl)
            : await broadcastToAll(text, imageUrl, onProgress, webhookUrl);
        activeBroadcasts.set(broadcastId, { ...result, status: 'done' });
    } catch (e) {
        activeBroadcasts.set(broadcastId, { status: 'error', error: e.message });
    }
});

app.get('/api/broadcast/:id/status', auth, (req, res) => {
    const data = activeBroadcasts.get(req.params.id);
    if (!data) return res.status(404).json({ error: 'Не знайдено' });
    res.json(data);
});

// ============= ETERNAL MENU =============
app.post('/api/send-menu', auth, async (req, res) => {
    const { type } = req.body; // 'all' | 'support'
    const broadcastId = 'menu-' + Date.now();
    activeBroadcasts.set(broadcastId, { status: 'running', progress: 0, total: 0, success: 0, errors: 0 });
    res.json({ success: true, broadcastId });

    const baseUrl = `https://${req.get('host')}`;
    const webhookUrl = `${baseUrl}/viber/webhook`;
    const settings = await getAllSettings();
    const onProgress = (p) => activeBroadcasts.set(broadcastId, { ...activeBroadcasts.get(broadcastId), ...p, status: 'running' });

    try {
        const result = await sendMenuToChannels(type, settings, onProgress, webhookUrl);
        activeBroadcasts.set(broadcastId, { ...result, status: 'done' });
    } catch (e) {
        activeBroadcasts.set(broadcastId, { status: 'error', error: e.message });
    }
});

// ============= VIBER WEBHOOK =============
app.post('/viber/webhook', (req, res) => res.status(200).json({ status: 0 }));

// ============= START =============
app.listen(PORT, () => {
    console.log(`🚀 Viber Admin Panel v4 running on port ${PORT}`);
    console.log(`🔒 JWT + bcrypt + rate limiting`);
});
