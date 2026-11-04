import { clientStatus } from './clientStatus';
import { fold } from './search';
import type { Client, ClientStatus } from './types';

export function indexClientDirectory(clients: readonly Client[]) {
  return clients.map(client => ({ client, text: fold(`${client.name} ${client.email ?? ''}`).folded }));
}

/** Search the decrypted in-memory index; keep the chosen status filter explicit. */
export function findDirectoryClients(index: ReturnType<typeof indexClientDirectory>, query: string, status: ClientStatus | 'all') {
  const words = fold(query).folded.split(/\s+/).filter(Boolean);
  const matches = index.filter(row => words.every(word => row.text.includes(word)));
  const visible = matches.filter(row => status === 'all' || clientStatus(row.client) === status).map(row => row.client);
  return { visible, otherCount: words.length ? matches.length - visible.length : 0 };
}
