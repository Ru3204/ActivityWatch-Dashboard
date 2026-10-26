interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

export class MemoryCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlSeconds: number) {
    const now = Date.now();
    for (const [entryKey, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(entryKey);
    }
    this.entries.delete(key);
    // Bound memory as date ranges and category configurations change.
    if (this.entries.size >= 1024) this.entries.delete(this.entries.keys().next().value!);
    this.entries.set(key, { value, expiresAt: now + ttlSeconds * 1000 });
  }

  clear() {
    this.entries.clear();
  }
}

