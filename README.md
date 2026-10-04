# CodeLinc-Dental

Hackathon project for CodeLinc.

## Team workflow
- `main` must always work. Never push directly to it.
- Create a branch for each task: `git checkout -b feature/<short-name>`
- Open a Pull Request into `main` and merge small changes often.

## Run it locally

```bash
npm install
npm run dev        # http://127.0.0.1:5173, built-in sample data (mock mode)
npm run typecheck && npm test && npm run build
```

- `apps/web`: the React app. `packages/contracts`: the API contract (zod schemas), real plan fixtures from five carriers' PDFs, and JSON Schema for the backend (`npm run schema`).
- **Mock vs live:** `VITE_DATA_MODE=mock` (default) uses built-in sample data. `VITE_DATA_MODE=live` with `VITE_API_BASE_URL` calls the backend, validating every response against the contract. See `apps/web/.env.example`.
- In mock mode, the floating **Demo** button (bottom right, mock mode only) switches between six real plans and between a family and one person (Lincoln, Delta Dental, Aetna, MetLife Standard and High, Cigna).
- Specs: `md-files/BUILD-BRIEF.md`, `CONTEXT.md`, `FRONTEND.md`, `BACKEND.md`.
