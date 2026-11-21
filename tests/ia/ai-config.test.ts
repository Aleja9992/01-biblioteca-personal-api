import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("configuración de IA", () => {
  it("declara las reglas obligatorias", () => {
    const instructions = read("ia/copilot-instructions.md");

    expect(instructions).toContain("No leer `.env*`, cuentas de servicio");
    expect(instructions).toContain(
      "No salir de `C:\\Users\\aleja\\Documents\\BibliotecaPersonal\\01-biblioteca-personal-api`",
    );
    expect(instructions).toContain("requieren autorización expresa");
  });

  it("ignora patrones de secretos en Git", () => {
    const gitignore = read(".gitignore");

    for (const pattern of [
      ".env",
      "*.pem",
      "*.key",
      "*.p12",
      "*.pfx",
      "serviceAccount*.json",
      "*credentials*.json",
    ]) {
      expect(gitignore.split(/\r?\n/)).toContain(pattern);
    }
  });

  it("mantiene las instrucciones locales del repositorio", () => {
    expect(fs.existsSync(path.join(root, "AGENTS.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, "ia", "copilot-instructions.md"))).toBe(true);
  });
});
