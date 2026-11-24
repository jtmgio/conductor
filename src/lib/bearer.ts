/**
 * Bearer auth for clients that can't hold a NextAuth session (Todo.app, Siri, MCP).
 * Fails closed: with MCP_API_TOKEN unset, nothing passes.
 */
export function hasBearer(req: Request): boolean {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const expected = process.env.MCP_API_TOKEN;
  return !!expected && token === expected;
}
