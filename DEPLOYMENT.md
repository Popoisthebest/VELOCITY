# Deployment Guide

## Local

1. Install dependencies

```bash
npm install
```

2. Run development mode

```bash
npm run dev
```

Client:

```text
http://localhost:3000
```

Server/WebSocket:

```text
ws://localhost:3001
```

## Production build test

1. Build the app

```bash
npm run build
```

2. Start the server

```bash
npm start
```

3. Open in browser

```text
http://localhost:3001
```

## Railway deployment

1. Push code to GitHub.
2. Create a Railway project from the GitHub repository.
3. Set Build Command:

```bash
npm install && npm run build
```

4. Set Start Command:

```bash
npm start
```

5. Do not manually set `PORT` unless necessary.
6. Deploy.
7. Open the Railway public domain.

## Expected production behavior

User opens:

```text
https://your-app.up.railway.app
```

Client connects to:

```text
wss://your-app.up.railway.app
```

## Test checklist

- Page loads
- WebSocket connects
- Two browser tabs can join
- Players see each other
- Movement sync works
- Shooting sync works
- Kills/deaths update
- Match timer updates
- Refresh still serves the SPA route

## Common issues

- WebSocket fails because client uses `ws://` instead of `wss://`
- Client appends `:3001` in production
- Server only listens on localhost instead of `0.0.0.0`
- `PORT` is hardcoded
- Build output path mismatch
- `dist/client/index.html` not found
