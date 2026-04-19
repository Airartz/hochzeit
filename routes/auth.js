const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../config/database');
const authMiddleware = require('../middleware/auth');

// POST /api/auth/setup – Erstmaliges Admin-Konto
router.post('/setup', (req, res) => {
    try {
        const db = getDb();
        const existing = db.prepare('SELECT id FROM admins LIMIT 1').get();
        if (existing) {
            return res.status(400).json({ error: 'Admin existiert bereits' });
        }

        const { email, password } = req.body;
        if (!email || !password || password.length < 6) {
            return res.status(400).json({ error: 'E-Mail und Passwort (min. 6 Zeichen) erforderlich' });
        }

        const hash = bcrypt.hashSync(password, 10);
        db.prepare('INSERT INTO admins (email, password_hash) VALUES (?, ?)').run(email, hash);

        res.json({ success: true, message: 'Admin-Konto erstellt' });
    } catch (err) {
        console.error('Setup Fehler:', err);
        res.status(500).json({ error: 'Server-Fehler' });
    }
});

// POST /api/auth/login
router.post('/login', (req, res) => {
    try {
        const db = getDb();
        const { email, password } = req.body;
        const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(email);

        if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
            return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
        }

        const token = jwt.sign(
            { id: admin.id, email: admin.email },
            process.env.JWT_SECRET || 'hochzeit-secret-2026',
            { expiresIn: '7d' }
        );

        res.json({ token, email: admin.email });
    } catch (err) {
        console.error('Login Fehler:', err);
        res.status(500).json({ error: 'Server-Fehler' });
    }
});

// GET /api/auth/check – Admin-Status prüfen
router.get('/check', (req, res) => {
    try {
        const db = getDb();
        const admin = db.prepare('SELECT id FROM admins LIMIT 1').get();
        res.json({ hasAdmin: !!admin });
    } catch (err) {
        res.status(500).json({ error: 'Server-Fehler' });
    }
});

// GET /api/auth/me – Eingeloggte Admin-Info
router.get('/me', authMiddleware, (req, res) => {
    res.json({ id: req.admin.id, email: req.admin.email });
});

module.exports = router;
