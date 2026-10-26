import { access, copyFile, mkdir, open, readFile, readdir, rename, unlink } from "node:fs/promises";
import path from "node:path";

/**
 * 原子 JSON 文件负责“怎样安全写盘”，领域 Store 负责“什么数据可以写”。
 *
 * 把这两件事拆开后，配置和番茄记录可以共享同一套可靠性策略，同时各自保留
 * 独立的 schema 与业务规则。这是一个很小的 infrastructure 层，而不是数据库抽象。
 */
export class AtomicJsonFile {
  readonly filePath: string;
  private readonly backupDir: string;
  private readonly backupPrefix: string;

  constructor(filePath: string, backupPrefix: string) {
    this.filePath = filePath;
    this.backupDir = path.join(path.dirname(filePath), "backups");
    this.backupPrefix = backupPrefix;
  }

  async exists() {
    try { await access(this.filePath); return true; } catch { return false; }
  }

  async readText() {
    return readFile(this.filePath, "utf8");
  }

  async readBackupTexts() {
    try {
      const files = (await readdir(this.backupDir))
        .filter((file) => file.startsWith(`${this.backupPrefix}-`) && file.endsWith(".json"))
        .sort()
        .reverse();
      return Promise.all(files.map((file) => readFile(path.join(this.backupDir, file), "utf8")));
    } catch {
      return [];
    }
  }

  async write(value: unknown, backupCurrent = true) {
    const directory = path.dirname(this.filePath);
    await mkdir(directory, { recursive: true });
    await mkdir(this.backupDir, { recursive: true });
    if (backupCurrent && await this.exists()) await this.backupCurrent();

    // 临时文件必须与目标文件处于同一目录，rename 才能在同一文件系统内原子替换。
    const temporaryPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    const handle = await open(temporaryPath, "w");
    try {
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporaryPath, this.filePath);
  }

  private async backupCurrent() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      await copyFile(this.filePath, path.join(this.backupDir, `${this.backupPrefix}-${timestamp}.json`));
      const files = (await readdir(this.backupDir))
        .filter((file) => file.startsWith(`${this.backupPrefix}-`) && file.endsWith(".json"))
        .sort()
        .reverse();
      await Promise.all(files.slice(5).map((file) => unlink(path.join(this.backupDir, file))));
    } catch {
      // 备份是 best effort；主文件仍通过临时文件和 rename 保证不会写入半份 JSON。
    }
  }
}
