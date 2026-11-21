import { describe, expect, it } from "vitest";
import { GET } from "../../app/api/health/route";

describe("GET /api/health", () => {
  it("returns HTTP 200 with a JSON content type", () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("returns the expected health status", async () => {
    const response = GET();

    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });
});
