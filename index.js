require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { broadcastToAll, broadcastToSupport } = require('./broadcaster');
const { loadStores, loadSupportStores, getStoreStats } = require('./excelParser');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Railway працює за проксі, тому потрібно довіряти заголовку X-Forwarded-Proto
app.set('trust proxy', 1);

// Зберігання завантажених файлів
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB max

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============= AUTH =============
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        res.json({ success: true, token: Buffer.from(ADMIN_PASSWORD).toString('base64') });
    } else {
        res.status(401).json({ success: false, error: 'Невірний пароль' });
    }
});

function authMiddleware(req, res, next) {
    const token = req.headers.authorization;
    if (!token || Buffer.from(token, 'base64').toString() !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Не авторизовано' });
    }
    next();
}

// ============= EXCEL UPLOAD =============
app.post('/api/upload-stores', authMiddleware, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Файл не завантажено' });

    const targetPath = path.join(__dirname, 'stores.xlsx');
    fs.copyFileSync(req.file.path, targetPath);
    fs.unlinkSync(req.file.path);

    const stats = getStoreStats();
    res.json({ success: true, message: 'Базу магазинів оновлено!', stats });
});

app.post('/api/upload-support', authMiddleware, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Файл не завантажено' });

    const targetPath = path.join(__dirname, 'support.xlsx');
    fs.copyFileSync(req.file.path, targetPath);
    fs.unlinkSync(req.file.path);

    const stats = getStoreStats();
    res.json({ success: true, message: 'Список підтримки оновлено!', stats });
});

// ============= STATS =============
app.get('/api/stats', authMiddleware, (req, res) => {
    res.json(getStoreStats());
});

// ============= BROADCAST =============

// Зберігаємо стан активних розсилок
const activeBroadcasts = new Map();

app.post('/api/broadcast', authMiddleware, upload.single('image'), async (req, res) => {
    const { text, type } = req.body; // type: 'all' | 'support'
    const imageFile = req.file;

    if (!text && !imageFile) {
        return res.status(400).json({ error: 'Потрібен текст або зображення' });
    }

    const broadcastId = Date.now().toString();
    activeBroadcasts.set(broadcastId, { status: 'running', progress: 0, total: 0, success: 0, errors: 0 });

    res.json({ success: true, broadcastId, message: 'Розсилку запущено!' });

    // Запуск розсилки у фоновому режимі
    const baseUrl = `${req.protocol}://${req.get('host')}`;
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

// ============= VIBER WEBHOOK (потрібен для set_webhook) =============
app.post('/viber/webhook', (req, res) => {
    res.status(200).json({ status: 0 });
});

// ============= START =============
app.listen(PORT, () => {
    console.log(`🚀 Viber Admin Panel is running on port ${PORT}`);
    console.log(`📊 Open http://localhost:${PORT} to access the dashboard`);
});
