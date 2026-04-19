const QRCode = require('qrcode');

async function generateQRCode(url) {
    try {
        const dataUrl = await QRCode.toDataURL(url, {
            width: 400,
            margin: 2,
            color: {
                dark: '#2C2C2C',
                light: '#FFFFFF'
            },
            errorCorrectionLevel: 'H'
        });
        return dataUrl;
    } catch (err) {
        console.error('QR-Code Fehler:', err);
        throw err;
    }
}

async function generateQRCodeSVG(url) {
    try {
        const svg = await QRCode.toString(url, {
            type: 'svg',
            width: 400,
            margin: 2,
            color: {
                dark: '#2C2C2C',
                light: '#FFFFFF'
            },
            errorCorrectionLevel: 'H'
        });
        return svg;
    } catch (err) {
        console.error('QR-Code SVG Fehler:', err);
        throw err;
    }
}

module.exports = { generateQRCode, generateQRCodeSVG };
