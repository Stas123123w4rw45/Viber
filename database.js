const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'viber_bot.db');

// Створимо директорію 'data' якщо її немає
const fs = require('fs');
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new sqlite3.Database(DB_PATH);

// Ініціалізація таблиць
db.serialize(() => {
    // Таблиця магазинів
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

    console.log('📦 Database initialized');
});

// ============= CRUD =============

function getAllStores() {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM stores ORDER BY name', (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

function getSupportStores() {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM stores WHERE is_support = 1 ORDER BY name', (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

function addStore(name, token, region, address, managerContact, isSupport) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT OR REPLACE INTO stores (name, token, region, address, manager_contact, is_support) VALUES (?, ?, ?, ?, ?, ?)`,
            [name, token, region || '', address || '', managerContact || '', isSupport ? 1 : 0],
            function (err) {
                if (err) reject(err);
                else resolve(this.lastID);
            }
        );
    });
}

function deleteStore(id) {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM stores WHERE id = ?', [id], function (err) {
            if (err) reject(err);
            else resolve(this.changes);
        });
    });
}

function toggleSupport(id, isSupport) {
    return new Promise((resolve, reject) => {
        db.run('UPDATE stores SET is_support = ? WHERE id = ?', [isSupport ? 1 : 0, id], function (err) {
            if (err) reject(err);
            else resolve(this.changes);
        });
    });
}

function getStats() {
    return new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as total, SUM(CASE WHEN is_support = 1 THEN 1 ELSE 0 END) as support FROM stores', (err, row) => {
            if (err) reject(err);
            else resolve({ totalStores: row.total || 0, supportStores: row.support || 0 });
        });
    });
}

function clearAllStores() {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM stores', function (err) {
            if (err) reject(err);
            else resolve(this.changes);
        });
    });
}

module.exports = { db, getAllStores, getSupportStores, addStore, deleteStore, toggleSupport, getStats, clearAllStores };
