const axios = require('axios');
const { loadStores, loadSupportStores } = require('./excelParser');

const VIBER_POST_URL = "https://chatapi.viber.com/pa/post";
const VIBER_SET_WEBHOOK_URL = "https://chatapi.viber.com/pa/set_webhook";
const VIBER_ACCOUNT_INFO_URL = "https://chatapi.viber.com/pa/get_account_info";

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Кеш: token -> { webhookSet: bool, adminId: string }
const channelCache = new Map();

/**
 * Отримує інформацію про канал і знаходить суперадміна
 */
async function getChannelAdmin(token) {
    try {
        const res = await axios.post(VIBER_ACCOUNT_INFO_URL, {}, {
            headers: { 'X-Viber-Auth-Token': token, 'Content-Type': 'application/json' }
        });

        if (res.data.status === 0 && res.data.members) {
            const superadmin = res.data.members.find(m => m.role === 'superadmin');
            if (superadmin) return superadmin.id;
            // Якщо немає суперадміна, беремо першого адміна
            const admin = res.data.members.find(m => m.role === 'admin');
            if (admin) return admin.id;
            // Беремо будь-якого учасника
            if (res.data.members.length > 0) return res.data.members[0].id;
        }
        return null;
    } catch (err) {
        console.error(`❌ Помилка get_account_info: ${err.message}`);
        return null;
    }
}

/**
 * Встановлює Webhook та отримує admin ID для каналу
 */
async function ensureChannelReady(token, webhookUrl) {
    if (channelCache.has(token)) return channelCache.get(token);

    // 1. Встановлюємо webhook
    try {
        await axios.post(VIBER_SET_WEBHOOK_URL, {
            url: webhookUrl,
            send_name: true,
            send_photo: true
        }, {
            headers: { 'X-Viber-Auth-Token': token, 'Content-Type': 'application/json' }
        });
    } catch (err) {
        console.warn(`⚠️ Webhook помилка для ${token.substring(0, 10)}...: ${err.message}`);
    }

    // 2. Отримуємо admin ID
    const adminId = await getChannelAdmin(token);

    const info = { adminId };
    channelCache.set(token, info);
    console.log(`🔗 Канал готовий: ${token.substring(0, 10)}... admin=${adminId ? adminId.substring(0, 10) + '...' : 'N/A'}`);
    return info;
}

/**
 * Відправляє повідомлення в один канал
 */
async function postToChannel(token, text, imageUrl, webhookUrl) {
    const channelInfo = await ensureChannelReady(token, webhookUrl);

    if (!channelInfo.adminId) {
        return { status: 99, status_message: 'Не вдалося знайти адміна каналу' };
    }

    const message = {
        from: channelInfo.adminId
    };

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
