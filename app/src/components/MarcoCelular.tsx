/** Marco de celular para /probar. Adentro va la página real (un iframe) o un aviso mientras no hay nada que mostrar. */
export function MarcoCelular({
  titulo,
  testId,
  className = "",
  children,
}: {
  titulo: React.ReactNode;
  testId: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <figure data-testid={testId} className={`flex-col items-center gap-2 ${className}`}>
      <figcaption className="text-sm font-semibold text-slate-700">{titulo}</figcaption>
      <div className="relative w-full max-w-[380px] rounded-[1.6rem] bg-slate-900 p-1.5 shadow-xl ring-1 ring-slate-950/10 lg:w-[380px] lg:rounded-[2.6rem] lg:p-2.5">
        <div aria-hidden className="absolute left-1/2 top-2.5 z-10 hidden h-5 w-28 -translate-x-1/2 rounded-b-2xl bg-slate-900 lg:block" />
        <div className="h-[min(76vh,760px)] min-h-[520px] overflow-hidden rounded-[1.2rem] bg-sal lg:rounded-[2rem]">{children}</div>
      </div>
    </figure>
  );
}
