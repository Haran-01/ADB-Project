// PGlite has one connection: reserve it for the entire transaction, including rollback.
export function createPglitePool(db) {
  let pending = Promise.resolve();
  async function connect() {
    const previous = pending;
    let unlock;
    pending = new Promise((resolve) => { unlock = resolve; });
    await previous;
    let released = false;
    return {
      query: (...args) => {
        if (released) throw new Error('Connection already released');
        return db.query(...args);
      },
      release() { released = true; unlock(); },
    };
  }
  return {
    connect,
    async query(...args) {
      const client = await connect();
      try { return await client.query(...args); }
      finally { client.release(); }
    },
    async close() { await pending; await db.close(); },
  };
}
