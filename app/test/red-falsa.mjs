// Red falsa para los tests del indexador (`npm test`): RPC de Soroban y Horizon en memoria, sin red ni llaves.
// Cada lectura queda en `llamadas`, para comprobar cuándo el indexador lee la red y cuándo no.
import { StrKey, nativeToScVal } from "@stellar/stellar-sdk";

export const TW_WASM = "1b367bc8476cf80b89f6396e2aa07b602b78361dd829b5ce9b64ada365196660";
export const LABUSD = "CC65P6TQQ646YDXVS3PM6YVZASXW6WM5B67YKI46JH4EG65LJPOGBD4S";
const LABUSD_ISSUER = "GBT2SEWEU7JK7HBOKMTED3WIUC6FX56CPAJWQCGF6XMUBAAZ7GKHD2O3";
export const PLATAFORMA = "GDDJTZ7LNW33A46DYIYWQY5YDBZPPHLIAQHOAHTIM5ZIQALDVVTCPKDZ";
export const V2 = { guardian: "CDKYF7OAJTACP4JNJSGGXDRA3DHE442R26CT5ZE5DJHNSHH7XJUOATOT", arbiter: "CDTEA424AWSIIHEQ4FIQHFQOTWS3XAVLQHX7FI3MU6JZP4OPMTEVU5UA" };
export const V1 = { guardian: "CAOX6JZV3CJZFDD22J2XI3NKY5G4NRFOYRV7IA724MSVREYVRALW4OZU", arbiter: "CBCDVLEPJ6PN7RDC3HFGML3IUT7SOQEYSGH3LE3SWXWZJO7Z2QG2PWGU" };
export const HORIZON = "https://horizon-testnet.stellar.org";

export const contrato = (n) => StrKey.encodeContract(Buffer.alloc(32, n));
export const cuenta = (n) => StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 100 + n));

/** Una compra como la cuenta el evento `pp_funded` (escrow, comprador y hash del pago derivados de `n`). */
export const compra = (n, extra = {}) => ({
  escrow: contrato(n),
  buyer: cuenta(n),
  seller: cuenta(0),
  amount: "1500000000",
  tx_fondeo: n.toString(16).padStart(64, "0"),
  ...extra,
});

/** Lo que devuelve `get_escrow` de un escrow armado por Trato. */
export const escrowDeTrato = (c, pares = V2) => ({
  roles: {
    approver: pares.guardian,
    release_signer: pares.guardian,
    dispute_resolver: pares.arbiter,
    platform: PLATAFORMA,
    receiver: c.seller,
    service_provider: c.seller,
  },
  trustline: { address: LABUSD },
  amount: BigInt(c.amount),
});

/** Efectos de Horizon de un `transfer` del SAC de LABUSD (account_debited + contract_credited). */
export function efectosDe(from, to, amount) {
  const u = BigInt(amount);
  const monto = `${u / 10_000_000n}.${(u % 10_000_000n).toString().padStart(7, "0")}`;
  const asset = { asset_type: "credit_alphanum12", asset_code: "LABUSD", asset_issuer: LABUSD_ISSUER, amount: monto };
  return [
    { type: "account_debited", account: from, ...asset },
    { type: "contract_credited", contract: to, ...asset },
  ];
}

const NO_ENCONTRADA = { code: 404, message: "Could not obtain contract instance from server" };

