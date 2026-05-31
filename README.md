# CountryBall Gacha Frontend

Vite frontend for the CountryBall gacha app.

## Development

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Preview production build:

```bash
npm run preview
```

## API Proxy

During local development, Vite proxies `/api` requests to:

```txt
http://localhost:3456
```

The proxy is configured in `vite.config.js`.
