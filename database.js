const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const DB_PATH = path.join(dataDir, 'viber_bot.db');
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS stores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        region TEXT DEFAULT '',
        address TEXT DEFAULT '',
        manager_contact TEXT DEFAULT '',
        is_support INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT DEFAULT ''
    )`);

    // Дефолтні налаштування
    const defaults = {
        'google_form_url': 'https://docs.google.com/forms/d/e/EXAMPLE/viewform',
        'vacancies_url': 'https://docs.google.com/forms/d/e/VACANCIES/viewform',
        'menu_banner_text': '📋 Меню магазину',
        'complaint_button_text': '📝 Скарги / Пропозиції',
        'vacancies_button_text': '💼 Актуальні вакансії',
        'pizza_button_text': '🍕 Замовити піцу'
    };

    Object.entries(defaults).forEach(([key, value]) => {
        db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`, [key, value]);
    });

    console.log('📦 Database initialized');
});

// ============= STORES =============

const getAllStores = () => new Promise((resolve, reject) => {
    db.all('SELECT * FROM stores ORDER BY name', (err, rows) => err ? reject(err) : resolve(rows || []));
});

const getSupportStores = () => new Promise((resolve, reject) => {
    db.all('SELECT * FROM stores WHERE is_support = 1 ORDER BY name', (err, rows) => err ? reject(err) : resolve(rows || []));
});

const getStoreById = (id) => new Promise((resolve, reject) => {
    db.get('SELECT * FROM stores WHERE id = ?', [id], (err, row) => err ? reject(err) : resolve(row));
});

const addStore = (name, token, region, address, managerContact, isSupport) => new Promise((resolve, reject) => {
    db.run(
        `INSERT OR REPLACE INTO stores (name, token, region, address, manager_contact, is_support) VALUES (?, ?, ?, ?, ?, ?)`,
        [name, token.trim(), region || '', address || '', managerContact || '', isSupport ? 1 : 0],
        function (err) { err ? reject(err) : resolve(this.lastID); }
    );
});

const updateStore = (id, fields) => new Promise((resolve, reject) => {
    const sets = [];
    const vals = [];
    ['name', 'token', 'region', 'address', 'manager_contact', 'is_support'].forEach(f => {
        if (fields[f] !== undefined) {
            sets.push(`${f} = ?`);
            vals.push(f === 'is_support' ? (fields[f] ? 1 : 0) : fields[f]);
        }
    });
    if (sets.length === 0) return resolve(0);
    vals.push(id);
    db.run(`UPDATE stores SET ${sets.join(', ')} WHERE id = ?`, vals, function (err) {
        err ? reject(err) : resolve(this.changes);
    });
});

const deleteStore = (id) => new Promise((resolve, reject) => {
    db.run('DELETE FROM stores WHERE id = ?', [id], function (err) { err ? reject(err) : resolve(this.changes); });
});

const getStats = () => new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as total, SUM(CASE WHEN is_support=1 THEN 1 ELSE 0 END) as support FROM stores', (err, row) => {
        err ? reject(err) : resolve({ totalStores: row.total || 0, supportStores: row.support || 0 });
    });
});

const clearAllStores = () => new Promise((resolve, reject) => {
    db.run('DELETE FROM stores', function (err) { err ? reject(err) : resolve(this.changes); });
});

// ============= SETTINGS =============

const getSetting = (key) => new Promise((resolve, reject) => {
    db.get('SELECT value FROM settings WHERE key = ?', [key], (err, row) => err ? reject(err) : resolve(row ? row.value : ''));
});

const getAllSettings = () => new Promise((resolve, reject) => {
    db.all('SELECT * FROM settings', (err, rows) => {
        if (err) return reject(err);
        const obj = {};
        (rows || []).forEach(r => obj[r.key] = r.value);
        resolve(obj);
    });
});

const setSetting = (key, value) => new Promise((resolve, reject) => {
    db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value], function (err) {
        err ? reject(err) : resolve(this.changes);
    });
});

module.exports = {
    db, getAllStores, getSupportStores, getStoreById, addStore, updateStore,
    deleteStore, getStats, clearAllStores, getSetting, getAllSettings, setSetting
};
