const TelegramBot = require('node-telegram-bot-api');
const http = require('http');

// GANTI dengan token dari BotFather
const TOKEN = '8673929995:AAHScPvmLuTBWMUS9XzaaH-w-SPAHX7Sus0';

const bot = new TelegramBot(TOKEN, { polling: true });

console.log('🤖 Bot Telegram aktif...');

function tanyaBot(pesan) {
  return new Promise((resolve) => {
    const data = JSON.stringify({ message: pesan });

    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/bot',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };

    const req = http.request(options, (res) => {
      let body = '';

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve(parsed.reply || 'Server tidak merespon');
        } catch (err) {
          resolve('Terjadi kesalahan pada server');
        }
      });
    });

    req.on('error', () => {
      resolve('❌ Server belum aktif. Jalankan server.js dulu.');
    });

    req.write(data);
    req.end();
  });
}

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    'Halo. Bot Yonkomlek aktif.\nKirim pertanyaan seperti:\n- rekap semua\n- barang rusak\n- jammer'
  );
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text) return;
  if (text === '/start') return;

  console.log('Pesan masuk:', text);

  const balasan = await tanyaBot(text);
  bot.sendMessage(chatId, balasan);
});