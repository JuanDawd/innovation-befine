/**
 * Dynamic favicon — T105
 * Next.js uses this file to generate the favicon at /favicon.ico
 * and the <link rel="icon"> tags automatically.
 */
import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        background: "#7a1f3d",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <span
        style={{
          fontFamily: "serif",
          fontSize: 20,
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
