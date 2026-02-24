const axios = require('axios');
const { loadStores, loadSupportStores } = require('./excelParser');

const VIBER_POST_URL = "https://chatapi.viber.com/pa/post";

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Відправляє повідомлення в один канал через Viber Channel Post API
 */
async function postToChannel(token, text, imageUrl) {
    const message = {};

    if (imageUrl && text) {
        // Картинка з текстом
        message.type = 'picture';
        message.text = text;
        message.media = imageUrl;
    } else if (imageUrl) {
        // Тільки картинка
        message.type = 'picture';
        message.text = '';
        message.media = imageUrl;
    } else {
        // Тільки текст
        message.type = 'text';
        message.text = text;
    }

    message.sender = { name: "Адмін" };

    const response = await axios.post(VIBER_POST_URL, message, {
        headers: {
            'X-Viber-Auth-Token': token,
            'Content-Type': 'application/json'
        }
    });

    return response.data;
}

/**
 * Розсилка по всіх магазинах
 */
async function broadcastToAll(text, imageUrl, onProgress) {
    const stores = loadStores();
    return await doBroadcast(stores, text, imageUrl, onProgress);
}

/**
 * Розсилка тільки по магазинах на підтримці
 */
async function broadcastToSupport(text, imageUrl, onProgress) {
    const stores = loadSupportStores();
    return await doBroadcast(stores, text, imageUrl, onProgress);
}

/**
 * Виконання розсилки з rate-limiting
 */
async function doBroadcast(stores, text, imageUrl, onProgress) {
    if (stores.length === 0) {
        return { success: 0, errors: 0, total: 0, details: [] };
    }

    let successCount = 0;
    let errorCount = 0;
    const details = [];
    const total = stores.length;

    console.log(`🚀 Розсилка на ${total} канал(ів)...`);

    if (onProgress) onProgress({ total, progress: 0, success: 0, errors: 0 });

    for (let i = 0; i < stores.length; i++) {
        const store = stores[i];
        try {
            const result = await postToChannel(store.token, text, imageUrl);

            if (result.status === 0) {
                successCount++;
                details.push({ name: store.name, status: 'ok' });
                console.log(`✅ [${i + 1}/${total}] ${store.name}`);
            } else {
                errorCount++;
                details.push({ name: store.name, status: 'error', message: result.status_message });
                console.log(`❌ [${i + 1}/${total}] ${store.name}: ${result.status_message}`);
            }
        } catch (err) {
            errorCount++;
            details.push({ name: store.name, status: 'error', message: err.message });
            console.log(`❌ [${i + 1}/${total}] ${store.name}: ${err.message}`);
        }

        if (onProgress) onProgress({ total, progress: i + 1, success: successCount, errors: errorCount });

        // Затримка 1.5 секунди між відправками (захист від бану)
        if (i < stores.length - 1) {
            await delay(1500);
        }
    }

    console.log(`✅ Розсилку завершено! Успішно: ${successCount}, Помилок: ${errorCount}`);

    return { success: successCount, errors: errorCount, total, details };
}

module.exports = { broadcastToAll, broadcastToSupport };
