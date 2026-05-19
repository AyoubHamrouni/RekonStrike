# Next.js Frontend

This frontend is built with **Next.js**, **React 19**, **TypeScript**, and **TailwindCSS 4**.

## Development

```bash
cd ui
npm install
npm run dev
```

## Production Build

```bash
cd ui
npm run build
npm start
```

## Project Structure

- `app/` — Next.js application routes and server components
- `components/` — reusable UI components
- `hooks/` — client-side React hooks
- `lib/` — shared helper utilities
- `public/` — static assets
- `types/` — shared TypeScript type definitions

## Notes

- Uses Next.js routing and server-side rendering where appropriate.
- Uses `next dev` for development and `next build` / `next start` for production.
- The UI communicates with the Python backend via REST and WebSocket.
