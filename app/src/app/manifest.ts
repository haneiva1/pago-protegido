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
    background_color: "#F5F7F1",
    theme_color: "#50DE50",
    lang: "es-BO",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
