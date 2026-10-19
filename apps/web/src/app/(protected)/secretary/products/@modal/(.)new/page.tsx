import { getTranslations } from "next-intl/server";
import { ModalShell } from "@/components/modal-shell";
import { NewProductContent } from "../../new-content";

export default async function SecretaryNewProductModal() {
  const t = await getTranslations("products");
  return (
    <ModalShell title={t("createProduct")} maxWidth="lg">
      <NewProductContent />
    </ModalShell>
  );
}
