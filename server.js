require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

const DB_PATH = path.join(__dirname, 'data', 'database.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// GANTI kalau mau
const LOGIN_USER = 'admin';
const LOGIN_PASS = 'yonkomlek123';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: 'yonkomlek-secret-key',
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
        h2 {
          margin-top: 0;
          margin-bottom: 16px;
        }
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

// ================= API BOT TELEGRAM =================
app.post('/api/bot', (req, res) => {
  try {
    const pesan = (req.body.message || '').toLowerCase().trim();
    const db = bacaDatabase();
    const data = db.items || [];

    const getSiap = (item) =>
      Math.max(0, (item.jumlah || 0) - (item.rusak || 0) - (item.pinjam || 0));

    if (pesan.includes('rekap') || pesan.includes('semua')) {
      const total = data.reduce((s, x) => s + (x.jumlah || 0), 0);
      const baik = data.reduce((s, x) => s + (x.baik || 0), 0);
      const rusak = data.reduce((s, x) => s + (x.rusak || 0), 0);
      const pinjam = data.reduce((s, x) => s + (x.pinjam || 0), 0);
      const siap = data.reduce((s, x) => s + getSiap(x), 0);

      return res.json({
        reply:
          `📊 REKAP INVENTARIS\n` +
          `Total item: ${data.length} jenis\n` +
          `Total unit: ${total}\n` +
          `Baik: ${baik}\n` +
          `Rusak: ${rusak}\n` +
          `Dipinjam: ${pinjam}\n` +
          `Siap: ${siap}`
      });
    }

    if (pesan.includes('rusak')) {
      const rusaks = data.filter(x => (x.rusak || 0) > 0);

      if (!rusaks.length) {
        return res.json({ reply: 'Tidak ada barang rusak.' });
      }

      return res.json({
        reply: 'Barang rusak:\n' + rusaks.map(x => `- ${x.nama}: ${x.rusak}`).join('\n')
      });
    }

    if (pesan.includes('pinjam') || pesan.includes('dipinjam')) {
      const pinjams = data.filter(x => (x.pinjam || 0) > 0);

      if (!pinjams.length) {
        return res.json({ reply: 'Tidak ada barang dipinjam.' });
      }

      return res.json({
        reply: 'Barang dipinjam:\n' + pinjams.map(x => `- ${x.nama}: ${x.pinjam}`).join('\n')
      });
    }

    const match = data.filter(
      x =>
        String(x.nama || '').toLowerCase().includes(pesan) ||
        String(x.kode || '').toLowerCase().includes(pesan) ||
        String(x.kompi || '').toLowerCase().includes(pesan)
    );

    if (match.length) {
      const hasil = match.map(x =>
        `${x.nama}\nKompi: ${x.kompi}\nTotal: ${x.jumlah}\nRusak: ${x.rusak}\nDipinjam: ${x.pinjam}\nSiap: ${getSiap(x)}`
      ).join('\n\n');

      return res.json({ reply: hasil });
    }

    return res.json({
      reply: 'Perintah tidak dikenali.\nCoba: rekap semua, barang rusak, barang dipinjam, atau nama barang.'
    });
  } catch (err) {
    console.error('Error /api/bot:', err);
    res.status(500).json({ reply: 'Terjadi kesalahan pada server.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server jalan di http://localhost:${PORT}`);
  console.log(`Login operator di http://localhost:${PORT}/login`);
});