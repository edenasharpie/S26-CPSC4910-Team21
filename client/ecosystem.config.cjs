module.exports = {
  apps: [{
    name: "fleetscore-client",
    script: "npm",
    args: "start",
    cwd: __dirname,
    env: {
      NODE_ENV: "production",
      PORT: 3000,
      API_URL: process.env.API_URL || "http://localhost:5000"
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: "1G",
    error_file: "./logs/err.log",
    out_file: "./logs/out.log",
    log_date_format: "YYYY-MM-DD HH:mm:ss Z"
  }]
}