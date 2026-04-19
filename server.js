require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDatabase } = require('./config/database');
const { generateQRCode, generateQRCodeSVG } = require('./utils/qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Countdown-Modus Middleware (VOR statischen Dateien!)
app.use((req, res, next) => {
    // API, Admin, Uploads, Assets und countdown.html durchlassen
    if (
        req.path.startsWith('/api/') ||
        req.path.startsWith('/admin') ||
        req.path.startsWith('/uploads/') ||
        req.path.startsWith('/css/') ||
        req.path.startsWith('/js/') ||
        req.path === '/countdown.html' ||
        req.path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/)
    ) {
        return next();
    }

    try {
        const { getDb } = require('./config/database');
        const db = getDb();
        const settings = db.prepare('SELECT countdown_enabled FROM gallery_settings WHERE id = 1').get();

        if (settings && settings.countdown_enabled === 1) {
            return res.sendFile(path.join(__dirname, 'public', 'countdown.html'));
        }
    } catch (e) {
        // DB noch nicht initialisiert → normal weiter
    }

    next();
});

// Statische Dateien
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Upload-Ordner erstellen
const dirs = ['uploads', 'uploads/media', 'uploads/thumbnails', 'uploads/logo'];
dirs.forEach(dir => {
    const fullPath = path.join(__dirname, dir);
    if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
    }
});

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/gallery', require('./routes/gallery'));
app.use('/api/albums', require('./routes/albums'));
app.use('/api/media', require('./routes/media'));
app.use('/api/challenges', require('./routes/challenges'));
app.use('/api/slideshow', require('./routes/slideshow'));
app.use('/api/likes', require('./routes/likes'));
app.use('/api/guests', require('./routes/guests'));
app.use('/api/update', require('./routes/update'));

// QR-Code API
app.get('/api/qrcode', async (req, res) => {
    try {
        const { url, format = 'png' } = req.query;
        const targetUrl = url || `http://${HOST}:${PORT}`;

        if (format === 'svg') {
            const svg = await generateQRCodeSVG(targetUrl);
            res.setHeader('Content-Type', 'image/svg+xml');
            res.send(svg);
        } else {
            const dataUrl = await generateQRCode(targetUrl);
            res.json({ qrcode: dataUrl, url: targetUrl });
        }
    } catch (err) {
        console.error('QR-Code API Fehler:', err);
        res.status(500).json({ error: 'QR-Code Generierung fehlgeschlagen' });
    }
});

// Schöne URLs (ohne .html)
const cleanRoutes = {
    '/galerie': 'gallery.html',
    '/hochladen': 'upload.html',
    '/spiel': 'challenges.html',
    '/diashow': 'slideshow.html',
};

Object.entries(cleanRoutes).forEach(([route, file]) => {
    app.get(route, (req, res) => {
        res.sendFile(path.join(__dirname, 'public', file));
    });
});

// SPA Fallback – alle nicht-API Routen zur index.html
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/') && !req.path.startsWith('/uploads/')) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
});

// Error Handler
app.use((err, req, res, next) => {
    console.error('Server Fehler:', err);
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'Datei zu groß' });
    }
    res.status(500).json({ error: 'Server-Fehler' });
});

// Server starten
async function start() {
    try {
        await initDatabase();
        app.listen(PORT, () => {
            console.log(`\n🎉 Hochzeits-Galerie Server läuft!`);
            console.log(`📸 Galerie:    http://localhost:${PORT}`);
            console.log(`🔧 Admin:      http://localhost:${PORT}/admin/login.html`);
            console.log(`📺 Diashow:    http://localhost:${PORT}/slideshow.html`);
            console.log(`\n`);
        });
    } catch (err) {
        console.error('❌ Server-Start fehlgeschlagen:', err);
        process.exit(1);
    }
}

start();

