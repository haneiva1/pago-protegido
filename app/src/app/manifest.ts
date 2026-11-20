import type { MetadataRoute } from "next";

/**
 * "Agregar a inicio" (M6). Sin start_url: el ícono abre la página desde la que se agregó (la compra del comprador).
 * display "browser": el ícono abre el mismo navegador, con sus mismos datos. Una app aparte (standalone) tendría
 * datos separados en iPhone y el comprador no encontraría su compra.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Trato",
    short_name: "Trato",
    description: "Pago protegido para compras por redes: tu plata queda guardada hasta que confirmes que te llegó.",
    display: "browser",
    background_color: "#f6f7f9",
    theme_color: "#059669",
    lang: "es-BO",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
