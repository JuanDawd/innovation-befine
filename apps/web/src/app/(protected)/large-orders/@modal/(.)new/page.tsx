import { getTranslations } from "next-intl/server";
import { ModalShell } from "@/components/modal-shell";
import { NewLargeOrderContent } from "../../new-content";

export default async function NewLargeOrderModal() {
  const t = await getTranslations("largeOrders");
  return (
    <ModalShell title={t("newOrder")} maxWidth="xl">
      <NewLargeOrderContent />
    </ModalShell>
  );
}
