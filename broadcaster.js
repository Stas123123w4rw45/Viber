const axios = require('axios');
const { loadStores, loadSupportStores } = require('./excelParser');

const VIBER_POST_URL = "https://chatapi.viber.com/pa/post";
const VIBER_SET_WEBHOOK_URL = "https://chatapi.viber.com/pa/set_webhook";

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Кеш: які токени вже мають встановлений Webhook
const webhookCache = new Set();

/**
 * Встановлює Webhook для токена каналу (потрібно 1 раз перед першим постом)
 * Для каналів достатньо порожнього URL - це просто "активує" API
 */
async function ensureWebhook(token, webhookUrl) {
    if (webhookCache.has(token)) return;

    try {
        const res = await axios.post(VIBER_SET_WEBHOOK_URL, {
            url: webhookUrl,
            send_name: true,
            send_photo: true
        }, {
            headers: {
                'X-Viber-Auth-Token': token,
                'Content-Type': 'application/json'
            }
        });

        if (res.data.status === 0) {
            webhookCache.add(token);
            console.log(`🔗 Webhook встановлено для токена ${token.substring(0, 10)}...`);
        } else {
            console.warn(`⚠️ Webhook: ${res.data.status_message} for ${token.substring(0, 10)}...`);
        }
    } catch (err) {
        console.error(`❌ Webhook error: ${err.message}`);
    }
}

/**
 * Відправляє повідомлення в один канал через Viber Channel Post API
 */
async function postToChannel(token, text, imageUrl, webhookUrl) {
    // Спершу переконуємось що Webhook встановлено
    await ensureWebhook(token, webhookUrl);

    const message = {};

    if (imageUrl && text) {
        message.type = 'picture';
        message.text = text;
        message.media = imageUrl;
    } else if (imageUrl) {
        message.type = 'picture';
        message.text = '';
        message.media = imageUrl;
    } else {
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
async function broadcastToAll(text, imageUrl, onProgress, webhookUrl) {
    const stores = loadStores();
    return await doBroadcast(stores, text, imageUrl, onProgress, webhookUrl);
}

/**
 * Розсилка тільки по магазинах на підтримці
 */
async function broadcastToSupport(text, imageUrl, onProgress, webhookUrl) {
    const stores = loadSupportStores();
    return await doBroadcast(stores, text, imageUrl, onProgress, webhookUrl);
}

/**
 * Виконання розсилки з rate-limiting
 */
async function doBroadcast(stores, text, imageUrl, onProgress, webhookUrl) {
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
            const result = await postToChannel(store.token, text, imageUrl, webhookUrl);

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
            const errMsg = err.response ? JSON.stringify(err.response.data) : err.message;
            details.push({ name: store.name, status: 'error', message: errMsg });
            console.log(`❌ [${i + 1}/${total}] ${store.name}: ${errMsg}`);
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
