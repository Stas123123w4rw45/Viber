const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const STORES_PATH = path.join(__dirname, 'stores.xlsx');
const SUPPORT_PATH = path.join(__dirname, 'support.xlsx');

/**
 * Читає Excel файл і повертає масив об'єктів { name, token }
 */
function parseExcel(filePath) {
    if (!fs.existsSync(filePath)) return [];

    try {
        const workbook = xlsx.readFile(filePath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = xlsx.utils.sheet_to_json(sheet);

        const stores = [];
        data.forEach(row => {
            const keys = Object.keys(row);
            const nameKey = keys.find(k => k.toLowerCase().includes('назва') || k.toLowerCase().includes('name')) || keys[0];
            const tokenKey = keys.find(k =>
                k.toLowerCase().includes('токен') ||
                k.toLowerCase().includes('token') ||
                k.toLowerCase().includes('апі') ||
                k.toLowerCase().includes('api') ||
                k.toLowerCase().includes('ключ') ||
                k.toLowerCase().includes('key') ||
                k.toLowerCase().includes('маркер')
            ) || keys[1];

            const name = row[nameKey] || 'Без назви';
            const token = row[tokenKey];

            if (token && typeof token === 'string' && token.trim().length > 20) {
                stores.push({ name: String(name).trim(), token: String(token).trim() });
            }
        });

        return stores;
    } catch (err) {
        console.error('Помилка при читанні Excel:', err.message);
        return [];
    }
}

function loadStores() {
    return parseExcel(STORES_PATH);
}

function loadSupportStores() {
    const supportList = parseExcel(SUPPORT_PATH);
    if (supportList.length > 0) return supportList;

    // Якщо окремого файлу підтримки немає, шукаємо в основному файлі
    if (!fs.existsSync(STORES_PATH)) return [];

    try {
        const workbook = xlsx.readFile(STORES_PATH);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = xlsx.utils.sheet_to_json(sheet);

        const stores = [];
        data.forEach(row => {
            const keys = Object.keys(row);
            const supportKey = keys.find(k =>
                k.toLowerCase().includes('підтримка') ||
                k.toLowerCase().includes('support')
            );

            if (supportKey && (row[supportKey] === true || row[supportKey] === 1 ||
                String(row[supportKey]).toLowerCase() === 'так' ||
                String(row[supportKey]).toLowerCase() === 'yes' ||
                String(row[supportKey]).toLowerCase() === '+')) {

                const nameKey = keys.find(k => k.toLowerCase().includes('назва') || k.toLowerCase().includes('name')) || keys[0];
                const tokenKey = keys.find(k =>
                    k.toLowerCase().includes('токен') || k.toLowerCase().includes('token') ||
                    k.toLowerCase().includes('апі') || k.toLowerCase().includes('api') ||
                    k.toLowerCase().includes('ключ') || k.toLowerCase().includes('маркер')
                ) || keys[1];

                const token = row[tokenKey];
                if (token && String(token).trim().length > 20) {
                    stores.push({ name: String(row[nameKey] || 'Без назви').trim(), token: String(token).trim() });
                }
            }
        });

        return stores;
    } catch (err) {
        return [];
    }
}

function getStoreStats() {
    const all = loadStores();
    const support = loadSupportStores();
    return {
        totalStores: all.length,
        supportStores: support.length,
        storesFileExists: fs.existsSync(STORES_PATH),
        supportFileExists: fs.existsSync(SUPPORT_PATH)
    };
}

module.exports = { loadStores, loadSupportStores, getStoreStats };
