# EchoIdeal Cloud Backend (v1)

Cloud backend for EchoIdeal: licensing + hosted AI/STT proxy + model/prompt catalog + usage/error telemetry.

## Local Development

1. Copy env template:

```bash
cp .env.example .env
```

2. Start Postgres (example):

```bash
docker run --rm -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres -e POSTGRES_DB=echoideal postgres:15
```

3. Install deps and run migrations:

```bash
npm install
npx prisma migrate dev
npm run build
npx prisma db seed
```

4. Start:

```bash
npm run dev
```

If you want hot reload and your environment supports it:

```bash
npm run dev:watch
```

Then run the server in another terminal:

```bash
npm run dev:serve
```

## Create a Dev License (for local testing)

```bash
npm run license:create:dev
```

## Create a Paid License (for local testing)

```bash
npm run license:create:paid
```

## Notes

- `APP_ENDPOINT` and `PAYMENT_ENDPOINT` in the desktop build should point at this server base URL.
- `API_ACCESS_KEY` is embedded into the desktop app at build time, so treat it as an app-level gate only.
- Set `OPENAI_API_KEY` in `.env` for hosted features that call OpenAI directly (for example `POST /api/prompt` used by the app’s “Generate with AI” system-prompt helper). If it is unset, that route returns an error.
