require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const PORT = process.env.PORT || 3000;

const DB_PATH = path.join(__dirname, 'data', 'database.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

const LOGIN_USER = process.env.LOGIN_USER || 'admin';
const LOGIN_PASS = process.env.LOGIN_PASS || 'yonkomlek123';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'yonkomlek-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 8
  }
}));

function bacaDatabase() {
  if (!fs.existsSync(DB_PATH)) {
    return { items: [] };
  }
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  return JSON.parse(raw);
}

function simpanDatabase(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function harusLogin(req, res, next) {
  if (req.session && req.session.loggedIn) {
    return next();
  }
  return res.status(401).json({ error: 'Belum login' });
}

function getSiap(item) {
  return Math.max(0, (item.jumlah || 0) - (item.rusak || 0) - (item.pinjam || 0));
}

function jawabanBot(pesan) {
  const q = String(pesan || '').toLowerCase().trim();
  const db = bacaDatabase();
  const data = db.items || [];

  if (!q) {
    return 'Kirim perintah seperti: rekap semua, barang rusak, barang dipinjam, siap ops, atau nama barang.';
  }

  const formatItemDetail = (x) => {
    return (
      `📦 ${x.nama || '-'}\n` +
      `Kode: ${x.kode || '-'}\n` +
      `Kompi: ${x.kompi || '-'}\n` +
      `Jumlah: ${x.jumlah || 0}\n` +
      `Baik: ${x.baik || 0}\n` +
      `Rusak: ${x.rusak || 0}\n` +
      `Dipinjam: ${x.pinjam || 0}\n` +
      `Siap: ${getSiap(x)}\n` +
      `Keterangan: ${x.keterangan || '-'}`
    );
  };

  // ================= REKAP SEMUA =================
  if (q.includes('rekap') || q.includes('semua')) {
    const total = data.reduce((s, x) => s + (x.jumlah || 0), 0);
    const baik = data.reduce((s, x) => s + (x.baik || 0), 0);
    const rusak = data.reduce((s, x) => s + (x.rusak || 0), 0);
    const pinjam = data.reduce((s, x) => s + (x.pinjam || 0), 0);
    const siap = data.reduce((s, x) => s + getSiap(x), 0);

    return (
      `📊 REKAP INVENTARIS\n` +
      `Total item: ${data.length} jenis\n` +
      `Total unit: ${total}\n` +
      `Baik: ${baik}\n` +
      `Rusak: ${rusak}\n` +
      `Dipinjam: ${pinjam}\n` +
      `Siap: ${siap}`
    );
  }

  // ================= BARANG RUSAK =================
  if (q.includes('rusak') && !q.includes('kursi') && !q.includes('radio')) {
    const rusaks = data.filter(x => (x.rusak || 0) > 0);
    if (!rusaks.length) return 'Tidak ada barang rusak.';

    return '🔴 BARANG RUSAK:\n\n' + rusaks.map(formatItemDetail).join('\n\n');
  }

  // ================= BARANG DIPINJAM =================
  if (q.includes('pinjam') || q.includes('dipinjam')) {
    const pinjams = data.filter(x => (x.pinjam || 0) > 0);
    if (!pinjams.length) return 'Tidak ada barang dipinjam.';

    return '🟡 BARANG DIPINJAM:\n\n' + pinjams.map(formatItemDetail).join('\n\n');
  }

  // ================= SIAP OPS =================
  if (q.includes('siap')) {
    const items = data
      .filter(x => getSiap(x) > 0)
      .sort((a, b) => getSiap(b) - getSiap(a));

    if (!items.length) return 'Tidak ada barang siap ops.';

    return '🟢 BARANG SIAP OPS:\n\n' + items.map(formatItemDetail).join('\n\n');
  }

  // ================= FILTER KOMPI =================
  const daftarKompi = ['ki-kom', 'ki-mar', 'ki-ban', 'ki-ops', 'ki-lek', 'ki-nik', 'log'];
  const kompiCari = daftarKompi.find(k => q.includes(k));

  if (kompiCari) {
    const itemsKompi = data.filter(x => String(x.kompi || '').toLowerCase() === kompiCari);

    if (!itemsKompi.length) {
      return `Tidak ada data untuk kompi ${kompiCari.toUpperCase()}.`;
    }

    return `📁 DATA ${kompiCari.toUpperCase()}\n\n` + itemsKompi.map(formatItemDetail).join('\n\n');
  }

  // ================= PENCARIAN DETAIL NAMA/KODE/KETERANGAN =================
  const match = data.filter(x =>
    String(x.nama || '').toLowerCase().includes(q) ||
    String(x.kode || '').toLowerCase().includes(q) ||
    String(x.kompi || '').toLowerCase().includes(q) ||
    String(x.keterangan || '').toLowerCase().includes(q)
  );

  if (match.length === 1) {
    return formatItemDetail(match[0]);
  }

  if (match.length > 1) {
    return `📋 DITEMUKAN ${match.length} DATA:\n\n` + match.map(formatItemDetail).join('\n\n');
  }

  // ================= KATA KUNCI PERNIKA / KOMUNIKASI / DLL =================
  const aliasKompi = {
    'pernika': 'ki-nik',
    'komunikasi': 'ki-kom',
    'markas': 'ki-mar',
    'bantuan': 'ki-ban',
    'sikoops': 'ki-ops',
    'sislek': 'ki-lek'
  };

  for (const key in aliasKompi) {
    if (q.includes(key)) {
      const kodeKompi = aliasKompi[key];
      const items = data.filter(x => String(x.kompi || '').toLowerCase() === kodeKompi);

      if (!items.length) {
        return `Tidak ada data untuk ${key}.`;
      }

      return `📁 DATA ${key.toUpperCase()}\n\n` + items.map(formatItemDetail).join('\n\n');
    }
  }

  return (
    'Perintah tidak dikenali.\n\n' +
    'Contoh:\n' +
    '- rekap semua\n' +
    '- barang rusak\n' +
    '- barang dipinjam\n' +
    '- siap ops\n' +
    '- kursi\n' +
    '- radio\n' +
    '- pernika\n' +
    '- ki-kom'
  );
}

// ================= LOGIN PAGE =================
app.get('/login', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Login Operator</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          background: #f5f5f5;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          margin: 0;
        }
        .box {
          background: white;
          padding: 24px;
          border-radius: 12px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          width: 320px;
        }
        h2 { margin-top: 0; margin-bottom: 16px; }
        input, button {
          width: 100%;
          padding: 10px;
          margin-top: 10px;
          box-sizing: border-box;
        }
        button {
          background: #1f4fa3;
          color: white;
          border: none;
          cursor: pointer;
        }
        .err {
          color: red;
          font-size: 13px;
          margin-top: 10px;
        }
      </style>
    </head>
    <body>
      <form class="box" method="POST" action="/login">
        <h2>Login Operator</h2>
        <input name="username" placeholder="Username" required />
        <input name="password" type="password" placeholder="Password" required />
        <button type="submit">Login</button>
        ${req.query.error ? '<div class="err">Username atau password salah</div>' : ''}
      </form>
    </body>
    </html>
  `);
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (username === LOGIN_USER && password === LOGIN_PASS) {
    req.session.loggedIn = true;
    return res.redirect('/');
  }

  return res.redirect('/login?error=1');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// ================= HALAMAN UTAMA =================
app.get('/', (req, res) => {
  if (!req.session.loggedIn) {
    return res.redirect('/login');
  }
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// ================= API DATA =================
app.get('/api/data', harusLogin, (req, res) => {
  try {
    const db = bacaDatabase();
    res.json(db.items || []);
  } catch (err) {
    res.status(500).json({ error: 'Gagal membaca data' });
  }
});

app.post('/api/data', harusLogin, (req, res) => {
  try {
    const items = req.body;

    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Format data harus array' });
    }

    simpanDatabase({ items });
    res.json({ success: true, message: 'Data berhasil disimpan' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menyimpan data' });
  }
});

// ================= API BOT =================
app.post('/api/bot', (req, res) => {
  try {
    const reply = jawabanBot(req.body.message || '');
    res.json({ reply });
  } catch (err) {
    console.error('Error /api/bot:', err);
    res.status(500).json({ reply: 'Terjadi kesalahan pada server.' });
  }
});

// ================= START SERVER =================
app.listen(PORT, () => {
  console.log(`Server jalan di port ${PORT}`);
});

// ================= TELEGRAM BOT ONLINE =================
if (TELEGRAM_BOT_TOKEN) {
  const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

  bot.onText(/\/start/, (msg) => {
    bot.sendMessage(
      msg.chat.id,
      'Halo. Bot Yonkomlek aktif.\nCoba kirim:\n- rekap semua\n- barang rusak\n- barang dipinjam\n- jammer'
    );
  });

  bot.on('message', async (msg) => {
    try {
      const chatId = msg.chat.id;
      const text = msg.text;

      if (!text || text === '/start') return;

      const reply = jawabanBot(text);
      await bot.sendMessage(chatId, reply);
    } catch (err) {
      console.error('Telegram bot error:', err.message);
    }
  });

  console.log('Telegram bot aktif.');
} else {
  console.log('TELEGRAM_BOT_TOKEN belum diisi. Bot Telegram tidak dijalankan.');
}
