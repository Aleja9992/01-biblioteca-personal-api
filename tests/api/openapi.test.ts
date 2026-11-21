import { describe, expect, it } from "vitest";
import { GET as getDocs } from "../../app/api/docs/route";
import { GET as getOpenApi } from "../../app/api/openapi.json/route";

describe("API documentation", () => {
  it("returns Swagger UI as HTML", async () => {
    const response = getDocs();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    await expect(response.text()).resolves.toContain("/api/openapi.json");
  });

  it("returns a valid OpenAPI 3.1 document", async () => {
    const response = getOpenApi();
    const document = await response.json();

    expect(response.status).toBe(200);
    expect(document.openapi).toBe("3.1.0");
    expect(document.paths["/api/health"]).toBeDefined();
    expect(document.paths["/api/libros"]).toBeDefined();
  });
});
