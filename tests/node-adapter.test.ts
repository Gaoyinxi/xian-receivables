import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { NativeDatabase, LocalFiles } from '../db/adapters/node';

void test('Native SQLite preserves immutable bindings, query results and changes() within atomic batches', async () => {
  const db = new NativeDatabase(':memory:');
  try {
    await db
      .prepare('CREATE TABLE items(id TEXT PRIMARY KEY, amount INTEGER)')
      .run();
    await db.prepare('CREATE TABLE audit(id TEXT)').run();
    const statement = db.prepare('INSERT INTO items VALUES (?, ?)');
    const one = statement.bind('one', 100);
    const two = statement.bind('two', 200);
    const results = await db.batch([
      one,
      two,
      db.prepare('UPDATE items SET amount=1 WHERE id=?').bind('missing'),
      db.prepare('INSERT INTO audit SELECT ? WHERE changes()=1').bind('wrong'),
      db.prepare('SELECT amount FROM items ORDER BY amount'),
    ]);
    assert.deepEqual(
      results.map((result) => result.meta.changes),
      [1, 1, 0, 0, 0],
    );
    assert.deepEqual(
      results[4].results.map((row) => row.amount),
      [100, 200],
    );
    assert.equal(await db.prepare('SELECT id FROM audit').first(), null);
    await assert.rejects(
      db.batch([statement.bind('three', 300), statement.bind('one', 400)]),
      /UNIQUE/,
    );
    assert.equal(
      await db.prepare("SELECT id FROM items WHERE id='three'").first(),
      null,
    );
    const returning = await db
      .prepare("UPDATE items SET amount=101 WHERE id='one' RETURNING amount")
      .first<{ amount: number }>();
    assert.equal(returning?.amount, 101);
    const foreign = await db
      .prepare('PRAGMA foreign_keys')
      .first<{ foreign_keys: number }>();
    assert.equal(foreign?.foreign_keys, 1);
  } finally {
    db.close();
  }
});

void test('Filesystem attachment adapter is exclusive, durable, traversal-safe and rejects symlinks', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'receivables-adapter-'));
  try {
    const files = new LocalFiles(join(scratch, 'files'));
    const key = 'attachments/project/test-id/valid.pdf';
    const payload = new TextEncoder().encode('%PDF-1.4 test');
    await files.put(key, payload.buffer);
    await assert.rejects(files.put(key, payload.buffer), /EEXIST/);
    assert.deepEqual((await files.get(key))?.body, payload);
    assert.throws(() => files.pathForKey('attachments/../../secrets'), /无效/);
    assert.throws(() => files.pathForKey('/etc/passwd'), /无效/);
    const evil = 'attachments/project/test-id/link.pdf';
    await symlink(files.pathForKey(key), files.pathForKey(evil));
    await assert.rejects(files.get(evil));
    await files.delete(key);
    assert.equal(await files.get(key), null);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
