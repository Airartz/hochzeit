const express = require('express');
const router = express.Router();
const https = require('https');
const { exec } = require('child_process');
const path = require('path');
const authMiddleware = require('../middleware/auth');

const GITHUB_USER = 'AirArtz';
const GITHUB_REPO = 'hochzeit';
const APP_DIR = path.join(__dirname, '..');

let pkg;
try { pkg = require('../package.json'); } catch (e) { pkg = { version: '1.0.0' }; }
const CURRENT_VERSION = pkg.version;

function githubGet(urlPath) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: urlPath,
            headers: { 'User-Agent': 'hochzeit-updater', 'Accept': 'application/vnd.github.v3+json' }
        };
        https.get(options, (res) => {
            if (res.statusCode === 302 || res.statusCode === 301) {
                return resolve(githubGet(res.headers.location));
            }
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error('JSON parse error: ' + data.slice(0, 100))); }
            });
        }).on('error', reject);
    });
}

function semverNewer(current, latest) {
    const norm = v => v.replace(/^v/, '').split('.').map(n => parseInt(n) || 0);
    const c = norm(current);
    const l = norm(latest);
    for (let i = 0; i < Math.max(c.length, l.length); i++) {
        if ((l[i] || 0) > (c[i] || 0)) return true;
        if ((l[i] || 0) < (c[i] || 0)) return false;
    }
    return false;
}

// GET /api/update/check
router.get('/check', authMiddleware, async (req, res) => {
    try {
        let latestVersion = null;
        let releaseNotes = '';
        let zipUrl = null;
        let publishedAt = null;

        try {
            const release = await githubGet(`/repos/${GITHUB_USER}/${GITHUB_REPO}/releases/latest`);
            if (release.tag_name) {
                latestVersion = release.tag_name;
                releaseNotes = release.body || '';
                zipUrl = release.zipball_url || null;
                publishedAt = release.published_at || null;
            }
        } catch (_) {}

        if (!latestVersion) {
            const tags = await githubGet(`/repos/${GITHUB_USER}/${GITHUB_REPO}/tags`);
            if (Array.isArray(tags) && tags.length > 0) {
                latestVersion = tags[0].name;
            }
        }

        if (!latestVersion) {
            return res.json({ currentVersion: CURRENT_VERSION, latestVersion: null, updateAvailable: false, error: 'Keine Releases gefunden' });
        }

        res.json({
            currentVersion: CURRENT_VERSION,
            latestVersion,
            updateAvailable: semverNewer(CURRENT_VERSION, latestVersion),
            releaseNotes,
            publishedAt
        });
    } catch (err) {
        res.status(500).json({ error: 'GitHub nicht erreichbar: ' + err.message, currentVersion: CURRENT_VERSION });
    }
});

// POST /api/update/install
router.post('/install', authMiddleware, (req, res) => {
    const tmpDir = '/tmp/hochzeit-update-' + Date.now();
    const zipFile = `${tmpDir}/update.zip`;

    const downloadUrl = `https://github.com/${GITHUB_USER}/${GITHUB_REPO}/archive/refs/heads/main.zip`;

    // Antwort sofort senden, Update läuft im Hintergrund
    res.json({ success: true, message: 'Update wird heruntergeladen und installiert. Server startet neu...' });

    const script = [
        `mkdir -p ${tmpDir}`,
        `curl -sL "${downloadUrl}" -o ${zipFile}`,
        `unzip -q -o ${zipFile} -d ${tmpDir}/extracted`,
        `SRCDIR=$(ls -d ${tmpDir}/extracted/*/  | head -1)`,
        `rsync -a --delete ` +
            `--exclude='.env' ` +
            `--exclude='node_modules/' ` +
            `--exclude='data/' ` +
            `--exclude='uploads/' ` +
            `--exclude='backup/' ` +
            `--exclude='logs/' ` +
            `"$SRCDIR" "${APP_DIR}/"`,
        `cd "${APP_DIR}" && npm install --production --silent`,
        `rm -rf ${tmpDir}`,
        `pm2 restart hochzeit-galerie 2>/dev/null || true`
    ].join(' && ');

    exec(script, { shell: '/bin/bash' }, (error, stdout, stderr) => {
        if (error) {
            console.error('[Update] Fehler:', error.message);
        } else {
            console.log('[Update] Erfolgreich installiert.');
        }
    });
});

module.exports = router;
