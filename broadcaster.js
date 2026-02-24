const axios = require('axios');
const { getAllStores, getSupportStores } = require('./database');

const VIBER_POST_URL = "https://chatapi.viber.com/pa/post";
const VIBER_SET_WEBHOOK_URL = "https://chatapi.viber.com/pa/set_webhook";
const VIBER_ACCOUNT_INFO_URL = "https://chatapi.viber.com/pa/get_account_info";

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Кеш: token -> { adminId }
const channelCache = new Map();

/**
 * Отримує Viber ID суперадміна каналу (потрібно для поля 'from')
 */
async function getChannelAdmin(token) {
    try {
        const res = await axios.post(VIBER_ACCOUNT_INFO_URL, {}, {
            headers: { 'X-Viber-Auth-Token': token, 'Content-Type': 'application/json' }
        });
        if (res.data.status === 0 && res.data.members) {
            const admin = res.data.members.find(m => m.role === 'superadmin')
                || res.data.members.find(m => m.role === 'admin')
                || res.data.members[0];
            return admin ? admin.id : null;
        }
        return null;
    } catch (err) {
        console.error(`❌ get_account_info: ${err.message}`);
        return null;
    }
}

/**
 * Підготовка каналу: встановлення webhook + отримання admin ID
 */
async function ensureChannelReady(token, webhookUrl) {
    if (channelCache.has(token)) return channelCache.get(token);

    try {
        await axios.post(VIBER_SET_WEBHOOK_URL, {
            url: webhookUrl, send_name: true, send_photo: true
        }, {
            headers: { 'X-Viber-Auth-Token': token, 'Content-Type': 'application/json' }
        });
    } catch (err) {
        console.warn(`⚠️ Webhook: ${err.message}`);
    }

    const adminId = await getChannelAdmin(token);
    const info = { adminId };
    channelCache.set(token, info);
    return info;
}

/**
 * Відправка в один канал
 */
async function postToChannel(token, text, imageUrl, webhookUrl) {
    const { adminId } = await ensureChannelReady(token, webhookUrl);
    if (!adminId) return { status: 99, status_message: 'Не знайдено адміна каналу' };

    const message = { from: adminId };

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
        headers: { 'X-Viber-Auth-Token': token, 'Content-Type': 'application/json' }
    });
    return response.data;
}

async function broadcastToAll(text, imageUrl, onProgress, webhookUrl) {
    const stores = await getAllStores();
    return await doBroadcast(stores, text, imageUrl, onProgress, webhookUrl);
}

async function broadcastToSupport(text, imageUrl, onProgress, webhookUrl) {
    const stores = await getSupportStores();
    return await doBroadcast(stores, text, imageUrl, onProgress, webhookUrl);
}

async function doBroadcast(stores, text, imageUrl, onProgress, webhookUrl) {
    if (stores.length === 0) return { success: 0, errors: 0, total: 0, details: [] };

    let successCount = 0, errorCount = 0;
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
            const msg = err.response ? JSON.stringify(err.response.data) : err.message;
            details.push({ name: store.name, status: 'error', message: msg });
            console.log(`❌ [${i + 1}/${total}] ${store.name}: ${msg}`);
        }

        if (onProgress) onProgress({ total, progress: i + 1, success: successCount, errors: errorCount });
        if (i < stores.length - 1) await delay(1500);
    }

    console.log(`✅ Завершено! Успішно: ${successCount}, Помилок: ${errorCount}`);
    return { success: successCount, errors: errorCount, total, details };
}

module.exports = { broadcastToAll, broadcastToSupport };
