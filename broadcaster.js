const { getStoresTokens } = require('./excelParser');
const axios = require('axios');

const VIBER_BROADCAST_URL = "https://chatapi.viber.com/pa/broadcast_message";

/**
 * Затримка для асинхронних функцій.
 * @param {number} ms - Мілісекунди
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Функція для розсилки повідомлення
 * @param {Object} messageObj - Об'єкт повідомлення (з viber-bot-node)
 * @param {Object} masterBot - Інстанція головного бота (опціонально)
 */
async function broadcastMessage(messageObj, masterBot) {
    const stores = getStoresTokens();
    if (stores.length === 0) {
        console.warn("⚠️ Немає магазинів (токенів) для розсилки.");
        return { success: 0, errors: 0 };
    }

    // Перетворюємо об'єкт viber-bot-node (Text, Picture тощо) в JSON, готовий для API.
    const messageJson = messageObj.toJson();

    let successCount = 0;
    let errorCount = 0;

    console.log(`🚀 Починаємо розсилку на ${stores.length} магазинів...`);

    // Ітеруємо по кожному магазину з затримкою 1 секунда (захист від бану)
    for (const store of stores) {
        try {
            const payload = {
                ...messageJson,
                min_api_version: 7
            };

            const response = await axios.post(
                VIBER_BROADCAST_URL,
                payload,
                {
                    headers: {
                        'X-Viber-Auth-Token': store.token,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (response.data.status === 0 || response.data.status_message === 'ok') {
                console.log(`✅ [Успіх] Надіслано до: ${store.name}`);
                successCount++;
            } else {
                console.error(`❌ [Помилка API Viber] для ${store.name}:`, response.data.status_message);
                errorCount++;
            }
        } catch (error) {
            console.error(`❌ [Мережева помилка] для ${store.name}:`, error.message);
            errorCount++;
        }

        // Чекаємо 1.5 секунди перед наступною відправкою
        await delay(1500);
    }

    console.log(`✅ Розсилку завершено! Успішно: ${successCount}. Помилок: ${errorCount}.`);

    return {
        success: successCount,
        errors: errorCount
    };
}

module.exports = { broadcastMessage };
