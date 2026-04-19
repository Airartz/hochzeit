const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

// Datenbank-Datei im Projektordner
const DB_PATH = path.join(__dirname, '..', 'data', 'hochzeit.db');

// Ordner erstellen falls nötig
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

let db = null;

// Wrapper-Klasse für einheitliche API
class Database {
    constructor(sqlDb) {
        this.sqlDb = sqlDb;
    }

    // Speichert DB auf Festplatte
    save() {
        const data = this.sqlDb.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(DB_PATH, buffer);
    }

    // SQL ausführen (CREATE TABLE etc.)
    exec(sql) {
        this.sqlDb.run(sql);
        this.save();
    }

    // Prepared Statement mit Hilfsmethoden
    prepare(sql) {
        const self = this;
        return {
            // Ein Ergebnis als Objekt
            get(...params) {
                const stmt = self.sqlDb.prepare(sql);
                if (params.length > 0) stmt.bind(params);
                if (stmt.step()) {
                    const result = stmt.getAsObject();
                    stmt.free();
                    return result;
                }
                stmt.free();
                return undefined;
            },

            // Alle Ergebnisse als Array von Objekten
            all(...params) {
                const stmt = self.sqlDb.prepare(sql);
                if (params.length > 0) stmt.bind(params);
                const results = [];
                while (stmt.step()) {
                    results.push(stmt.getAsObject());
                }
                stmt.free();
                return results;
            },

            // Ausführen (INSERT/UPDATE/DELETE) → gibt { lastInsertRowid, changes }
            run(...params) {
                self.sqlDb.run(sql, params);
                const lastId = self.sqlDb.exec("SELECT last_insert_rowid() as id")[0]?.values[0][0];
                const changes = self.sqlDb.getRowsModified();
                self.save();
                return { lastInsertRowid: lastId, changes };
            }
        };
    }
}

async function initDatabase() {
    const SQL = await initSqlJs();

    // Existierende DB laden oder neue erstellen
    if (fs.existsSync(DB_PATH)) {
        const buffer = fs.readFileSync(DB_PATH);
        db = new Database(new SQL.Database(buffer));
        console.log('✅ SQLite Datenbank geladen:', DB_PATH);
    } else {
        db = new Database(new SQL.Database());
        console.log('✅ Neue SQLite Datenbank erstellt:', DB_PATH);
    }

    // Tabellen erstellen
    db.exec(`
        CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS gallery_settings (
            id INTEGER PRIMARY KEY DEFAULT 1,
            title TEXT DEFAULT 'Unsere Hochzeit',
            subtitle TEXT DEFAULT '',
            welcome_text TEXT DEFAULT 'Teilt eure schönsten Momente mit uns!',
            couple_names TEXT DEFAULT '',
            wedding_date DATE DEFAULT NULL,
            primary_color TEXT DEFAULT '#C9A84C',
            secondary_color TEXT DEFAULT '#2C2C2C',
            background_color TEXT DEFAULT '#FFF8F0',
            logo_path TEXT DEFAULT NULL,
            slideshow_speed INTEGER DEFAULT 5,
            slideshow_transition TEXT DEFAULT 'fade',
            allow_guest_download INTEGER DEFAULT 1,
            download_disabled_message TEXT DEFAULT 'Die Fotos stehen bald zum Download bereit! Schaut nach der Hochzeit nochmal vorbei 📸',
            countdown_enabled INTEGER DEFAULT 0,
            countdown_date DATETIME DEFAULT NULL,
            gallery_url TEXT DEFAULT '',
            slideshow_sequences TEXT DEFAULT '[]',
            slideshow_sequence_interval INTEGER DEFAULT 20,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Default-Einstellungen einfügen
    const existing = db.prepare('SELECT id FROM gallery_settings WHERE id = 1').get();
    if (!existing) {
        db.prepare('INSERT INTO gallery_settings (id) VALUES (1)').run();
    }

    // Neue Spalten hinzufügen (für bestehende Datenbanken)
    const migrations = [
        "ALTER TABLE gallery_settings ADD COLUMN download_disabled_message TEXT DEFAULT 'Die Fotos stehen bald zum Download bereit! Schaut nach der Hochzeit nochmal vorbei 📸'",
        "ALTER TABLE gallery_settings ADD COLUMN countdown_enabled INTEGER DEFAULT 0",
        "ALTER TABLE gallery_settings ADD COLUMN countdown_date DATETIME DEFAULT NULL",
        "ALTER TABLE gallery_settings ADD COLUMN countdown_heading TEXT DEFAULT 'Wir heiraten!'",
        "ALTER TABLE gallery_settings ADD COLUMN countdown_text TEXT DEFAULT 'Bald geht es los! Wir freuen uns darauf, diesen besonderen Tag mit euch zu teilen.'",
        "ALTER TABLE gallery_settings ADD COLUMN gallery_url TEXT DEFAULT ''",
        "ALTER TABLE gallery_settings ADD COLUMN slideshow_sequences TEXT DEFAULT '[]'",
        "ALTER TABLE gallery_settings ADD COLUMN slideshow_sequence_interval INTEGER DEFAULT 20",
        "ALTER TABLE gallery_settings ADD COLUMN site_template TEXT DEFAULT 'classic'"
    ];
    for (const sql of migrations) {
        try { db.exec(sql); } catch (e) { /* Spalte existiert bereits */ }
    }

    db.exec(`
        CREATE TABLE IF NOT EXISTS albums (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL DEFAULT 'Hochzeit',
            description TEXT DEFAULT '',
            is_private INTEGER DEFAULT 0,
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Default-Album
    const defaultAlbum = db.prepare('SELECT id FROM albums WHERE id = 1').get();
    if (!defaultAlbum) {
        db.prepare("INSERT INTO albums (name, description) VALUES ('Hochzeit', 'Alle Fotos der Hochzeitsfeier')").run();
    }

    db.exec(`
        CREATE TABLE IF NOT EXISTS media (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            album_id INTEGER DEFAULT 1,
            guest_name TEXT NOT NULL,
            original_filename TEXT NOT NULL,
            stored_filename TEXT NOT NULL,
            thumbnail_filename TEXT DEFAULT NULL,
            file_type TEXT DEFAULT 'photo',
            mime_type TEXT DEFAULT '',
            file_size INTEGER DEFAULT 0,
            width INTEGER DEFAULT NULL,
            height INTEGER DEFAULT NULL,
            uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE SET DEFAULT
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS challenges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            emoji TEXT DEFAULT '📸',
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS challenge_submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            challenge_id INTEGER NOT NULL,
            media_id INTEGER NOT NULL,
            submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (challenge_id) REFERENCES challenges(id) ON DELETE CASCADE,
            FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS media_likes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            media_id INTEGER NOT NULL,
            guest_uid TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(media_id, guest_uid),
            FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
        )
    `);
}

function getDb() {
    return db;
}

module.exports = { getDb, initDatabase };
