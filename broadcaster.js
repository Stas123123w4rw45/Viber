const axios = require('axios');
const { getAllStores, getSupportStores } = require('./database');

const VIBER_POST_URL = "https://chatapi.viber.com/pa/post";
const VIBER_SET_WEBHOOK_URL = "https://chatapi.viber.com/pa/set_webhook";
const VIBER_ACCOUNT_INFO_URL = "https://chatapi.viber.com/pa/get_account_info";

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const channelCache = new Map();

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
    } catch (e) { console.error(`❌ get_account_info: ${e.message}`); return null; }
}

async function ensureReady(token, webhookUrl) {
    if (channelCache.has(token)) return channelCache.get(token);
    try {
        await axios.post(VIBER_SET_WEBHOOK_URL, { url: webhookUrl, send_name: true, send_photo: true }, {
            headers: { 'X-Viber-Auth-Token': token, 'Content-Type': 'application/json' }
        });
    } catch (e) { console.warn(`⚠️ Webhook: ${e.message}`); }
    const adminId = await getChannelAdmin(token);
    const info = { adminId };
    channelCache.set(token, info);
    return info;
}

async function postToChannel(token, text, imageUrl, webhookUrl) {
    const { adminId } = await ensureReady(token, webhookUrl);
    if (!adminId) return { status: 99, status_message: 'Адміна не знайдено' };

    const message = { from: adminId };
    if (imageUrl && text) { message.type = 'picture'; message.text = text; message.media = imageUrl; }
    else if (imageUrl) { message.type = 'picture'; message.text = ''; message.media = imageUrl; }
    else { message.type = 'text'; message.text = text; }

    const res = await axios.post(VIBER_POST_URL, message, {
        headers: { 'X-Viber-Auth-Token': token, 'Content-Type': 'application/json' }
    });
    return res.data;
}

/**
 * Відправляє "Вічне Меню" (Rich Message з кнопками) в один канал
 */
async function postMenuToChannel(token, settings, webhookUrl) {
    const { adminId } = await ensureReady(token, webhookUrl);
    if (!adminId) return { status: 99, status_message: 'Адміна не знайдено' };

    const message = {
        from: adminId,
        type: 'rich_media',
        min_api_version: 7,
        rich_media: {
            Type: 'rich_media',
            ButtonsGroupColumns: 6,
            ButtonsGroupRows: 7,
            BgColor: '#1a1a2e',
            Buttons: [
                // Банер зверху
                {
                    Columns: 6, Rows: 2,
                    ActionType: 'none',
                    Text: `<font color='#ffffff' size='22'><b>${settings.menu_banner_text || '📋 Меню магазину'}</b></font>`,
                    TextSize: 'large',
                    TextVAlign: 'middle',
                    TextHAlign: 'center',
                    BgColor: '#7c5ce0'
                },
                // Кнопка "Скарги / Пропозиції"
                {
                    Columns: 6, Rows: 2,
                    ActionType: 'open-url',
                    ActionBody: settings.google_form_url || '#',
                    Text: `<font color='#ffffff' size='18'><b>${settings.complaint_button_text || '📝 Скарги / Пропозиції'}</b></font>`,
                    TextSize: 'medium',
                    TextVAlign: 'middle',
                    TextHAlign: 'center',
                    BgColor: '#2d8cf0',
                    BgMediaScaleType: 'fill'
                },
                // Кнопка "Актуальні вакансії"
                {
                    Columns: 3, Rows: 2,
                    ActionType: 'open-url',
                    ActionBody: settings.vacancies_url || '#',
                    Text: `<font color='#ffffff' size='16'><b>${settings.vacancies_button_text || '💼 Вакансії'}</b></font>`,
                    TextSize: 'small',
                    TextVAlign: 'middle',
                    TextHAlign: 'center',
                    BgColor: '#4caf50'
                },
                // Кнопка "Замовити піцу"
                {
                    Columns: 3, Rows: 2,
                    ActionType: 'open-url',
                    ActionBody: settings.pizza_url || 'tel:+380501234567',
                    Text: `<font color='#ffffff' size='16'><b>${settings.pizza_button_text || '🍕 Замовити'}</b></font>`,
                    TextSize: 'small',
                    TextVAlign: 'middle',
                    TextHAlign: 'center',
                    BgColor: '#f44336'
                },
                // Футер з телефоном
                {
                    Columns: 6, Rows: 1,
                    ActionType: 'none',
                    Text: `<font color='#aaaaaa' size='12'>📞 ${settings.phone_number || '+380 50 123 45 67'}</font>`,
                    TextSize: 'small',
                    TextVAlign: 'middle',
                    TextHAlign: 'center',
                    BgColor: '#1a1a2e'
                }
            ]
        }
    };

    const res = await axios.post(VIBER_POST_URL, message, {
        headers: { 'X-Viber-Auth-Token': token, 'Content-Type': 'application/json' }
    });
    return res.data;
}

