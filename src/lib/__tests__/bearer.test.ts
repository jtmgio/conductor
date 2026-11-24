import { describe, it, expect, afterEach } from "vitest";
import { hasBearer } from "../bearer";

const req = (auth?: string) => new Request("http://x/", { headers: auth ? { authorization: auth } : {} });
const saved = process.env.MCP_API_TOKEN;
afterEach(() => { process.env.MCP_API_TOKEN = saved; });

describe("hasBearer", () => {
  it("acceptsTheToken", () => {
    process.env.MCP_API_TOKEN = "s3cret";
    expect(hasBearer(req("Bearer s3cret"))).toBe(true);
  });
  it("rejectsWrongOrMissing", () => {
    process.env.MCP_API_TOKEN = "s3cret";
    expect(hasBearer(req("Bearer nope"))).toBe(false);
    expect(hasBearer(req())).toBe(false);
  });
  it("failsClosedWhenUnset", () => {
    process.env.MCP_API_TOKEN = "";
    expect(hasBearer(req("Bearer "))).toBe(false);
  });
});
