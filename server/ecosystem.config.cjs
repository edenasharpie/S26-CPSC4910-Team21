module.exports = {
  apps: [{
    name: "fleetscore-server",
    script: "./index.js",
    cwd: __dirname,
    env: {
      NODE_ENV: "production",
      PORT: process.env.PORT || 5000,
      HOST: process.env.HOST || "0.0.0.0"
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