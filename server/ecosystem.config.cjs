// PM2 process definition used on the EC2 instance:
//   pm2 startOrReload ecosystem.config.cjs
// The "Deploy server" GitHub workflow writes .env next to this file.
module.exports = {
  apps: [
    {
      name: "brain-harness",
      script: "src/index.js",
      cwd: __dirname,
      node_args: "--env-file=.env",
      env: { NODE_ENV: "production" },
    },
  ],
};
