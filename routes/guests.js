const express = require('express');
const router = express.Router();
const { getDb } = require('../config/database');
const authMiddleware = require('../middleware/auth');

// GET /api/guests – Alle Gäste mit Statistiken
router.get('/', authMiddleware, (req, res) => {
    try {
        const db = getDb();

        // Alle einzigartigen Gästenamen aus uploads
        const guests = db.prepare(`
            SELECT 
                m.guest_name,
                COUNT(m.id) as uploads,
                SUM(CASE WHEN m.file_type = 'photo' THEN 1 ELSE 0 END) as photos,
                SUM(CASE WHEN m.file_type = 'video' THEN 1 ELSE 0 END) as videos,
                MIN(m.uploaded_at) as first_upload,
                MAX(m.uploaded_at) as last_upload
            FROM media m
            GROUP BY m.guest_name
            ORDER BY m.uploaded_at DESC
        `).all();

        // Likes-Statistiken pro Gast
        // Likes erhalten = Likes auf Fotos dieses Gastes
        let likesReceived = {};
        try {
            const received = db.prepare(`
                SELECT m.guest_name, COUNT(ml.id) as cnt
                FROM media_likes ml
                JOIN media m ON ml.media_id = m.id
                GROUP BY m.guest_name
            `).all();
            received.forEach(r => { likesReceived[r.guest_name] = r.cnt; });
        } catch (e) { }

        // Likes gegeben = Likes die ein guest_uid vergeben hat
        // Da guest_uid != guest_name, versuchen wir über die media-Zuordnung
        let likesGiven = {};
        try {
            const given = db.prepare(`
                SELECT guest_uid, COUNT(*) as cnt
                FROM media_likes
                GROUP BY guest_uid
            `).all();
            given.forEach(g => { likesGiven[g.guest_uid] = g.cnt; });
        } catch (e) { }

        // Challenge-Submissions pro Gast
        let challengeSubmissions = {};
        try {
            const subs = db.prepare(`
                SELECT m.guest_name, COUNT(cs.id) as cnt
                FROM challenge_submissions cs
                JOIN media m ON cs.media_id = m.id
                GROUP BY m.guest_name
            `).all();
            subs.forEach(s => { challengeSubmissions[s.guest_name] = s.cnt; });
        } catch (e) { }

        // Alles zusammenführen
        const result = guests.map(g => ({
            guest_name: g.guest_name,
            uploads: g.uploads,
            photos: g.photos,
            videos: g.videos,
            likes_received: likesReceived[g.guest_name] || 0,
            likes_given: likesGiven[g.guest_name] || 0,
            challenges: challengeSubmissions[g.guest_name] || 0,
            first_upload: g.first_upload,
            last_upload: g.last_upload
        }));

        res.json({
            guests: result,
            total: result.length
        });
    } catch (err) {
        console.error('Guests Fehler:', err);
        res.status(500).json({ error: 'Server-Fehler' });
    }
});

module.exports = router;