export function redFalsa() {
  const llamadas = [];
  /** escrow → hash del WASM | "archivada" | { executable } | Error */
  const instancias = new Map();
  /** escrow → lo que devuelve get_escrow | "archivada" | Error */
  const escrows = new Map();
  /** hash → eventos XDR del pago en el RPC | Error (sin entrada: NOT_FOUND, fuera de la ventana de 7 días) */
  const rpcTx = new Map();
  /** hash → efectos | código HTTP | Error (sin entrada: 404) */
  const horizon = new Map();
  /** hash → `fee_account` de la transacción en Horizon (quién pagó su comisión) | código HTTP | Error (sin entrada: 404) */
  const patrocinios = new Map();
  /** Eventos de getEvents y filtros con los que se pidieron. */
  const eventos = [];
  const filtros = [];

  const lanzarSi = (v) => {
    if (v instanceof Error) throw v;
  };

  const server = {
    async getContractInstance(id) {
      llamadas.push(["instancia", id]);
      const v = instancias.get(id);
      lanzarSi(v);
      if (v === undefined || v === "archivada") throw { ...NO_ENCONTRADA };
      if (typeof v === "object") return v;
      return { executable: { type: "contractExecutableWasm", value: Buffer.from(v, "hex") } };
    },
    async simulateTransaction(tx) {
      const raw = Buffer.from(tx.toXDR(), "base64");
      const id = [...escrows.keys(), ...instancias.keys()].find((e) => raw.includes(StrKey.decodeContract(e)));
      llamadas.push(["get_escrow", id]);
      const v = id === undefined ? undefined : escrows.get(id);
      lanzarSi(v);
      if (v === undefined || v === "archivada") {
        return { id: "1", latestLedger: 1, events: [], _parsed: true, error: "HostError: Error(Storage, MissingValue)" };
      }
      return { id: "1", latestLedger: 1, events: [], _parsed: true, result: { auth: [], retval: nativeToScVal(v) } };
    },
    async getTransaction(hash) {
      llamadas.push(["tx", hash]);
      const v = rpcTx.get(hash);
      lanzarSi(v);
      if (v === undefined) return { status: "NOT_FOUND", latestLedger: 1 };
      return { status: "SUCCESS", latestLedger: 1, events: { contractEventsXdr: [v] } };
    },
    async getHealth() {
      return { status: "healthy", oldestLedger: 1, latestLedger: 100 };
    },
    async getEvents(req) {
      filtros.push(req.filters);
      return { events: eventos, latestLedger: 100, cursor: "fin" };
    },
  };

  const fetch = async (url) => {
    const tx = String(url).match(/\/transactions\/([0-9a-f]+)$/);
    if (tx) {
      llamadas.push(["horizon-tx", tx[1]]);
      const v = patrocinios.get(tx[1]);
      lanzarSi(v);
      if (v === undefined) return new Response("{}", { status: 404 });
      if (typeof v === "number") return new Response("{}", { status: v });
      return new Response(JSON.stringify({ hash: tx[1], fee_account: v, successful: true }), { status: 200 });
    }
    const m = String(url).match(/\/transactions\/([0-9a-f]+)\/effects/);
    if (!m) throw new Error(`fetch inesperado: ${url}`);
    llamadas.push(["horizon", m[1]]);
    const v = horizon.get(m[1]);
    lanzarSi(v);
    if (v === undefined) return new Response("{}", { status: 404 });
    if (typeof v === "number") return new Response("{}", { status: v });
    return new Response(JSON.stringify({ _embedded: { records: v } }), { status: 200 });
  };

  /**
   * Registra una compra genuina de Trato: escrow de TW con los roles de Trato y el pago visto por Horizon. `patrocinador`
   * es quien pagó la comisión del fondeo: la app lo patrocina con la cuenta plataforma (fee bump).
   */
  function genuina(c, pares = V2, patrocinador = PLATAFORMA) {
    instancias.set(c.escrow, TW_WASM);
    escrows.set(c.escrow, escrowDeTrato(c, pares));
    horizon.set(c.tx_fondeo, efectosDe(c.buyer, c.escrow, c.amount));
    patrocinios.set(c.tx_fondeo, patrocinador);
    return c;
  }

  /** Lecturas de red hechas para una compra (por su escrow o por el hash de su pago). */
  const de = (c) => llamadas.filter(([, id]) => id === c.escrow || id === c.tx_fondeo);

  return { server, fetch, llamadas, instancias, escrows, rpcTx, horizon, patrocinios, eventos, filtros, genuina, de };
}
