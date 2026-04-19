const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const archiver = require('archiver');
const { execFile } = require('child_process');
const { getDb } = require('../config/database');
const authMiddleware = require('../middleware/auth');

// ===== Video-Komprimierung (Hintergrund) =====
let ffmpegAvailable = null;

function checkFfmpeg() {
    return new Promise((resolve) => {
        execFile('ffmpeg', ['-version'], (err) => {
            ffmpegAvailable = !err;
            if (ffmpegAvailable) {
                console.log('✅ FFmpeg gefunden – Video-Komprimierung aktiv');
            } else {
                console.log('⚠️ FFmpeg nicht gefunden – Videos werden nicht komprimiert');
            }
            resolve(ffmpegAvailable);
        });
    });
}
checkFfmpeg();

// Video im Hintergrund komprimieren (nach Upload)
function compressVideo(filePath, mediaId) {
    if (!ffmpegAvailable) return;

    const ext = path.extname(filePath);
    const tempPath = filePath.replace(ext, `_compressed${ext}`);
    const originalSize = fs.statSync(filePath).size;

    // Nur komprimieren wenn > 5MB
    if (originalSize < 5 * 1024 * 1024) {
        console.log(`📹 Video ${mediaId} ist klein (${(originalSize / 1024 / 1024).toFixed(1)}MB) – übersprungen`);
        return;
    }

    console.log(`📹 Komprimiere Video ${mediaId} (${(originalSize / 1024 / 1024).toFixed(1)}MB)...`);

    // H.264, CRF 23 = visuell verlustfrei, gute Kompression
    // -preset medium = guter Kompromiss zwischen Geschwindigkeit und Kompression
    // -movflags +faststart = schnelles Streaming im Browser
    const args = [
        '-i', filePath,
        '-c:v', 'libx264',
        '-crf', '23',
        '-preset', 'medium',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        '-y',
        tempPath
    ];

    execFile('ffmpeg', args, { timeout: 300000 }, (err) => {
        try {
            if (err) {
                console.error(`❌ Video-Komprimierung ${mediaId} fehlgeschlagen:`, err.message);
                // Temporäre Datei aufräumen
                if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                return;
            }

            const newSize = fs.statSync(tempPath).size;
            const savings = ((1 - newSize / originalSize) * 100).toFixed(1);

            // Nur ersetzen wenn tatsächlich kleiner
            if (newSize < originalSize) {
                fs.renameSync(tempPath, filePath);

                // DB-Dateigröße aktualisieren
                try {
                    const db = getDb();
                    db.prepare('UPDATE media SET file_size = ? WHERE id = ?').run(newSize, mediaId);
                } catch (e) { }

                console.log(`✅ Video ${mediaId} komprimiert: ${(originalSize / 1024 / 1024).toFixed(1)}MB → ${(newSize / 1024 / 1024).toFixed(1)}MB (${savings}% gespart)`);
            } else {
                // Komprimierte Version ist größer/gleich → verwerfen
                fs.unlinkSync(tempPath);
                console.log(`ℹ️ Video ${mediaId} bereits optimal – keine Komprimierung nötig`);
            }
        } catch (cleanupErr) {
            console.error('Video-Komprimierung Aufräumen Fehler:', cleanupErr.message);
            if (fs.existsSync(tempPath)) try { fs.unlinkSync(tempPath); } catch (e) { }
        }
    });
}

// Upload Storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '..', 'uploads', 'media');
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 100) * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp|heic|heif|mp4|mov|avi|webm|mkv/;
        const ext = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mime = /^(image|video)\//.test(file.mimetype);
        if (ext && mime) {
            cb(null, true);
        } else {
            cb(new Error('Nur Bilder und Videos erlaubt'));
        }
    }
});

