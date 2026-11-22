import { handle } from "@/lib/server/http";
import { procesarPlazos } from "@/lib/server/orders";
export const dynamic = "force-dynamic";

/**
 * POST /api/plazos/procesar: libera los pedidos con la revisión vencida y devuelve los que no se despacharon a tiempo
 * (como mucho 20 por llamada, enfriamiento de 60 s). Lo llama el cron de GitHub cada 5 minutos (.github/workflows/plazos.yml).
 * Pública y sin claves: solo ejecuta lo que los contratos ya permiten a cualquiera, y repetirla no cambia nada.
 */
export const POST = () => handle(() => procesarPlazos());
