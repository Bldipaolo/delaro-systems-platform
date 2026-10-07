# Delaro Systems Platform

Client-facing operating platform for making improvement work easy to follow.

## Run locally

Use Node 22 for the most reliable local runtime:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm ci
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run dev
```

For a faster production preview:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run build
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run start
```

The app currently runs in demo mode. Changes persist in the browser using local storage. Supabase migrations and server actions are included for the next backend phase.

## Main views

- Client workspace: Home, Projects, Results, Files, and Check-ins
- Internal workspace: portfolio, clients, opportunities, projects, measurement, and reviews
- Offline demo: `outputs/delaro-client-demo.html`
