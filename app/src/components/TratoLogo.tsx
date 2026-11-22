// Logo de Trato (marca final, 21-nov-2026). Dibujo tomado de docs-pp/marca/trato-logo-sobre-*.svg.
// sobre="claro": todo en Monte. sobre="oscuro": símbolo en Yungas y palabra en Sal.
const SIMBOLO = "M0 0 L58 47.5 L116 0 V108 L58 60.5 L0 108 Z";
const PALABRA = "M13 0 H37 V33 H58 V55.3 H37 V97.7 A13 13 0 0 0 50 110.7 H60 V133 H50 A37 37 0 0 1 13 96 V55.3 H0 V33 H13 Z M74 33 H98 V39.89 A43 44.4 0 0 1 121 33 H129 V55.8 H121 A23 21.6 0 0 0 98 77.4 V133 H74 Z M129 83 A51.5 51.5 0 1 1 232 83 A51.5 51.5 0 1 1 129 83 Z M152.9 83 C152.9 98.74 165.57 111.5 181.2 111.5 C196.83 111.5 209.5 98.74 209.5 83 C209.5 67.26 196.83 54.5 181.2 54.5 C165.57 54.5 152.9 67.26 152.9 83 Z M210.5 33 H234.5 V133 H210.5 Z M261 0 H285 V33 H306 V55.3 H285 V97.7 A13 13 0 0 0 298 110.7 H308 V133 H298 A37 37 0 0 1 261 96 V55.3 H248 V33 H261 Z M311 83 A51.5 51.5 0 1 1 414 83 A51.5 51.5 0 1 1 311 83 Z M334.9 83 C334.9 98.74 347.26 111.5 362.5 111.5 C377.74 111.5 390.1 98.74 390.1 83 C390.1 67.26 377.74 54.5 362.5 54.5 C347.26 54.5 334.9 67.26 334.9 83 Z";

export function TratoLogo({ sobre = "claro", className = "h-7 w-auto" }: { sobre?: "claro" | "oscuro"; className?: string }) {
  const simbolo = sobre === "oscuro" ? "#50DE50" : "#0A2A1B";
  const palabra = sobre === "oscuro" ? "#F5F7F1" : "#0A2A1B";
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 564.63 134.5" role="img" aria-label="Trato" className={className}>
      <path fill={simbolo} transform="translate(0 31.5) scale(0.9537)" d={SIMBOLO} />
      <path fill={palabra} transform="translate(150.63 0)" d={PALABRA} />
    </svg>
  );
}
