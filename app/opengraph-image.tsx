import { ImageResponse } from "next/og";

export const alt = "BumpFree — Find time. Together.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-static";

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        background: "#0b0d14",
        color: "#f8fafc",
        padding: 72,
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: 600,
        }}
      >
        <div
          style={{
            display: "flex",
            color: "#a5b4fc",
            fontSize: 30,
            fontWeight: 700,
          }}
        >
          BumpFree
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 76,
            fontWeight: 700,
            letterSpacing: -3,
            lineHeight: 1.05,
          }}
        >
          <span>Find time.</span>
          <span>Together.</span>
        </div>
        <div style={{ display: "flex", color: "#94a3b8", fontSize: 24 }}>
          Your calendars. One shared view.
        </div>
      </div>
      <div
        style={{
          display: "flex",
          width: 400,
          height: 386,
          marginTop: 62,
          border: "1px solid #334155",
          borderRadius: 22,
          padding: 24,
          background: "#141927",
          gap: 12,
        }}
      >
        {["#818cf8", "#c084fc", "#38bdf8"].map((color, i) => (
          <div
            key={color}
            style={{
              display: "flex",
              flex: 1,
              flexDirection: "column",
              gap: 16,
              paddingTop: i * 34,
            }}
          >
            <div
              style={{
                display: "flex",
                height: 104,
                borderRadius: 10,
                background: color,
                opacity: 0.85,
              }}
            />
            <div
              style={{
                display: "flex",
                height: 54,
                borderRadius: 10,
                border: "2px dashed #34d399",
                background: "#12392e",
              }}
            />
            <div
              style={{
                display: "flex",
                height: 68,
                borderRadius: 10,
                background: color,
                opacity: 0.35,
              }}
            />
          </div>
        ))}
      </div>
    </div>,
    size,
  );
}
