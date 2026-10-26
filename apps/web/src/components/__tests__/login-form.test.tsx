import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";

// L-01 — feedback and lockout after the sign-in rate limit (429).

const signInEmail = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth-client", () => ({ signIn: { email: signInEmail } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { LoginForm } from "../login-form";

function renderForm() {
  render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <LoginForm />
    </NextIntlClientProvider>,
  );
  fireEvent.change(screen.getByLabelText(/correo/i), { target: { value: "ana@example.com" } });
  fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: "secreta123" } });
}

const submit = () => screen.getByRole("button", { name: /iniciar sesión|intenta de nuevo/i });

describe("LoginForm rate limit", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    signInEmail.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("explains the limit and disables sign-in for 60 s, counting down", async () => {
    signInEmail.mockResolvedValue({ error: { status: 429 } });
    renderForm();
    await act(async () => fireEvent.click(submit()));

    expect(await screen.findByRole("alert")).toHaveTextContent("Espera un minuto");
    expect(submit()).toBeDisabled();
    expect(submit()).toHaveTextContent("Intenta de nuevo en 60 s");

    await act(async () => vi.advanceTimersByTime(1_000));
    expect(submit()).toHaveTextContent("59 s");

    for (let i = 0; i < 59; i++) await act(async () => vi.advanceTimersByTime(1_000));
    expect(submit()).toBeEnabled();
    expect(submit()).toHaveTextContent("Iniciar sesión");
  });

  it("wrong password shows the credentials error without locking", async () => {
    signInEmail.mockResolvedValue({ error: { status: 401 } });
    renderForm();
    await act(async () => fireEvent.click(submit()));
    expect(await screen.findByRole("alert")).toHaveTextContent("Correo o contraseña incorrectos");
    expect(submit()).toBeEnabled();
  });
});

describe("LoginForm before hydration (H-61)", () => {
  it("posts natively, so credentials never end up in the URL", () => {
    renderForm();
    const form = submit().closest("form")!;
    expect(form.getAttribute("method")).toBe("post");
  });
});
