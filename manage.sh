#!/bin/bash
# ============================================
# 💒 Hochzeits-Galerie – Server Management
# ============================================

APP_NAME="hochzeit-galerie"
APP_DIR="$(cd "$(dirname "$0")" && pwd)"

# Farben
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Log-Ordner erstellen
mkdir -p "$APP_DIR/logs"

show_header() {
    echo ""
    echo -e "${YELLOW}╔══════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║  💒 Hochzeits-Galerie Management    ║${NC}"
    echo -e "${YELLOW}╚══════════════════════════════════════╝${NC}"
    echo ""
}

show_help() {
    show_header
    echo -e "  ${GREEN}Verwendung:${NC} ./manage.sh [befehl]"
    echo ""
    echo -e "  ${BLUE}start${NC}      – Server starten"
    echo -e "  ${BLUE}stop${NC}       – Server stoppen"
    echo -e "  ${BLUE}restart${NC}    – Server neustarten"
    echo -e "  ${BLUE}status${NC}     – Status anzeigen"
    echo -e "  ${BLUE}logs${NC}       – Live-Logs anzeigen (Strg+C zum Beenden)"
    echo -e "  ${BLUE}logs-err${NC}   – Nur Fehler-Logs anzeigen"
    echo -e "  ${BLUE}logs-last${NC}  – Letzte 50 Log-Zeilen"
    echo -e "  ${BLUE}install${NC}    – PM2 + Dependencies installieren"
    echo -e "  ${BLUE}setup${NC}      – PM2 Autostart einrichten"
    echo ""
}

case "$1" in
    start)
        show_header
        echo -e "${GREEN}▶ Server wird gestartet...${NC}"
        cd "$APP_DIR"
        pm2 start ecosystem.config.js
        echo ""
        echo -e "${GREEN}✅ Server gestartet!${NC}"
        pm2 status "$APP_NAME"
        ;;

    stop)
        show_header
        echo -e "${RED}■ Server wird gestoppt...${NC}"
        pm2 stop "$APP_NAME"
        echo -e "${RED}✅ Server gestoppt.${NC}"
        ;;

    restart)
        show_header
        echo -e "${YELLOW}🔄 Server wird neugestartet...${NC}"
        pm2 restart "$APP_NAME"
        echo -e "${GREEN}✅ Server neugestartet!${NC}"
        pm2 status "$APP_NAME"
        ;;

    status)
        show_header
        pm2 status "$APP_NAME"
        echo ""
        echo -e "${BLUE}📊 Speicher & CPU:${NC}"
        pm2 show "$APP_NAME" 2>/dev/null | grep -E "status|memory|cpu|uptime|restarts|pid"
        echo ""
        echo -e "${BLUE}📁 Log-Dateien:${NC}"
        if [ -f "$APP_DIR/logs/out.log" ]; then
            echo -e "  Größe: $(du -sh "$APP_DIR/logs/" 2>/dev/null | cut -f1)"
        fi
        echo ""
        echo -e "${BLUE}📝 Letzte 5 Log-Einträge:${NC}"
        tail -5 "$APP_DIR/logs/out.log" 2>/dev/null || echo "  (Noch keine Logs)"
        ;;

    logs)
        show_header
        echo -e "${BLUE}📜 Live-Logs (Strg+C zum Beenden):${NC}"
        echo "────────────────────────────────"
        pm2 logs "$APP_NAME" --lines 30
        ;;

    logs-err)
        show_header
        echo -e "${RED}❌ Fehler-Logs:${NC}"
        echo "────────────────────────────────"
        pm2 logs "$APP_NAME" --err --lines 50
        ;;

    logs-last)
        show_header
        echo -e "${BLUE}📝 Letzte 50 Log-Zeilen:${NC}"
        echo "────────────────────────────────"
        tail -50 "$APP_DIR/logs/combined.log" 2>/dev/null || echo "Noch keine Logs vorhanden."
        ;;

    install)
        show_header
        echo -e "${YELLOW}📦 Installiere Dependencies...${NC}"
        cd "$APP_DIR"
        npm install --production
        echo ""
        echo -e "${YELLOW}📦 Prüfe PM2...${NC}"
        if ! command -v pm2 &> /dev/null; then
            echo "PM2 wird installiert..."
            npm install -g pm2
        else
            echo -e "${GREEN}✅ PM2 ist bereits installiert.${NC}"
        fi
        echo ""
        echo -e "${GREEN}✅ Installation abgeschlossen!${NC}"
        echo -e "Starte mit: ${BLUE}./manage.sh start${NC}"
        ;;

    setup)
        show_header
        echo -e "${YELLOW}⚙️  PM2 Autostart wird eingerichtet...${NC}"
        pm2 startup
        cd "$APP_DIR"
        pm2 start ecosystem.config.js
        pm2 save
        echo ""
        echo -e "${GREEN}✅ Autostart eingerichtet!${NC}"
        echo "Der Server startet jetzt automatisch nach einem Neustart."
        ;;

    *)
        show_help
        ;;
esac
