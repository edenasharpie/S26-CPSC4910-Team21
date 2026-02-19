module.exports = {
  apps: [{
    name: "fleetscore-server",
    script: "./index.js",
    cwd: "/home/ubuntu/FleetScore/S26-CPSC4910-Team21/server",
    env: {
      NODE_ENV: "production",
      PORT: 5000
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: "500M",
    error_file: "./logs/err.log",
    out_file: "./logs/out.log",
    log_date_format: "YYYY-MM-DD HH:mm:ss Z"
  }]
}