import { getTranslations } from "next-intl/server";
import { ModalShell } from "@/components/modal-shell";
import { NewPedidoContent } from "../../new-content";

export default async function NewPedidoModal() {
  const t = await getTranslations("pedidos");
  return (
    <ModalShell title={t("newPedido")} maxWidth="2xl">
      <NewPedidoContent />
    </ModalShell>
  );
}
