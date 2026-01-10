module.exports = {
  apps: [
    {
      name: "elizaos-agent",
      script: "C:\\Users\\dldud\\.bun\\bin\\bun.exe",
      args: "x elizaos start",
      cwd: "C:\\Users\\dldud\\OneDrive\\Documents\\GitHub\\sapience\\starters\\elizaos",
      interpreter: "none",
      autorestart: true,
      watch: false,
      max_memory_restart: "2G",
      env: {
        NODE_ENV: "production",
        PATH: process.env.PATH + ";C:\\Users\\dldud\\.bun\\bin",
      },
    },
  ],
};

