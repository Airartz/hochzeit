# 💒 Hochzeits-Galerie

Eine selbst gehostete Fotogalerie für Hochzeiten – Gäste können per QR-Code Fotos & Videos hochladen, Challenges spielen und die Live-Diashow genießen.

---

## ✨ Features

- **📸 QR-Upload** – Gäste scannen einen QR-Code und laden direkt Fotos & Videos hoch, ganz ohne App oder Konto
- **🖼️ Galerie** – Alle Uploads in einer übersichtlichen Galerie, sortiert nach Alben
- **📁 Alben** – Fotos können in Alben organisiert werden
- **🎯 Challenges** – Lustige Foto-Aufgaben für die Gäste (z. B. „Mach ein Selfie mit dem Brautpaar")
- **📺 Live-Diashow** – Alle Fotos als Echtzeit-Slideshow auf dem Beamer oder TV
- **❤️ Likes** – Gäste können Fotos liken
- **👥 Gästeverwaltung** – Gäste verwalten und zuordnen
- **⏳ Countdown** – Countdown-Seite vor der Hochzeit (statt der Galerie)
- **📱 QR-Code Generator** – QR-Code für den Upload-Link generieren & drucken
- **⚙️ Admin-Panel** – Alles zentral verwalten
- **🆕 Auto-Updater** – Automatische Update-Benachrichtigung im Admin-Panel

---

## 🚀 Installation

### Voraussetzungen

- [Node.js](https://nodejs.org/) v18 oder neuer
- npm

### Schritte

```bash
# Projekt klonen
git clone https://github.com/Airartz/hochzeit.git
cd hochzeit

# Abhängigkeiten installieren
npm install

# Umgebungsvariablen einrichten
cp .env.example .env
# .env anpassen (PORT, JWT_SECRET)

# Server starten
npm start
```

Der Server läuft dann unter `http://localhost:3000`.

---

## ⚙️ Konfiguration

Erstelle eine `.env`-Datei im Projektordner:

```env
PORT=3000
JWT_SECRET=dein-geheimer-schluessel
```

---

## 🗂️ Projektstruktur

```
hochzeit/
├── config/         # Datenbank-Konfiguration
├── middleware/     # Auth-Middleware
├── public/         # Frontend (HTML, CSS, JS)
│   ├── admin/      # Admin-Panel
│   └── css/        # Stylesheets
├── routes/         # API-Routen
├── uploads/        # Hochgeladene Dateien (nicht in Git)
├── data/           # SQLite-Datenbank (nicht in Git)
├── utils/          # Hilfsfunktionen
└── server.js       # Einstiegspunkt
```

---

## 🔧 Admin-Panel

Das Admin-Panel ist erreichbar unter:

```
http://localhost:3000/admin/login.html
```

Beim ersten Start wird ein Admin-Konto über `/admin/login.html` eingerichtet.

### Admin-Bereiche

| Bereich | URL |
|---|---|
| Dashboard | `/admin/dashboard.html` |
| Gäste | `/admin/guests.html` |
| Alben | `/admin/albums.html` |
| Challenges | `/admin/challenges.html` |
| Einstellungen | `/admin/settings.html` |
| QR-Code | `/admin/qrcode.html` |
| Countdown | `/admin/countdown.html` |

---

## 🆕 Auto-Updater

Sobald ein neues [GitHub Release](https://github.com/Airartz/hochzeit/releases) veröffentlicht wird, erscheint im Admin-Dashboard automatisch ein Update-Banner. Mit einem Klick auf **„Jetzt installieren"** wird das Update heruntergeladen, installiert und der Server neu gestartet – ohne dass Daten (Fotos, Datenbank) verloren gehen.

---

## 🌐 Deployment (Server)

Das Projekt lässt sich per `deploy.sh` auf einen Linux-Server deployen:

```bash
bash deploy.sh
```

Voraussetzung auf dem Server: Node.js, npm, pm2, rsync.

Für den Produktivbetrieb mit pm2:

```bash
pm2 start ecosystem.config.js
pm2 save
```

---

## 📦 Technologien

| Technologie | Verwendung |
|---|---|
| Node.js + Express | Backend / API |
| SQLite (sql.js) | Datenbank |
| Multer | Datei-Upload |
| Sharp | Bild-Thumbnails |
| JWT | Admin-Authentifizierung |
| QRCode | QR-Code Generierung |
| Archiver | ZIP-Download aller Fotos |

---

## 📄 Lizenz

MIT License – frei verwendbar und anpassbar.
