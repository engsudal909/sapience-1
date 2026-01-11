module.exports = {
  apps: [
    {
      name: "market-maker",
      script: "C:\\Users\\dldud\\AppData\\Roaming\\npm\\node_modules\\tsx\\dist\\cli.mjs",
      args: "src/index.ts",
      cwd: "C:\\Users\\dldud\\OneDrive\\Documents\\GitHub\\sapience\\starters\\market-maker",
      interpreter: "node",
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};

