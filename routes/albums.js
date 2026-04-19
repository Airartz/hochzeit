const express = require('express');
const router = express.Router();
const { getDb } = require('../config/database');
const authMiddleware = require('../middleware/auth');

// GET /api/albums – Alle öffentlichen Alben (+ privat für Admin)
router.get('/', (req, res) => {
    try {
        const db = getDb();
        const isAdmin = req.headers.authorization;
        let rows;

        if (isAdmin) {
            rows = db.prepare(`
                SELECT a.*, COUNT(m.id) as media_count 
                FROM albums a LEFT JOIN media m ON a.id = m.album_id 
                GROUP BY a.id ORDER BY a.sort_order, a.created_at
            `).all();
        } else {
            rows = db.prepare(`
                SELECT a.*, COUNT(m.id) as media_count 
                FROM albums a LEFT JOIN media m ON a.id = m.album_id 
                WHERE a.is_private = 0 
                GROUP BY a.id ORDER BY a.sort_order, a.created_at
            `).all();
        }

        res.json(rows);
    } catch (err) {
        console.error('Albums List Fehler:', err);
        res.status(500).json({ error: 'Server-Fehler' });
    }
});

// GET /api/albums/:id – Album Details
router.get('/:id', (req, res) => {
    try {
        const db = getDb();
        const album = db.prepare('SELECT * FROM albums WHERE id = ?').get(req.params.id);
        if (!album) return res.status(404).json({ error: 'Album nicht gefunden' });

        const media = db.prepare('SELECT * FROM media WHERE album_id = ? ORDER BY uploaded_at DESC').all(req.params.id);
        res.json({ ...album, media });
    } catch (err) {
        console.error('Album Detail Fehler:', err);
        res.status(500).json({ error: 'Server-Fehler' });
    }
});

// POST /api/albums – Album erstellen (Admin)
router.post('/', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const { name, description = '', is_private = false } = req.body;
        if (!name) return res.status(400).json({ error: 'Name erforderlich' });

        const result = db.prepare(
            'INSERT INTO albums (name, description, is_private) VALUES (?, ?, ?)'
        ).run(name, description, is_private ? 1 : 0);

        res.json({ success: true, id: result.lastInsertRowid });
    } catch (err) {
        console.error('Album Create Fehler:', err);
        res.status(500).json({ error: 'Server-Fehler' });
    }
});

// PUT /api/albums/:id – Album bearbeiten (Admin)
router.put('/:id', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const { name, description, is_private, sort_order } = req.body;
        const updates = [];
        const values = [];

        if (name !== undefined) { updates.push('name = ?'); values.push(name); }
        if (description !== undefined) { updates.push('description = ?'); values.push(description); }
        if (is_private !== undefined) { updates.push('is_private = ?'); values.push(is_private ? 1 : 0); }
        if (sort_order !== undefined) { updates.push('sort_order = ?'); values.push(sort_order); }

        if (updates.length === 0) return res.status(400).json({ error: 'Keine Änderungen' });

        values.push(req.params.id);
        db.prepare(`UPDATE albums SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        res.json({ success: true });
    } catch (err) {
        console.error('Album Update Fehler:', err);
        res.status(500).json({ error: 'Server-Fehler' });
    }
});

// DELETE /api/albums/:id – Album löschen (Admin)
router.delete('/:id', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        if (req.params.id == 1) {
            return res.status(400).json({ error: 'Standard-Album kann nicht gelöscht werden' });
        }

        db.prepare('UPDATE media SET album_id = 1 WHERE album_id = ?').run(req.params.id);
        db.prepare('DELETE FROM albums WHERE id = ?').run(req.params.id);

        res.json({ success: true });
    } catch (err) {
        console.error('Album Delete Fehler:', err);
        res.status(500).json({ error: 'Server-Fehler' });
    }
});

module.exports = router;
