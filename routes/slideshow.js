const express = require('express');
const router = express.Router();
const { getDb } = require('../config/database');

// GET /api/slideshow/latest – Neueste Fotos für Live-Diashow
router.get('/latest', (req, res) => {
    try {
        const db = getDb();
        const since = req.query.since;
        let rows;

        if (since) {
            rows = db.prepare(
                "SELECT * FROM media WHERE file_type = 'photo' AND uploaded_at > ? ORDER BY uploaded_at DESC"
            ).all(since);
        } else {
            rows = db.prepare(
                "SELECT * FROM media WHERE file_type = 'photo' ORDER BY uploaded_at DESC LIMIT 20"
            ).all();
        }

        res.json(rows);
    } catch (err) {
        console.error('Slideshow Latest Fehler:', err);
        res.status(500).json({ error: 'Server-Fehler' });
    }
});

// GET /api/slideshow/all – Alle Fotos für Diashow
router.get('/all', (req, res) => {
    try {
        const db = getDb();
        const rows = db.prepare(
            "SELECT * FROM media WHERE file_type = 'photo' ORDER BY uploaded_at DESC"
        ).all();

        res.json(rows);
    } catch (err) {
        console.error('Slideshow All Fehler:', err);
        res.status(500).json({ error: 'Server-Fehler' });
    }
});

module.exports = router;
