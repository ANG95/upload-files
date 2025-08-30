require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const mime = require('mime-types');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const FILES_DIR = path.resolve(process.env.FILES_DIR || path.join(process.cwd(), 'files'));
const TMP_DIR = path.resolve(process.env.TMP_DIR || path.join(process.cwd(), 'tmp'));
const API_KEY = process.env.API_KEY || 'dev-key';
const MAX_UPLOAD = Number(process.env.MAX_UPLOAD || 50 * 1024 * 1024);

app.use(cors());          // útil si pruebas desde navegador
app.use(morgan('dev'));   // logs
app.use(express.json());

// Asegura carpetas
for (const d of [FILES_DIR, TMP_DIR]) if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
console.log('FILES_DIR =', FILES_DIR);
console.log('TMP_DIR   =', TMP_DIR);

// API key simple
app.use((req, res, next) => {
  const key = req.header('x-api-key');
  if (!key || key !== API_KEY) return res.status(401).json({ error: 'unauthorized' });
  next();
});

// Multer (subidas)
const upload = multer({
  dest: TMP_DIR,
  limits: { fileSize: MAX_UPLOAD },
  fileFilter: (req, file, cb) => {
    const ok = /^image\//.test(file.mimetype) || file.mimetype === 'application/octet-stream';
    if (!ok) return cb(new Error('Unsupported mime type'));
    cb(null, true);
  }
});

// Listar archivos
app.get('/files', (req, res) => {
  fs.readdir(FILES_DIR, { withFileTypes: true }, (err, entries) => {
    if (err) return res.status(500).json({ error: 'cannot list' });
    const files = entries.filter(e => e.isFile()).map(e => {
      const fp = path.join(FILES_DIR, e.name);
      const stat = fs.statSync(fp);
      return { name: e.name, size: stat.size, mtime: stat.mtimeMs, mime: mime.lookup(fp) || 'application/octet-stream' };
    });
    res.json(files);
  });
});

// Descargar por nombre
app.get('/files/:name', (req, res) => {
  const safe = path.basename(req.params.name);
  const fp = path.join(FILES_DIR, safe);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'not found' });
  res.setHeader('Content-Type', mime.lookup(fp) || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${safe}"`);
  fs.createReadStream(fp).pipe(res);
});

// Subir (campo form-data: file)
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });
  const original = path.basename(req.file.originalname).replace(/\s+/g, '_');
  const dest = path.join(FILES_DIR, original);
  const finalPath = fs.existsSync(dest) ? path.join(FILES_DIR, `${Date.now()}_${original}`) : dest;
  fs.rename(req.file.path, finalPath, (err) => {
    if (err) return res.status(500).json({ error: 'cannot move' });
    res.json({ ok: true, name: path.basename(finalPath) });
  });
});

// Errores (multer/otros)
app.use((err, req, res, next) => {
  if (err) {
    console.error('ERROR:', err.message);
    return res.status(400).json({ error: err.message });
  }
  next();
});

// Escucha en 0.0.0.0 para que el teléfono pueda conectar por IP LAN
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server on http://0.0.0.0:${PORT}`);
  console.log(`x-api-key: ${API_KEY}`);
});
