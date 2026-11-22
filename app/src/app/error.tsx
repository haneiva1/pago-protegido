"use client";

import Link from "next/link";
import { useEffect } from "react";
import { TratoSimbolo } from "@/components/TratoLogo";

/** Error inesperado de una página: en español, con la marca y sin detalles técnicos. */
export default function ErrorPagina({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center sm:py-24" data-testid="error-pagina">
      <span className="flex h-14 w-14 items-center justify-center rounded-card bg-monte text-yungas" aria-hidden>
        <TratoSimbolo className="h-7 w-7" />
      </span>
      <p className="eyebrow mt-6">Algo falló</p>
      <h1 className="mt-2 text-3xl sm:text-4xl">No pudimos mostrar esta página</h1>
      <p className="mt-3 text-tinta-600">Fue de nuestro lado, no tuyo. Tu pedido y tu plata siguen igual. Vuelve a intentarlo en un momento.</p>
      <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <button type="button" onClick={reset} className="btn-primary px-6">
          Volver a intentar
        </button>
        <Link href="/" className="btn-secondary px-6">
          Ir al inicio
        </Link>
      </div>
      {error.digest && <p className="mt-6 text-xs text-tinta-400 num">Referencia: {error.digest}</p>}
    </div>
  );
}
