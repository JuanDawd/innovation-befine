import { describe, expect, it } from "vitest";
import { breakingStatements, outOfOrder } from "./migration-check";

describe("outOfOrder", () => {
  it("accepts ascending timestamps", () => {
    expect(
      outOfOrder([
        { tag: "a", when: 1 },
        { tag: "b", when: 2 },
      ]),
    ).toEqual([]);
  });

  it("names a migration dated before the newest one", () => {
    expect(
      outOfOrder([
        { tag: "a", when: 5 },
        { tag: "b", when: 3 },
      ]),
    ).toEqual(["b"]);
  });

  it("ignores the three already known", () => {
    expect(
      outOfOrder([
        { tag: "a", when: 5 },
        { tag: "0026_craftable_selling_price", when: 3 },
      ]),
    ).toEqual([]);
  });
});

describe("breakingStatements", () => {
  it.each([
    'ALTER TABLE "a" DROP COLUMN "b";',
    'DROP TABLE "a";',
    'ALTER TABLE "a" RENAME COLUMN "b" TO "c";',
    'ALTER TABLE "a" RENAME TO "b";',
    'ALTER TABLE "a" ALTER COLUMN "b" SET DATA TYPE text;',
    'TRUNCATE "a";',
    'DELETE FROM "a";',
  ])("flags %s", (sql) => {
    expect(breakingStatements(sql)).toEqual([sql]);
  });

  it.each([
    'ALTER TABLE "a" ADD COLUMN "b" integer;',
    'CREATE INDEX "i" ON "a" ("b");',
    "-- DROP TABLE a used to be here",
    'ALTER TABLE "a" SET SCHEMA "archive";',
  ])("allows %s", (sql) => {
    expect(breakingStatements(sql)).toEqual([]);
  });

  it("accepts a statement someone reviewed", () => {
    expect(breakingStatements('-- migration-safe: unused since #40\nDROP TABLE "a";')).toEqual([]);
    expect(breakingStatements('-- migration-safe:\nDROP TABLE "a";')).toHaveLength(1);
  });
});
