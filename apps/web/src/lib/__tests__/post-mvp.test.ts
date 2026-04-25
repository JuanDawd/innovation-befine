import { describe, expect, it } from "vitest";
import { parsePostMvp } from "../post-mvp";

const SAMPLE = `# Post-MVP Roadmap

---

## 1. UI / UX redesign

Intro about the UI redesign.

### 1.1 Icon audit

- Lucide only.
- Aria labels on icon-only buttons.

---

### 1.2 Responsive layout

Some text about responsive.

---

## 2. Feature additions

### 2.1 Push notifications

Stretch goal.

### 2.7 Appointment confirmation emails

Deferred from MVP T055.

---

## Appendix — things out of scope

Ignore me.
`;

describe("parsePostMvp", () => {
  it("parses categories with their numeric prefix and slug", () => {
    const snap = parsePostMvp(SAMPLE);
    expect(snap.categories.map((c) => c.number)).toEqual(["1", "2"]);
    expect(snap.categories[0].title).toBe("UI / UX redesign");
    expect(snap.categories[0].slug).toMatch(/^1-ui/);
  });

  it("groups items under their category and preserves the dotted id", () => {
    const snap = parsePostMvp(SAMPLE);
    expect(snap.categories[0].items.map((i) => i.id)).toEqual(["1.1", "1.2"]);
    expect(snap.categories[1].items.map((i) => i.id)).toEqual(["2.1", "2.7"]);
  });

  it("ignores the Appendix and other non-numeric h2 headings", () => {
    const snap = parsePostMvp(SAMPLE);
    expect(snap.categories.find((c) => c.title.startsWith("Appendix"))).toBeUndefined();
  });

  it("captures item body up to the next --- but not into the next item", () => {
    const snap = parsePostMvp(SAMPLE);
    const t27 = snap.categories[1].items.find((i) => i.id === "2.7");
    expect(t27?.body).toContain("Deferred from MVP T055");
  });

  it("totals item count across all categories", () => {
    const snap = parsePostMvp(SAMPLE);
    expect(snap.totalItems).toBe(4);
  });
});
