const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const EXCEL_PATH = path.join(__dirname, 'stores.xlsx');

/**
 * Читає Excel файл з токенами магазинів.
 * Припускає, що в таблиці є колонки: 'Назва', 'Токен' (або API ключ).
 */
function getStoresTokens() {
    if (!fs.existsSync(EXCEL_PATH)) {
        console.warn('Файл stores.xlsx не знайдено!');
        return [];
    }

    try {
        const workbook = xlsx.readFile(EXCEL_PATH);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        // Конвертація таблиці в масив об'єктів
        const data = xlsx.utils.sheet_to_json(sheet);

        const stores = [];
        data.forEach(row => {
            // Шукаємо ключі нечутливо до регістру
            const nameKey = Object.keys(row).find(key => key.toLowerCase().includes('назва')) || 'Назва';
            const tokenKey = Object.keys(row).find(key => key.toLowerCase().includes('токен') || key.toLowerCase().includes('апі') || key.toLowerCase().includes('api')) || 'Токен';

            const name = row[nameKey];
            const token = row[tokenKey];

            if (token && typeof token === 'string' && token.length > 20) {
                stores.push({ name, token: token.trim() });
            }
        });

        return stores;
    } catch (err) {
        console.error('Помилка при читанні Excel файлу:', err);
        return [];
    }
}

module.exports = { getStoresTokens };
