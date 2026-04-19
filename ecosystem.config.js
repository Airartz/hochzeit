module.exports = {
    apps: [{
        name: 'hochzeit-galerie',
        script: 'server.js',
        watch: false,
        instances: 1,
        autorestart: true,
        max_memory_restart: '500M',
        env: {
            NODE_ENV: 'production'
        },
        // Log-Konfiguration
        log_file: './logs/combined.log',
        out_file: './logs/out.log',
        error_file: './logs/error.log',
        log_date_format: 'DD.MM.YYYY HH:mm:ss',
        merge_logs: true,
        max_size: '10M',
        retain: 5
    }]
};
