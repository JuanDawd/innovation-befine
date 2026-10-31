// "@testing-library/jest-dom/vitest" doesn't work with Vitest 5: its matchers don't
// register and its types target the old single-parameter Assertion<T>.
import { expect } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";

expect.extend(matchers);
