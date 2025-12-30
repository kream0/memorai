import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoraiClient } from '../src/client.js';

describe('MemoraiClient', () => {
  let tempDir: string;
  let client: MemoraiClient;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'memorai-test-'));
    client = new MemoraiClient({ projectDir: tempDir });
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('init', () => {
    test('should initialize database successfully', () => {
      const result = client.init();

      expect(result.success).toBe(true);
      expect(result.createdNew).toBe(true);
      expect(result.message).toBe('Memorai initialized successfully');
      expect(client.isInitialized()).toBe(true);
    });

    test('should report existing database', () => {
      client.init();
      const result = client.init();

      expect(result.success).toBe(true);
      expect(result.createdNew).toBe(false);
      expect(result.message).toBe('Memorai database already exists');
    });
  });

  describe('store', () => {
    beforeEach(() => {
      client.init();
    });

    test('should store a memory', () => {
      const result = client.store({
        category: 'decisions',
        title: 'Test Decision',
        content: 'This is a test decision about authentication.',
        tags: ['auth', 'test'],
        importance: 8,
      });

      expect(result.success).toBe(true);
      expect(result.id).toBeDefined();
      expect(result.category).toBe('decisions');
      expect(result.title).toBe('Test Decision');
      expect(result.importance).toBe(8);
    });

    test('should auto-generate summary', () => {
      const result = client.store({
        category: 'architecture',
        title: 'API Design',
        content: 'We chose REST over GraphQL for simplicity.\n\nMore details here.',
      });

      expect(result.success).toBe(true);
      expect(result.summary).toBe('We chose REST over GraphQL for simplicity.');
    });

    test('should use default importance', () => {
      const result = client.store({
        category: 'notes',
        title: 'Simple Note',
        content: 'Just a note.',
      });

      expect(result.success).toBe(true);
      expect(result.importance).toBe(5);
    });
  });

  describe('search', () => {
    beforeEach(() => {
      client.init();
      client.store({
        category: 'decisions',
        title: 'Authentication Decision',
        content: 'We chose JWT tokens for authentication because they are stateless.',
        tags: ['auth', 'jwt'],
        importance: 8,
      });
      client.store({
        category: 'architecture',
        title: 'Database Choice',
        content: 'We use PostgreSQL for the main database.',
        tags: ['database'],
        importance: 7,
      });
    });

    test('should find memory by keyword', () => {
      const results = client.search({ query: 'authentication' });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.title).toBe('Authentication Decision');
    });

    test('should filter by category', () => {
      const results = client.search({
        query: 'database',
        category: 'architecture',
      });

      expect(results.length).toBe(1);
      expect(results[0]?.category).toBe('architecture');
    });

    test('should return empty array for no matches', () => {
      const results = client.search({ query: 'nonexistent' });

      expect(results.length).toBe(0);
    });
  });

  describe('get', () => {
    beforeEach(() => {
      client.init();
    });

    test('should get memory by id', () => {
      const stored = client.store({
        category: 'notes',
        title: 'Test Note',
        content: 'Full content here.',
      });

      const memory = client.get(stored.id!, { full: true });

      expect(memory).not.toBeNull();
      expect(memory?.title).toBe('Test Note');
      expect('content' in memory!).toBe(true);
    });

    test('should return null for non-existent id', () => {
      const memory = client.get('nonexistent');

      expect(memory).toBeNull();
    });
  });

  describe('stats', () => {
    beforeEach(() => {
      client.init();
    });

    test('should return stats', () => {
      client.store({
        category: 'decisions',
        title: 'Decision 1',
        content: 'Content',
        importance: 9,
      });
      client.store({
        category: 'decisions',
        title: 'Decision 2',
        content: 'Content',
      });
      client.store({
        category: 'notes',
        title: 'Note 1',
        content: 'Content',
      });

      const stats = client.stats();

      expect(stats.initialized).toBe(true);
      expect(stats.total).toBe(3);
      expect(stats.byCategory.decisions).toBe(2);
      expect(stats.byCategory.notes).toBe(1);
      expect(stats.important.length).toBeGreaterThan(0);
    });
  });

  describe('delete', () => {
    beforeEach(() => {
      client.init();
    });

    test('should delete a memory', () => {
      const stored = client.store({
        category: 'notes',
        title: 'To Delete',
        content: 'Content',
      });

      const result = client.delete(stored.id!);

      expect(result.success).toBe(true);
      expect(result.title).toBe('To Delete');

      const memory = client.get(stored.id!);
      expect(memory).toBeNull();
    });

    test('should return error for non-existent id', () => {
      const result = client.delete('nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('update', () => {
    beforeEach(() => {
      client.init();
    });

    test('should update memory content', () => {
      const stored = client.store({
        category: 'notes',
        title: 'Original Title',
        content: 'Original content.',
      });

      const result = client.update(stored.id!, {
        title: 'Updated Title',
        content: 'Updated content.',
        importance: 9,
      });

      expect(result.success).toBe(true);

      const memory = client.get(stored.id!, { full: true });
      expect(memory?.title).toBe('Updated Title');
      expect('content' in memory! && memory.content).toBe('Updated content.');
    });
  });

  describe('listCategory', () => {
    beforeEach(() => {
      client.init();
      for (let i = 0; i < 5; i++) {
        client.store({
          category: 'decisions',
          title: `Decision ${i}`,
          content: `Content ${i}`,
          importance: i + 3,
        });
      }
    });

    test('should list memories in category', () => {
      const results = client.listCategory('decisions');

      expect(results.length).toBe(5);
      expect(results[0]?.category).toBe('decisions');
    });

    test('should filter by importance', () => {
      const results = client.listCategory('decisions', { importanceMin: 6 });

      expect(results.every((m) => m.importance >= 6)).toBe(true);
    });

    test('should limit results', () => {
      const results = client.listCategory('decisions', { limit: 2 });

      expect(results.length).toBe(2);
    });
  });

  describe('listAll', () => {
    beforeEach(() => {
      client.init();
      client.store({ category: 'decisions', title: 'D1', content: 'C' });
      client.store({ category: 'architecture', title: 'A1', content: 'C' });
      client.store({ category: 'notes', title: 'N1', content: 'C' });
    });

    test('should list all grouped by category', () => {
      const all = client.listAll();

      expect(all.decisions.length).toBe(1);
      expect(all.architecture.length).toBe(1);
      expect(all.notes.length).toBe(1);
      expect(all.reports.length).toBe(0);
    });
  });

  describe('getRecent', () => {
    beforeEach(() => {
      client.init();
      for (let i = 0; i < 5; i++) {
        client.store({
          category: 'notes',
          title: `Note ${i}`,
          content: 'C',
        });
      }
    });

    test('should get recent memories', () => {
      const recent = client.getRecent(3);

      expect(recent.length).toBe(3);
    });

    test('should filter by category', () => {
      client.store({ category: 'decisions', title: 'D1', content: 'C' });

      const recent = client.getRecent(10, 'decisions');

      expect(recent.length).toBe(1);
      expect(recent[0]?.category).toBe('decisions');
    });
  });

  describe('scan', () => {
    test('should scan project structure', () => {
      client.init();
      const result = client.scan();

      expect(result.scanDate).toBeDefined();
      expect(result.structure).toBeDefined();
      expect(result.structure.totalFiles).toBeGreaterThanOrEqual(0);
      expect(result.patterns).toBeDefined();
      expect(result.documentation).toBeDefined();
      expect(result.recommendations).toBeDefined();
    });
  });
});

describe('generateSummary', async () => {
  const { generateSummary } = await import('../src/operations/store.js');

  test('should extract first paragraph', () => {
    const content = 'First paragraph here.\n\nSecond paragraph here.';
    const summary = generateSummary(content);

    expect(summary).toBe('First paragraph here.');
  });

  test('should remove markdown headers', () => {
    const content = '# Title\nActual content here.';
    const summary = generateSummary(content);

    expect(summary).toBe('Actual content here.');
  });

  test('should truncate long content', () => {
    const content = 'A'.repeat(300);
    const summary = generateSummary(content, 200);

    expect(summary.length).toBeLessThanOrEqual(203); // 200 + '...'
  });

  test('should break at sentence when truncating', () => {
    const content =
      'First sentence here. Second sentence is much longer and will need to be truncated somewhere.';
    const summary = generateSummary(content, 50);

    expect(summary.endsWith('.')).toBe(true);
  });
});
