/**
 * Password reset email template — T054 / T017
 *
 * Sent when a user requests a password reset.
 * Uses React Email components for cross-client compatibility.
 */

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface PasswordResetEmailProps {
  resetUrl: string;
  userName?: string;
}

export function PasswordResetEmail({ resetUrl, userName }: PasswordResetEmailProps) {
  const greeting = userName ? `Hola ${userName},` : "Hola,";

  return (
    <Html lang="es">
      <Head />
      <Preview>Restablecer tu contraseña — Innovation Befine</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Innovation Befine</Heading>
          <Text style={text}>{greeting}</Text>
          <Text style={text}>
            Recibimos una solicitud para restablecer la contraseña de tu cuenta. Haz clic en el
            botón de abajo para continuar. El enlace expira en 1 hora.
          </Text>
          <Section style={buttonContainer}>
            <Button style={button} href={resetUrl}>
              Restablecer contraseña
            </Button>
          </Section>
          <Text style={text}>
            Si no solicitaste este cambio, puedes ignorar este mensaje. Tu contraseña seguirá siendo
            la misma.
          </Text>
          <Hr style={hr} />
          <Text style={footer}>Innovation Befine · Sistema de operaciones internas</Text>
        </Container>
      </Body>
    </Html>
  );
}

const main: React.CSSProperties = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
};

const container: React.CSSProperties = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "20px 0 48px",
  marginBottom: "64px",
  maxWidth: "560px",
};

const h1: React.CSSProperties = {
  color: "#333",
  fontSize: "24px",
  fontWeight: "bold",
  margin: "40px 0",
  padding: "0 40px",
};

const text: React.CSSProperties = {
  color: "#555",
  fontSize: "15px",
  lineHeight: "1.6",
  margin: "0 0 16px",
  padding: "0 40px",
};

const buttonContainer: React.CSSProperties = {
  padding: "16px 40px",
};

const button: React.CSSProperties = {
  backgroundColor: "#18181b",
  borderRadius: "8px",
  color: "#fff",
  fontSize: "14px",
  fontWeight: "600",
  textDecoration: "none",
  textAlign: "center",
  display: "block",
  padding: "12px 24px",
};

const hr: React.CSSProperties = {
  borderColor: "#e6ebf1",
  margin: "32px 40px",
};

const footer: React.CSSProperties = {
  color: "#8898aa",
  fontSize: "12px",
  lineHeight: "16px",
  padding: "0 40px",
};
