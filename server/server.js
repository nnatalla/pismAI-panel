require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool, initSchema } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

const APP_PASSWORD_HASH = process.env.APP_PASSWORD_HASH || null; // preferowane: hash bcrypt
const APP_PASSWORD_PLAIN = process.env.APP_PASSWORD || null;     // alternatywa: zwykłe hasło w env

if (!APP_PASSWORD_HASH && !APP_PASSWORD_PLAIN) {
  console.warn('UWAGA: nie ustawiono APP_PASSWORD ani APP_PASSWORD_HASH - logowanie zawsze się nie powiedzie, dopóki nie ustawisz jednej z tych zmiennych w Render.');
}

app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  store: new pgSession({ pool, tableName: 'user_sessions', createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'zmien-mnie-w-zmiennych-srodowiskowych',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 30 // 30 dni
  }
}));

function requireAuth(req, res, next) {
  if (req.session && req.session.authed) return next();
  return res.status(401).json({ error: 'Brak autoryzacji. Zaloguj się ponownie.' });
}

/* ======================= AUTH ======================= */
app.post('/api/login', async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Podaj hasło.' });

  let ok = false;
  try {
    if (APP_PASSWORD_HASH) {
      ok = await bcrypt.compare(password, APP_PASSWORD_HASH);
    } else if (APP_PASSWORD_PLAIN) {
      ok = password === APP_PASSWORD_PLAIN;
    }
  } catch (err) {
    console.error('Błąd weryfikacji hasła:', err);
  }

  if (!ok) return res.status(401).json({ error: 'Błędne hasło.' });
  req.session.authed = true;
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/session', (req, res) => {
  res.json({ authed: !!(req.session && req.session.authed) });
});

/* ======================= SETTINGS (dane sprzedawcy) ======================= */
app.get('/api/settings', requireAuth, async (req, res) => {
  try {
    const r = await pool.query('SELECT seller FROM settings WHERE id = 1');
    res.json(r.rows[0] ? r.rows[0].seller : {});
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd odczytu ustawień.' });
  }
});

app.put('/api/settings', requireAuth, async (req, res) => {
  try {
    const seller = req.body || {};
    await pool.query(
      'UPDATE settings SET seller = $1, updated_at = now() WHERE id = 1',
      [JSON.stringify(seller)]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd zapisu ustawień.' });
  }
});

/* ======================= KONTRAHENCI ======================= */
app.get('/api/contractors', requireAuth, async (req, res) => {
  try {
    const r = await pool.query('SELECT id, name, updated_at FROM contractors ORDER BY updated_at DESC');
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd odczytu listy kontrahentów.' });
  }
});

app.get('/api/contractors/:id', requireAuth, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT id, name, state, created_at, updated_at FROM contractors WHERE id = $1',
      [req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Nie znaleziono kontrahenta.' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd odczytu kontrahenta.' });
  }
});

app.post('/api/contractors', requireAuth, async (req, res) => {
  try {
    const { name, state } = req.body || {};
    const r = await pool.query(
      'INSERT INTO contractors (name, state) VALUES ($1, $2) RETURNING id, name, created_at, updated_at',
      [name || '', JSON.stringify(state || {})]
    );
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd zapisu kontrahenta.' });
  }
});

app.put('/api/contractors/:id', requireAuth, async (req, res) => {
  try {
    const { name, state } = req.body || {};
    const r = await pool.query(
      'UPDATE contractors SET name = $1, state = $2, updated_at = now() WHERE id = $3 RETURNING id, name, updated_at',
      [name || '', JSON.stringify(state || {}), req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Nie znaleziono kontrahenta.' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd aktualizacji kontrahenta.' });
  }
});

app.delete('/api/contractors/:id', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM contractors WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd usuwania kontrahenta.' });
  }
});

/* ======================= ZAŁĄCZNIKI ======================= */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 } // 15 MB
});

app.get('/api/contractors/:id/files', requireAuth, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT id, filename, mime_type, size_bytes, uploaded_at FROM attachments WHERE contractor_id = $1 ORDER BY uploaded_at DESC',
      [req.params.id]
    );
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd odczytu załączników.' });
  }
});

app.post('/api/contractors/:id/files', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Brak pliku w żądaniu.' });
    const r = await pool.query(
      `INSERT INTO attachments (contractor_id, filename, mime_type, size_bytes, file_data)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, filename, mime_type, size_bytes, uploaded_at`,
      [req.params.id, req.file.originalname, req.file.mimetype || 'application/octet-stream', req.file.size, req.file.buffer]
    );
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    if (err && err.code === '23503') {
      return res.status(404).json({ error: 'Kontrahent nie istnieje - zapisz go najpierw.' });
    }
    res.status(500).json({ error: 'Błąd zapisu pliku.' });
  }
});

app.get('/api/files/:fileId', requireAuth, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT filename, mime_type, file_data FROM attachments WHERE id = $1',
      [req.params.fileId]
    );
    if (!r.rows[0]) return res.status(404).send('Nie znaleziono pliku.');
    const f = r.rows[0];
    res.set('Content-Type', f.mime_type || 'application/octet-stream');
    res.set('Content-Disposition', 'inline; filename="' + encodeURIComponent(f.filename) + '"');
    res.send(f.file_data);
  } catch (err) {
    console.error(err);
    res.status(500).send('Błąd pobierania pliku.');
  }
});

app.delete('/api/files/:fileId', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM attachments WHERE id = $1', [req.params.fileId]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd usuwania pliku.' });
  }
});

/* ======================= STATYKA / STRONY ======================= */
// public/ zawiera WYŁĄCZNIE stronę logowania (dostępną bez autoryzacji)
app.use(express.static(path.join(__dirname, 'public')));

// private/app.html jest serwowany tylko przez poniższe trasy, chronione sesją.
// Katalog private/ NIE jest zarejestrowany jako static, więc nie da się go pobrać z pominięciem logowania.
function serveApp(req, res) {
  if (!(req.session && req.session.authed)) {
    return res.redirect('/login.html');
  }
  res.sendFile(path.join(__dirname, 'private', 'app.html'));
}
app.get('/', serveApp);
app.get('/app.html', serveApp);

/* ======================= START ======================= */
initSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log('Serwer działa na porcie ' + PORT);
    });
  })
  .catch((err) => {
    console.error('Nie udało się zainicjalizować bazy danych:', err);
    process.exit(1);
  });