// Thumbnail erstellen
async function createThumbnail(filePath, filename) {
    const thumbDir = path.join(__dirname, '..', 'uploads', 'thumbnails');
    fs.mkdirSync(thumbDir, { recursive: true });
    const thumbName = `thumb_${filename.replace(path.extname(filename), '.webp')}`;
    const thumbPath = path.join(thumbDir, thumbName);

    try {
        await sharp(filePath)
            .resize(400, 400, { fit: 'cover' })
            .webp({ quality: 80 })
            .toFile(thumbPath);
        return thumbName;
    } catch (err) {
        console.error('Thumbnail Fehler:', err.message);
        return null;
    }
}

// ===== Upload-Warteschlange =====
const MAX_CONCURRENT_UPLOADS = 10;
let activeUploads = 0;
const uploadQueue = [];

function acquireUploadSlot() {
    return new Promise((resolve) => {
        if (activeUploads < MAX_CONCURRENT_UPLOADS) {
            activeUploads++;
            resolve();
        } else {
            uploadQueue.push(resolve);
        }
    });
}

function releaseUploadSlot() {
    if (uploadQueue.length > 0) {
        const next = uploadQueue.shift();
        next(); // nächster in der Warteschlange darf starten
    } else {
        activeUploads--;
    }
}

// GET /api/media/queue-status – Warteschlangen-Status
router.get('/queue-status', (req, res) => {
    res.json({
        active: activeUploads,
        queued: uploadQueue.length,
        max: MAX_CONCURRENT_UPLOADS
    });
});

