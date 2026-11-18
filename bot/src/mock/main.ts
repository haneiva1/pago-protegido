// App de mentira sola: `npm run mock` (MOCK_PORT, por defecto 3031). La usa el e2e.
import { startMockApp } from "./app-mock.ts";

const port = Number(process.env.MOCK_PORT ?? 3031);
const app = await startMockApp({ port, botKey: process.env.PP_BOT_KEY || undefined });
console.log(`App de mentira en ${app.url}`);
