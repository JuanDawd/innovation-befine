/**
 * Apple touch icon (180×180) — T105
 */
import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: 180,
        height: 180,
        borderRadius: 40,
        background: "oklch(0.45 0.14 350)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <span
        style={{
          fontFamily: "serif",
          fontSize: 110,
          fontWeight: 700,
          color: "white",
          lineHeight: 1,
          letterSpacing: "-0.02em",
        }}
      >
        B
      </span>
    </div>,
    { ...size },
  );
}
