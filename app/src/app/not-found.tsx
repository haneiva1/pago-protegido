import Link from "next/link";
import { TratoSimbolo } from "@/components/TratoLogo";

export const metadata = { title: "Página no encontrada · Trato" };

/** 404 de todo el sitio, en español y con la marca (reemplaza a la página en inglés de Next). */
export default function NoEncontrada() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center sm:py-24" data-testid="no-encontrada">
      <span className="flex h-14 w-14 items-center justify-center rounded-card bg-monte text-yungas" aria-hidden>
        <TratoSimbolo className="h-7 w-7" />
      </span>
      <p className="eyebrow mt-6">Error 404</p>
      <h1 className="mt-2 text-3xl sm:text-4xl">Esta página no existe</h1>
      <p className="mt-3 text-tinta-600">Revisa el link que te mandaron. Si era un link de pago, puedes comprobarlo antes de pagar.</p>
      <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <Link href="/" className="btn-primary px-6">
          Ir al inicio
        </Link>
        <Link href="/verificar" className="btn-secondary px-6">
          Verificar un link
        </Link>
      </div>
    </div>
  );
}
