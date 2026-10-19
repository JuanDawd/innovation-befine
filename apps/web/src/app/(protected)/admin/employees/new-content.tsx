import { CreateEmployeeFormPage } from "@/components/create-employee-form-page";

/** Shared by the `new` modal (intercepted) and the full `/new` page (direct load / refresh). */
export async function NewEmployeeContent() {
  return <CreateEmployeeFormPage />;
}
