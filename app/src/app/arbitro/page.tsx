import { redirect } from "next/navigation";

/** El panel del "árbitro" ahora se llama panel del revisor. */
export default function Arbitro() {
  redirect("/revisor");
}
