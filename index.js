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
const { broadcastToAll, broadcastToSupport } = require('./broadcaster');
const { getAllStores, getSupportStores, addStore, deleteStore, toggleSupport, getStats, clearAllStores } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Секрет для JWT (генерується автоматично якщо не вказано)
const JWT_SECRET = process.env.JWT_SECRET || require('crypto').randomBytes(32).toString('hex');

// Пароль зберігається як хеш (генерується при першому запуску)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const PASSWORD_HASH = bcrypt.hashSync(ADMIN_PASSWORD, 10);

// Railway працює за проксі
app.set('trust proxy', 1);

// ============= SECURITY =============

// Rate limiter для логіну (максимум 5 спроб за 15 хвилин)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Занадто багато спроб входу. Спробуйте через 15 хвилин.' },
    standardHeaders: true
});

// Rate limiter для API (100 запитів за хвилину)
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: { error: 'Занадто багато запитів.' }
});

// Зберігання завантажених файлів
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + Buffer.from(file.originalname, 'latin1').toString('utf8'));
    }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api', apiLimiter);

// ============= AUTH (JWT) =============
app.post('/api/login', loginLimiter, (req, res) => {
    const { password } = req.body;

    if (bcrypt.compareSync(password, PASSWORD_HASH)) {
        const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ success: true, token });
    } else {
        res.status(401).json({ success: false, error: 'Невірний пароль' });
    }
});

function authMiddleware(req, res, next) {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: 'Не авторизовано' });

    try {
        jwt.verify(token, JWT_SECRET);
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Сесія закінчилась, увійдіть знову' });
    }
}

// ============= STORE MANAGEMENT =============

app.get('/api/stores', authMiddleware, async (req, res) => {
    try {
        const stores = await getAllStores();
        res.json(stores);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/stores', authMiddleware, async (req, res) => {
    const { name, token, region, address, manager_contact, is_support } = req.body;
    if (!name || !token) return res.status(400).json({ error: 'Назва і токен обов\'язкові' });

    try {
        const id = await addStore(name, token, region, address, manager_contact, is_support);
        const stats = await getStats();
        res.json({ success: true, id, stats });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/stores/:id', authMiddleware, async (req, res) => {
    try {
        await deleteStore(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/stores/:id/support', authMiddleware, async (req, res) => {
    try {
        await toggleSupport(req.params.id, req.body.is_support);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============= EXCEL IMPORT =============
app.post('/api/import-stores', authMiddleware, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Файл не завантажено' });

    try {
        const workbook = xlsx.readFile(req.file.path);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });

        if (rawData.length === 0) return res.status(400).json({ error: 'Файл порожній' });

        // Визначаємо чи є заголовки
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

        // Видаляємо тимчасовий файл
        fs.unlinkSync(req.file.path);

        const stats = await getStats();
        res.json({ success: true, message: `Імпортовано ${imported} магазин(ів)!`, stats });
    } catch (err) {
        res.status(500).json({ error: 'Помилка імпорту: ' + err.message });
    }
});

// ============= STATS =============
app.get('/api/stats', authMiddleware, async (req, res) => {
    try {
        res.json(await getStats());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============= BROADCAST =============
const activeBroadcasts = new Map();

app.post('/api/broadcast', authMiddleware, upload.single('image'), async (req, res) => {
    const { text, type } = req.body;
    const imageFile = req.file;

    if (!text && !imageFile) {
        return res.status(400).json({ error: 'Потрібен текст або зображення' });
    }

    const broadcastId = Date.now().toString();
    activeBroadcasts.set(broadcastId, { status: 'running', progress: 0, total: 0, success: 0, errors: 0 });

    res.json({ success: true, broadcastId, message: 'Розсилку запущено!' });

    const baseUrl = `https://${req.get('host')}`;
    const imageUrl = imageFile ? `${baseUrl}/uploads/${imageFile.filename}` : null;
    const webhookUrl = `${baseUrl}/viber/webhook`;

    const onProgress = (progress) => {
        activeBroadcasts.set(broadcastId, { ...activeBroadcasts.get(broadcastId), ...progress, status: 'running' });
    };

    try {
        let result;
        if (type === 'support') {
            result = await broadcastToSupport(text, imageUrl, onProgress, webhookUrl);
        } else {
            result = await broadcastToAll(text, imageUrl, onProgress, webhookUrl);
        }
        activeBroadcasts.set(broadcastId, { ...result, status: 'done' });
    } catch (err) {
        activeBroadcasts.set(broadcastId, { status: 'error', error: err.message });
    }
});

app.get('/api/broadcast/:id/status', authMiddleware, (req, res) => {
    const data = activeBroadcasts.get(req.params.id);
    if (!data) return res.status(404).json({ error: 'Розсилку не знайдено' });
    res.json(data);
});

// ============= VIBER WEBHOOK =============
app.post('/viber/webhook', (req, res) => {
    res.status(200).json({ status: 0 });
});

// ============= START =============
app.listen(PORT, () => {
    console.log(`🚀 Viber Admin Panel v3 is running on port ${PORT}`);
    console.log(`🔒 Security: JWT auth, rate limiting, bcrypt passwords`);
    console.log(`📊 Open http://localhost:${PORT}`);
});
