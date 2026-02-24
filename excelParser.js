const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const STORES_PATH = path.join(__dirname, 'stores.xlsx');
const SUPPORT_PATH = path.join(__dirname, 'support.xlsx');

/**
 * Читає Excel файл і повертає масив об'єктів { name, token }
 * Підтримує файли як ІЗ заголовками, так і БЕЗ.
 */
function parseExcel(filePath) {
    if (!fs.existsSync(filePath)) return [];

    try {
        const workbook = xlsx.readFile(filePath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];

        // Читаємо як масив масивів (header: 1), щоб не залежати від заголовків
        const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });

        if (rawData.length === 0) return [];

        const stores = [];

        // Перевіряємо, чи перший рядок — це заголовки
        const firstRow = rawData[0] || [];
        const firstRowStr = firstRow.map(c => String(c || '').toLowerCase());
        const hasHeaders = firstRowStr.some(c =>
            c.includes('назва') || c.includes('name') ||
            c.includes('токен') || c.includes('token') ||
            c.includes('апі') || c.includes('api') ||
            c.includes('ключ') || c.includes('маркер')
        );

        let nameCol = 0;
        let tokenCol = 1;
        const startRow = hasHeaders ? 1 : 0;

        if (hasHeaders) {
            // Шукаємо індекси колонок за назвами заголовків
            const nc = firstRowStr.findIndex(h => h.includes('назва') || h.includes('name'));
            const tc = firstRowStr.findIndex(h =>
                h.includes('токен') || h.includes('token') ||
                h.includes('апі') || h.includes('api') ||
                h.includes('ключ') || h.includes('key') || h.includes('маркер')
            );
            if (nc >= 0) nameCol = nc;
            if (tc >= 0) tokenCol = tc;
        }

        // Без заголовків: колонка A (0) = назва, колонка B (1) = токен
        for (let i = startRow; i < rawData.length; i++) {
            const row = rawData[i];
            if (!row || row.length < 2) continue;
            const name = String(row[nameCol] || 'Без назви').trim();
            const token = String(row[tokenCol] || '').trim();
            if (token.length > 20) {
                stores.push({ name, token });
            }
        }

        console.log(`📊 Завантажено ${stores.length} магазин(ів) з ${path.basename(filePath)}`);
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
    return parseExcel(SUPPORT_PATH);
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
