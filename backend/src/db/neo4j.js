import neo4j from 'neo4j-driver';
export function createNeo4j(env) {
  return neo4j.driver(env.NEO4J_URI, neo4j.auth.basic(env.NEO4J_USER, env.NEO4J_PASSWORD), {
    connectionTimeout: 10000,
    connectionAcquisitionTimeout: 15000,
    maxTransactionRetryTime: 10000,
    disableLosslessIntegers: true,
    maxConnectionPoolSize: 10,
  });
}