// ============= BROADCAST FUNCTIONS =============

async function broadcastToAll(text, imageUrl, onProgress, webhookUrl) {
    return doBroadcast(await getAllStores(), text, imageUrl, onProgress, webhookUrl);
}

async function broadcastToSupport(text, imageUrl, onProgress, webhookUrl) {
    return doBroadcast(await getSupportStores(), text, imageUrl, onProgress, webhookUrl);
}

async function sendMenuToChannels(type, settings, onProgress, webhookUrl) {
    const stores = type === 'support' ? await getSupportStores() : await getAllStores();
    if (stores.length === 0) return { success: 0, errors: 0, total: 0, details: [] };

    let successCount = 0, errorCount = 0;
    const details = [];
    const total = stores.length;
    if (onProgress) onProgress({ total, progress: 0, success: 0, errors: 0 });

    for (let i = 0; i < stores.length; i++) {
        const store = stores[i];
        try {
            const result = await postMenuToChannel(store.token, settings, webhookUrl);
            if (result.status === 0) {
                successCount++; details.push({ name: store.name, status: 'ok' });
                console.log(`✅ Menu [${i + 1}/${total}] ${store.name}`);
            } else {
                errorCount++; details.push({ name: store.name, status: 'error', message: result.status_message });
                console.log(`❌ Menu [${i + 1}/${total}] ${store.name}: ${result.status_message}`);
            }
        } catch (e) {
            errorCount++;
            const msg = e.response ? JSON.stringify(e.response.data) : e.message;
            details.push({ name: store.name, status: 'error', message: msg });
            console.log(`❌ Menu [${i + 1}/${total}] ${store.name}: ${msg}`);
        }
        if (onProgress) onProgress({ total, progress: i + 1, success: successCount, errors: errorCount });
        if (i < stores.length - 1) await delay(1500);
    }
    return { success: successCount, errors: errorCount, total, details };
}

async function doBroadcast(stores, text, imageUrl, onProgress, webhookUrl) {
    if (stores.length === 0) return { success: 0, errors: 0, total: 0, details: [] };
    let successCount = 0, errorCount = 0;
    const details = [];
    const total = stores.length;
    if (onProgress) onProgress({ total, progress: 0, success: 0, errors: 0 });

    for (let i = 0; i < stores.length; i++) {
        const store = stores[i];
        try {
            const result = await postToChannel(store.token, text, imageUrl, webhookUrl);
            if (result.status === 0) {
                successCount++; details.push({ name: store.name, status: 'ok' });
                console.log(`✅ [${i + 1}/${total}] ${store.name}`);
            } else {
                errorCount++; details.push({ name: store.name, status: 'error', message: result.status_message });
                console.log(`❌ [${i + 1}/${total}] ${store.name}: ${result.status_message}`);
            }
        } catch (e) {
            errorCount++;
            const msg = e.response ? JSON.stringify(e.response.data) : e.message;
            details.push({ name: store.name, status: 'error', message: msg });
            console.log(`❌ [${i + 1}/${total}] ${store.name}: ${msg}`);
        }
        if (onProgress) onProgress({ total, progress: i + 1, success: successCount, errors: errorCount });
        if (i < stores.length - 1) await delay(1500);
    }
    return { success: successCount, errors: errorCount, total, details };
}

module.exports = { broadcastToAll, broadcastToSupport, sendMenuToChannels };
