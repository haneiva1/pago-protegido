import { checkBot, handle } from "@/lib/server/http";
import { botChanges } from "@/lib/server/orders";
export const dynamic = "force-dynamic";

/** APP-ENDPOINTS §2: GET /api/bot/changes?since=<ms> (x-bot-key). */
export const GET = (req: Request) =>
  handle(() => {
    checkBot(req);
    return botChanges(new URL(req.url).searchParams.get("since"));
  });
