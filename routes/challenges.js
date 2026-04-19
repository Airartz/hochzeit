const express = require('express');
const router = express.Router();
const { getDb } = require('../config/database');
const authMiddleware = require('../middleware/auth');

// GET /api/challenges – Aktive Challenges
router.get('/', (req, res) => {
    try {
        const db = getDb();
        const showAll = req.query.all === 'true';
        let rows;

        if (showAll) {
            rows = db.prepare(`
                SELECT c.*, COUNT(cs.id) as submission_count 
                FROM challenges c LEFT JOIN challenge_submissions cs ON c.id = cs.challenge_id 
                GROUP BY c.id ORDER BY c.created_at DESC
            `).all();
        } else {
            rows = db.prepare(`
                SELECT c.*, COUNT(cs.id) as submission_count 
                FROM challenges c LEFT JOIN challenge_submissions cs ON c.id = cs.challenge_id 
                WHERE c.is_active = 1 
                GROUP BY c.id ORDER BY c.created_at DESC
            `).all();
        }

        res.json(rows);
    } catch (err) {
        console.error('Challenges List Fehler:', err);
        res.status(500).json({ error: 'Server-Fehler' });
    }
});

// GET /api/challenges/:id – Challenge Details
router.get('/:id', (req, res) => {
    try {
        const db = getDb();
        const challenge = db.prepare('SELECT * FROM challenges WHERE id = ?').get(parseInt(req.params.id));
        if (!challenge) return res.status(404).json({ error: 'Challenge nicht gefunden' });

        const submissions = db.prepare(`
            SELECT m.*, cs.submitted_at 
            FROM challenge_submissions cs JOIN media m ON cs.media_id = m.id 
            WHERE cs.challenge_id = ? ORDER BY cs.submitted_at DESC
        `).all(parseInt(req.params.id));

        res.json({ ...challenge, submissions });
    } catch (err) {
        console.error('Challenge Detail Fehler:', err);
        res.status(500).json({ error: 'Server-Fehler' });
    }
});

// POST /api/challenges – Challenge erstellen (Admin)
router.post('/', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const { title, description = '', emoji = '📸' } = req.body;
        if (!title) return res.status(400).json({ error: 'Titel erforderlich' });

        const result = db.prepare(
            'INSERT INTO challenges (title, description, emoji) VALUES (?, ?, ?)'
        ).run(title, description, emoji);

        res.json({ success: true, id: result.lastInsertRowid });
    } catch (err) {
        console.error('Challenge Create Fehler:', err);
        res.status(500).json({ error: 'Server-Fehler' });
    }
});

// PUT /api/challenges/:id – Challenge bearbeiten (Admin)
router.put('/:id', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const { title, description, emoji, is_active } = req.body;
        const updates = [];
        const values = [];

        if (title !== undefined) { updates.push('title = ?'); values.push(title); }
        if (description !== undefined) { updates.push('description = ?'); values.push(description); }
        if (emoji !== undefined) { updates.push('emoji = ?'); values.push(emoji); }
        if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active ? 1 : 0); }

        if (updates.length === 0) return res.status(400).json({ error: 'Keine Änderungen' });

        values.push(parseInt(req.params.id));
        db.prepare(`UPDATE challenges SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        res.json({ success: true });
    } catch (err) {
        console.error('Challenge Update Fehler:', err);
        res.status(500).json({ error: 'Server-Fehler' });
    }
});

// DELETE /api/challenges/:id – Challenge löschen (Admin)
router.delete('/:id', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        db.prepare('DELETE FROM challenges WHERE id = ?').run(parseInt(req.params.id));
        res.json({ success: true });
    } catch (err) {
        console.error('Challenge Delete Fehler:', err);
        res.status(500).json({ error: 'Server-Fehler' });
    }
});

module.exports = router;
