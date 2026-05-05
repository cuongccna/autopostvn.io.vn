module.exports = {
  apps: [{
    name: 'autobot-backend',
    script: 'server.js',
    cwd: __dirname,
    env: {
      NODE_ENV: 'production'
    },
    env_file: '../.env',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '256M',
    error_file: 'logs/err.log',
    out_file: 'logs/out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    autorestart: true
  }]
};
