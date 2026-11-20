"use client";

import { useEffect, useState } from "react";
import { WhatsAppBox } from "@/components/WhatsAppBox";

/** "Pide compra protegida": el comprador le pide al vendedor que use Trato, con un mensaje listo. */
export default function Pedir() {
  const [product, setProduct] = useState("");
  const [price, setPrice] = useState("");
  const [phone, setPhone] = useState("");
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const text = `Hola 👋 Quiero comprarte ${product.trim() || "el producto"}${price.trim() ? ` (Bs ${price.trim()})` : ""}. ¿Me lo vendes con Trato? Yo pago por adelantado, mi plata queda guardada hasta que me llegue y ahí se te paga. Crear el link toma 30 segundos: ${origin}/vender`;

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Pide compra protegida</h1>
      <p className="text-slate-600">¿Te da miedo pagar por adelantado a una tienda de otra ciudad? Pídele que te venda con Trato.</p>
      <div className="card space-y-3">
        <div>
          <label className="label" htmlFor="q-product">
            ¿Qué quieres comprar?
          </label>
          <input id="q-product" className="input" value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Ej.: Zapatillas Nike talla 40" />
        </div>
        <div>
          <label className="label" htmlFor="q-price">
            Precio acordado en Bs <span className="font-normal text-slate-400">(opcional)</span>
          </label>
          <input id="q-price" className="input" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="450" />
        </div>
        <div>
          <label className="label" htmlFor="q-phone">
            WhatsApp de la tienda <span className="font-normal text-slate-400">(opcional)</span>
          </label>
          <input id="q-phone" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="591 71234567" />
        </div>
      </div>
      <WhatsAppBox title="Mensaje para la tienda" text={text} phone={phone} testId="mensaje-pedir" />
    </div>
  );
}
