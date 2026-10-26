import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const documents = ["README.md", "docs/ARCHITECTURE.md", "docs/CODE-TOUR.md", "docs/DECISIONS.md", "docs/INDUSTRY-ALTERNATIVES.md", "docs/BUILD-YOUR-OWN.md", "docs/GLOSSARY.md"];

describe("engineering learning documentation", () => {
  it("keeps every documented entry point present", async () => {
    await Promise.all(documents.map((file) => access(path.join(root, file))));
    const readme = await readFile(path.join(root, "README.md"), "utf8");
    for (const file of documents.slice(1)) expect(readme).toContain(`(${file})`);
  });

  it("contains architecture diagrams and why/alternatives/trade-off guidance", async () => {
    const architecture = await readFile(path.join(root, "docs/ARCHITECTURE.md"), "utf8");
    expect((architecture.match(/```mermaid/g) ?? []).length).toBeGreaterThanOrEqual(4);
    const decisions = await readFile(path.join(root, "docs/DECISIONS.md"), "utf8");
    for (const heading of ["Context", "Constraints", "Decision", "Why", "Alternatives", "Consequences", "Revisit when"]) expect(decisions).toContain(`**${heading}**`);
    const alternatives = await readFile(path.join(root, "docs/INDUSTRY-ALTERNATIVES.md"), "utf8");
    for (const option of ["SQLite", "PostgreSQL", "WebSocket", "TanStack Query", "微服务", "任务队列"]) expect(alternatives).toContain(option);
  });
});
