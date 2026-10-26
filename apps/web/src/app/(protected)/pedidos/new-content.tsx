import { redirect } from "next/navigation";
import { getPedidoFormData } from "./actions";
import { PedidoForm } from "./pedido-form";

/** Shared by the `new` modal (intercepted) and the full `/new` page (direct load / refresh). */
export async function NewPedidoContent() {
  const res = await getPedidoFormData();
  if (!res.success) redirect("/403");
  return <PedidoForm data={res.data} />;
}
