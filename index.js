require('dotenv').config();
const express = require('express');
const { bot, handleAdminMessage } = require('./bot');

const app = express();
const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

// Middleware для парсингу JSON (важливо для Viber Webhook)
app.use(express.json());

// Підключаємо Viber Bot Middleware
app.use('/viber/webhook', bot.middleware());

// Health Check endpoint для Railway (щоб сервер не падав)
app.get('/', (req, res) => {
    res.send('Viber Relay Bot is running.');
});

// Запуск сервера
app.listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Setting Webhook to: ${WEBHOOK_URL}`);

    if (WEBHOOK_URL) {
        try {
            await bot.setWebhook(WEBHOOK_URL);
            console.log('Webhook successfully set.');
        } catch (error) {
            console.error('Failed to set webhook:', error.message);
        }
    } else {
        console.warn('WEBHOOK_URL is not set in .env. Bot will not receive messages.');
    }
});
