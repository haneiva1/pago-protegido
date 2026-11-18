import { checkBot, handle } from "@/lib/server/http";
import { botSellerByPhone } from "@/lib/server/orders";
export const dynamic = "force-dynamic";

/** APP-ENDPOINTS §1: GET /api/bot/sellers?phone=591… (x-bot-key). */
export const GET = (req: Request) =>
  handle(() => {
    checkBot(req);
    return botSellerByPhone(new URL(req.url).searchParams.get("phone"));
  });