// POST /api/media/upload – Gäste Upload (kein Login nötig)
router.post('/upload', upload.array('files', 50), async (req, res) => {
    // Auf Upload-Slot warten (Queue)
    await acquireUploadSlot();
    try {
        const db = getDb();
        const { guest_name, album_id = 1, challenge_id } = req.body;

        if (!guest_name || guest_name.trim().length === 0) {
            return res.status(400).json({ error: 'Bitte gib deinen Vornamen an' });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'Keine Dateien hochgeladen' });
        }

        const results = [];

        for (const file of req.files) {
            const fileType = file.mimetype.startsWith('image') ? 'photo' : 'video';
            let thumbnailFilename = null;
            let width = null;
            let height = null;

            if (fileType === 'photo') {
                thumbnailFilename = await createThumbnail(file.path, file.filename);
                try {
                    const metadata = await sharp(file.path).metadata();
                    width = metadata.width;
                    height = metadata.height;
                } catch (e) { /* ignore */ }
            }

            const result = db.prepare(
                `INSERT INTO media (album_id, guest_name, original_filename, stored_filename, 
                 thumbnail_filename, file_type, mime_type, file_size, width, height)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(
                album_id, guest_name.trim(), file.originalname, file.filename,
                thumbnailFilename, fileType, file.mimetype, file.size, width, height
            );

            // Challenge Einreichung
            if (challenge_id) {
                db.prepare(
                    'INSERT INTO challenge_submissions (challenge_id, media_id) VALUES (?, ?)'
                ).run(challenge_id, result.lastInsertRowid);
            }

            // Backup-Kopie erstellen
            try {
                const backupDir = path.join(__dirname, '..', 'backup', 'media');
                fs.mkdirSync(backupDir, { recursive: true });
                fs.copyFileSync(file.path, path.join(backupDir, file.filename));
                if (thumbnailFilename) {
                    const backupThumbDir = path.join(__dirname, '..', 'backup', 'thumbnails');
                    fs.mkdirSync(backupThumbDir, { recursive: true });
                    const thumbSrc = path.join(__dirname, '..', 'uploads', 'thumbnails', thumbnailFilename);
                    if (fs.existsSync(thumbSrc)) {
                        fs.copyFileSync(thumbSrc, path.join(backupThumbDir, thumbnailFilename));
                    }
                }
            } catch (backupErr) {
                console.error('Backup Fehler:', backupErr.message);
            }

            // Video-Komprimierung im Hintergrund starten (nach Backup!)
            if (fileType === 'video') {
                compressVideo(file.path, result.lastInsertRowid);
            }

            results.push({
                id: result.lastInsertRowid,
                filename: file.originalname,
                type: fileType,
                size: file.size
            });
        }

        res.json({
            success: true,
            message: `${results.length} Datei(en) erfolgreich hochgeladen!`,
            uploaded: results
        });
    } catch (err) {
        console.error('Upload Fehler:', err);
        res.status(500).json({ error: 'Upload fehlgeschlagen' });
    } finally {
        releaseUploadSlot();
    }
});

// GET /api/media – Alle Medien (mit optionalem Album-Filter)
router.get('/', (req, res) => {
    try {
        const db = getDb();
        const { album_id, page = 1, limit = 50 } = req.query;
        const offset = (page - 1) * limit;

        let query = 'SELECT m.*, a.name as album_name FROM media m LEFT JOIN albums a ON m.album_id = a.id';
        let countQuery = 'SELECT COUNT(*) as total FROM media m';
        const params = [];
        const countParams = [];

        if (album_id) {
            query += ' WHERE m.album_id = ?';
            countQuery += ' WHERE m.album_id = ?';
            params.push(parseInt(album_id));
            countParams.push(parseInt(album_id));
        }

        query += ' ORDER BY m.uploaded_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const rows = db.prepare(query).all(...params);
        const countResult = db.prepare(countQuery).get(...countParams);

        res.json({
            media: rows,
            total: countResult.total,
            page: parseInt(page),
            limit: parseInt(limit)
        });
    } catch (err) {
        console.error('Media List Fehler:', err);
        res.status(500).json({ error: 'Server-Fehler' });
    }
});

// GET /api/media/stats – Statistiken
router.get('/stats', (req, res) => {
    try {
        const db = getDb();
        const photos = db.prepare("SELECT COUNT(*) as count FROM media WHERE file_type = 'photo'").get();
        const videos = db.prepare("SELECT COUNT(*) as count FROM media WHERE file_type = 'video'").get();
        const guests = db.prepare("SELECT COUNT(DISTINCT guest_name) as count FROM media").get();
        const totalSize = db.prepare("SELECT COALESCE(SUM(file_size), 0) as total FROM media").get();
        const albums = db.prepare("SELECT COUNT(*) as count FROM albums").get();

        res.json({
            photos: photos.count,
            videos: videos.count,
            guests: guests.count,
            albums: albums.count,
            totalSize: totalSize.total || 0
        });
    } catch (err) {
        console.error('Stats Fehler:', err);
        res.status(500).json({ error: 'Server-Fehler' });
    }
});

// GET /api/media/download/:id – Einzelner Download
router.get('/download/:id', (req, res) => {
    try {
        const db = getDb();

        // Privatsphäre prüfen
        const settings = db.prepare('SELECT allow_guest_download FROM gallery_settings WHERE id = 1').get();
        const hasAdminToken = req.headers.authorization;
        if (settings && !settings.allow_guest_download && !hasAdminToken) {
            return res.status(403).json({ error: 'Downloads sind deaktiviert' });
        }

        const media = db.prepare('SELECT * FROM media WHERE id = ?').get(parseInt(req.params.id));
        if (!media) return res.status(404).json({ error: 'Datei nicht gefunden' });

        const filePath = path.join(__dirname, '..', 'uploads', 'media', media.stored_filename);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Datei nicht gefunden' });

        res.download(filePath, media.original_filename);
    } catch (err) {
        console.error('Download Fehler:', err);
        res.status(500).json({ error: 'Server-Fehler' });
    }
});

// GET /api/media/download-all – ZIP Download aller Medien
router.get('/download-all', (req, res) => {
    try {
        const db = getDb();

        // Privatsphäre prüfen
        const settings = db.prepare('SELECT allow_guest_download FROM gallery_settings WHERE id = 1').get();
        const hasAdminToken = req.headers.authorization;
        if (settings && !settings.allow_guest_download && !hasAdminToken) {
            return res.status(403).json({ error: 'Downloads sind deaktiviert' });
        }

        const { album_id } = req.query;
        let query = 'SELECT m.*, a.name as album_name FROM media m LEFT JOIN albums a ON m.album_id = a.id';
        const params = [];

        if (album_id) {
            query += ' WHERE m.album_id = ?';
            params.push(parseInt(album_id));
        }

        const rows = db.prepare(query).all(...params);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Keine Dateien zum Herunterladen' });
        }

        const zipName = album_id ? `hochzeit-album-${album_id}.zip` : 'hochzeit-alle-fotos.zip';
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

        const archive = archiver('zip', { zlib: { level: 5 } });
        archive.pipe(res);

        for (const media of rows) {
            const filePath = path.join(__dirname, '..', 'uploads', 'media', media.stored_filename);
            if (fs.existsSync(filePath)) {
                const folder = media.album_name || 'Unsortiert';
                archive.file(filePath, { name: `${folder}/${media.original_filename}` });
            }
        }

        archive.finalize();
    } catch (err) {
        console.error('Download All Fehler:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Server-Fehler' });
        }
    }
});

// DELETE /api/media/reset-all – Alles löschen (Backup bleibt!)
router.delete('/reset-all', authMiddleware, (req, res) => {
    try {
        const db = getDb();

        // Anzahl für Rückmeldung
        let totalFiles = 0;
        try {
            const count = db.prepare('SELECT COUNT(*) as cnt FROM media').get();
            totalFiles = count ? count.cnt : 0;
        } catch (e) { }

        // Dateien aus uploads/media löschen
        const mediaDir = path.join(__dirname, '..', 'uploads', 'media');
        if (fs.existsSync(mediaDir)) {
            const files = fs.readdirSync(mediaDir);
            for (const file of files) {
                try { fs.unlinkSync(path.join(mediaDir, file)); } catch (e) { }
            }
        }

        // Dateien aus uploads/thumbnails löschen
        const thumbDir = path.join(__dirname, '..', 'uploads', 'thumbnails');
        if (fs.existsSync(thumbDir)) {
            const files = fs.readdirSync(thumbDir);
            for (const file of files) {
                try { fs.unlinkSync(path.join(thumbDir, file)); } catch (e) { }
            }
        }

        // Datenbank-Tabellen leeren (einzeln, falls Tabelle nicht existiert)
        try { db.prepare('DELETE FROM challenge_submissions').run(); } catch (e) { }
        try { db.prepare('DELETE FROM likes').run(); } catch (e) { }
        try { db.prepare('DELETE FROM media').run(); } catch (e) { }

        res.json({ success: true, deleted: totalFiles });
    } catch (err) {
        console.error('Reset Fehler:', err);
        res.status(500).json({ error: 'Reset fehlgeschlagen' });
    }
});

// DELETE /api/media/:id – Medium löschen (Admin)
router.delete('/:id', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const media = db.prepare('SELECT * FROM media WHERE id = ?').get(parseInt(req.params.id));
        if (!media) return res.status(404).json({ error: 'Datei nicht gefunden' });

        // Datei löschen
        const filePath = path.join(__dirname, '..', 'uploads', 'media', media.stored_filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        // Thumbnail löschen
        if (media.thumbnail_filename) {
            const thumbPath = path.join(__dirname, '..', 'uploads', 'thumbnails', media.thumbnail_filename);
            if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
        }

        db.prepare('DELETE FROM media WHERE id = ?').run(parseInt(req.params.id));
        res.json({ success: true });
    } catch (err) {
        console.error('Delete Fehler:', err);
        res.status(500).json({ error: 'Server-Fehler' });
    }
});

// PUT /api/media/:id/move – Medium verschieben (Admin)
router.put('/:id/move', authMiddleware, (req, res) => {
    try {
        const db = getDb();
        const { album_id } = req.body;
        db.prepare('UPDATE media SET album_id = ? WHERE id = ?').run(parseInt(album_id), parseInt(req.params.id));
        res.json({ success: true });
    } catch (err) {
        console.error('Move Fehler:', err);
        res.status(500).json({ error: 'Server-Fehler' });
    }
});

module.exports = router;
