const { Bot, Events, Message } = require('viber-bot');
const { getStoresTokens } = require('./excelParser');
const { broadcastMessage } = require('./broadcaster');

const bot = new Bot({
    logger: console,
    authToken: process.env.MASTER_BOT_TOKEN || 'dummy',
    name: "Master Bot",
    avatar: "http://viber.com/avatar.jpg"
});

const ADMIN_IDS = (process.env.ADMIN_VIBER_IDS || "").split(',');

// Стан для адміністраторів: зберігає останній створений пост
const pendingPosts = new Map();

bot.on(Events.MESSAGE_RECEIVED, (message, response) => {
    const userId = response.userProfile.id;

    if (!ADMIN_IDS.includes(userId) && ADMIN_IDS[0] !== '') {
        response.send(new Message.Text("⛔ У вас немає доступу до керування цим ботом. Ваш ID: " + userId));
        return;
    }

    // Якщо це підтвердження або відміна
    if (message instanceof Message.Text) {
        if (message.text === '✅ Підтвердити') {
            const post = pendingPosts.get(userId);
            if (!post) {
                return response.send(new Message.Text("❗ Немає повідомлення для розсилки. Надішліть спочатку текст або картинку."));
            }

            response.send(new Message.Text("🚀 Розсилка розпочата! Це може зайняти деякий час..."));
            broadcastMessage(post, bot).then(result => {
                response.send(new Message.Text(`📊 **Звіт про розсилку:**\n✅ Успішно: ${result.success}\n❌ Помилок: ${result.errors}`));
            });
            pendingPosts.delete(userId);
            return;
        }

        if (message.text === '❌ Відмінити') {
            pendingPosts.delete(userId);
            return response.send(new Message.Text("Розсилку відмінено. Чекаю на новий пост."));
        }
    }

    // Зберігаємо повідомлення в пам'ять (текст, картинка, відео тощо)
    pendingPosts.set(userId, message);

    // Запитуємо підтвердження
    const keyboard = {
        "Type": "keyboard",
        "DefaultHeight": true,
        "Buttons": [
            {
                "Columns": 3,
                "Rows": 1,
                "BgColor": "#e6f5e9",
                "ActionType": "reply",
                "ActionBody": "✅ Підтвердити",
                "Text": "<b>✅ Підтвердити</b>"
            },
            {
                "Columns": 3,
                "Rows": 1,
                "BgColor": "#f5e6e6",
                "ActionType": "reply",
                "ActionBody": "❌ Відмінити",
                "Text": "<b>❌ Відмінити</b>"
            }
        ]
    };

    response.send(new Message.Keyboard(keyboard, "❓ Ви дійсно хочете розіслати це повідомлення у всі 170+ магазинів?"));
});

bot.on(Events.CONVERSATION_STARTED, (userProfile, isSubscribed, context, onFinish) => {
    onFinish(new Message.Text("Привіт, адміністратор. Відправ мені пост (наприклад, фото з текстом), і я розішлю його у всі магазини."));
});

module.exports = { bot, ADMIN_IDS };
