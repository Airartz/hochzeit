const express = require('express');
const router = express.Router();
const { getDb } = require('../config/database');

// POST /api/likes/:mediaId – Like toggeln
router.post('/:mediaId', (req, res) => {
    try {
        const db = getDb();
        const mediaId = parseInt(req.params.mediaId);
        const { guest_uid } = req.body;

        if (!guest_uid) {
            return res.status(400).json({ error: 'guest_uid erforderlich' });
        }

        // Prüfen ob bereits geliked
        const existing = db.prepare(
            'SELECT id FROM media_likes WHERE media_id = ? AND guest_uid = ?'
        ).get(mediaId, guest_uid);

        if (existing) {
            // Unlike – Like entfernen
            db.prepare('DELETE FROM media_likes WHERE media_id = ? AND guest_uid = ?')
                .run(mediaId, guest_uid);
        } else {
            // Like hinzufügen
            db.prepare('INSERT INTO media_likes (media_id, guest_uid) VALUES (?, ?)')
                .run(mediaId, guest_uid);
        }

        // Aktuelle Like-Anzahl zurückgeben
        const count = db.prepare('SELECT COUNT(*) as count FROM media_likes WHERE media_id = ?')
            .get(mediaId);

        res.json({
            success: true,
            liked: !existing,
            likes: count.count
        });
    } catch (err) {
        console.error('Like Fehler:', err);
        res.status(500).json({ error: 'Server-Fehler' });
    }
});

// GET /api/likes/:mediaId – Like-Status für ein Medium
router.get('/:mediaId', (req, res) => {
    try {
        const db = getDb();
        const mediaId = parseInt(req.params.mediaId);
        const guestUid = req.query.guest_uid;

        const count = db.prepare('SELECT COUNT(*) as count FROM media_likes WHERE media_id = ?')
            .get(mediaId);

        let liked = false;
        if (guestUid) {
            const existing = db.prepare(
                'SELECT id FROM media_likes WHERE media_id = ? AND guest_uid = ?'
            ).get(mediaId, guestUid);
            liked = !!existing;
        }

        res.json({ likes: count.count, liked });
    } catch (err) {
        console.error('Like Status Fehler:', err);
        res.status(500).json({ error: 'Server-Fehler' });
    }
});

// GET /api/likes – Like-Daten für mehrere Medien (Batch)
router.get('/', (req, res) => {
    try {
        const db = getDb();
        const guestUid = req.query.guest_uid || '';

        // Alle Likes gruppiert nach media_id
        const likes = db.prepare(
            'SELECT media_id, COUNT(*) as count FROM media_likes GROUP BY media_id'
        ).all();

        const likesMap = {};
        likes.forEach(l => { likesMap[l.media_id] = l.count; });

        // Vom Gast gelikte Medien
        let userLikes = [];
        if (guestUid) {
            userLikes = db.prepare(
                'SELECT media_id FROM media_likes WHERE guest_uid = ?'
            ).all(guestUid).map(r => r.media_id);
        }

        res.json({ likesMap, userLikes });
    } catch (err) {
        console.error('Batch Likes Fehler:', err);
        res.status(500).json({ error: 'Server-Fehler' });
    }
});

module.exports = router;
