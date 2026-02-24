const { Bot, Events, Message } = require('viber-bot');
const { getStoresTokens } = require('./excelParser');
const { broadcastMessage } = require('./broadcaster');

// Використовуємо ключ одного з магазинів (наприклад, тестового) як "Головний Пульт"
const bot = new Bot({
    logger: console,
    authToken: process.env.MAIN_STORE_TOKEN || 'dummy',
    name: "Менеджер Розсилок",
    avatar: "http://viber.com/avatar.jpg"
});

const ADMIN_IDS = (process.env.ADMIN_VIBER_IDS || "").split(',');

// Стан для адміністраторів: зберігає останній створений пост
const pendingPosts = new Map();

bot.on(Events.MESSAGE_RECEIVED, (message, response) => {
    const userId = response.userProfile.id;

    // Перевірка на адміна (якщо ADMIN_VIBER_IDS порожній, бот видасть ID, щоб його можна було додати в .env)
    if (!ADMIN_IDS.includes(userId) && ADMIN_IDS[0] !== '') {
        response.send(new Message.Text("⛔ У вас немає доступу до розсилки. 🔑 Ваш ID для Railway (ADMIN_VIBER_IDS): " + userId));
        return;
    }

    if (ADMIN_IDS[0] === '') {
        response.send(new Message.Text("⚠️ Адміни не налаштовані! Будь ласка, додайте цей ID у Railway: " + userId));
        return;
    }

    // Якщо це підтвердження або відміна
    if (message instanceof Message.Text) {
        if (message.text === '✅ Підтвердити') {
            const post = pendingPosts.get(userId);
            if (!post) {
                return response.send(new Message.Text("❗ Немає повідомлення для розсилки. Надішліть спочатку текст або картинку."));
            }

            response.send(new Message.Text("🚀 Розсилка розпочата! Це може зайняти кілька хвилин (1 повідомлення на 1.5 сек)..."));
            broadcastMessage(post, bot).then(result => {
                response.send(new Message.Text(`📊 **Звіт про розсилку:**\n✅ Успішно: ${result.success}\n❌ Помилок: ${result.errors}`));
            });
            pendingPosts.delete(userId);
            return;
        }

        if (message.text === '❌ Відмінити') {
            pendingPosts.delete(userId);
            return response.send(new Message.Text("Rozsylku vidmineno. Cekaju na novy post."));
        }
    }

    // Зберігаємо повідомлення в пам'ять
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
    const userId = userProfile.id;
    if (!ADMIN_IDS.includes(userId)) {
        onFinish(new Message.Text("Привіт! Я бот для розсилок, але у тебе немає допуску. Твій ID: " + userId));
    } else {
        onFinish(new Message.Text("Привіт, адміністратор! Відправ мені будь-який пост сюди, і я перешлю його в усі магазини."));
    }
});

module.exports = { bot, ADMIN_IDS };
