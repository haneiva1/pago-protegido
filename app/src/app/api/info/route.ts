import { handle } from "@/lib/server/http";
import { info } from "@/lib/server/orders";
export const dynamic = "force-dynamic";

export const GET = () => handle(() => info());
