const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../config/database');
const authMiddleware = require('../middleware/auth');

// Logo Upload
const logoStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '..', 'uploads', 'logo');
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `logo${ext}`);
    }
});
const uploadLogo = multer({ storage: logoStorage, limits: { fileSize: 5 * 1024 * 1024 } });

// GET /api/gallery – Öffentlich
router.get('/', (req, res) => {
    try {
        const db = getDb();
        const row = db.prepare('SELECT * FROM gallery_settings WHERE id = 1').get();
        res.json(row || {});
    } catch (err) {
        console.error('Gallery Settings Fehler:', err);
        res.status(500).json({ error: 'Server-Fehler' });
    }
});

// PUT /api/gallery – Admin
router.put('/', authMiddleware, uploadLogo.single('logo'), (req, res) => {
    try {
        const db = getDb();
        const {
            title, subtitle, welcome_text, primary_color, secondary_color,
            background_color, couple_names, wedding_date,
            slideshow_speed, slideshow_transition, allow_guest_download,
            download_disabled_message, countdown_enabled, countdown_date,
            countdown_heading, countdown_text,
            gallery_url, slideshow_sequences, slideshow_sequence_interval,
            site_template
        } = req.body;

        let logoPath = undefined;
        if (req.file) {
            logoPath = `/uploads/logo/${req.file.filename}`;
        }

        const updates = [];
        const values = [];

        const fields = {
            title, subtitle, welcome_text, primary_color, secondary_color,
            background_color, couple_names, wedding_date,
            slideshow_speed, slideshow_transition, allow_guest_download,
            download_disabled_message, countdown_enabled, countdown_date,
            countdown_heading, countdown_text,
            gallery_url, slideshow_sequences, slideshow_sequence_interval,
            site_template
        };

        for (const [key, value] of Object.entries(fields)) {
            if (value !== undefined && (value !== '' || key === 'gallery_url')) {
                updates.push(`${key} = ?`);
                if (key === 'allow_guest_download' || key === 'countdown_enabled') {
                    values.push(value === 'true' || value === true ? 1 : 0);
                } else {
                    values.push(value);
                }
            }
        }

        if (logoPath) {
            updates.push('logo_path = ?');
            values.push(logoPath);
        }

        if (updates.length > 0) {
            db.prepare(`UPDATE gallery_settings SET ${updates.join(', ')} WHERE id = 1`).run(...values);
        }

        const row = db.prepare('SELECT * FROM gallery_settings WHERE id = 1').get();
        res.json({ success: true, settings: row });
    } catch (err) {
        console.error('Gallery Update Fehler:', err);
        res.status(500).json({ error: 'Server-Fehler' });
    }
});

module.exports = router;
