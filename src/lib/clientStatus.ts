import { uid, type Client, type ClientStatus } from './types';
export const clientStatus = (client: Pick<Client, 'id' | 'status'>): ClientStatus => client.status ?? 'active';
export function changeClientStatus(client: Client, status: ClientStatus, at = new Date().toISOString()) {
  if (clientStatus(client) === status) return;
  client.statusHistory = [...client.statusHistory ?? [{ id: `${client.id}:initial-status`, status: clientStatus(client), at: client.createdAt }], { id: uid(), status, at }];
  client.status = status;
}
