/**
 * Per-branch live queue WebSocket room.
 *
 * RED stub: accepts WebSocket upgrades so clients can connect, but does not
 * parse HELLO attachments or fan out QUEUE_UPDATED / YOUR_TURN_CALLED.
 * POST /broadcast returns 501 until GREEN implements hibernation broadcast.
 *
 * GREEN contract:
 * - Upgrade → WebSocketPair + `this.state.acceptWebSocket(server)` (hibernation)
 * - HELLO → serializeAttachment({ role, ticketId?, branchId })
 * - POST /broadcast (BranchQueueBroadcastRequest) → broadcast QUEUE_UPDATED to
 *   all sockets; send YOUR_TURN_CALLED only to CUSTOMER with matching ticketId
 * - Host SUMMON (and later actions) POSTs /broadcast via BRANCH_QUEUE_ROOM stub
 */
export class BranchQueueRoom {
  constructor(private readonly state: DurableObjectState) {
    void this.state;
  }

  async fetch(request: Request): Promise<Response> {
    const upgrade = request.headers.get('Upgrade');
    if (upgrade?.toLowerCase() === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      // Stub accept only — GREEN switches to hibernation acceptWebSocket.
      server.accept();
      server.addEventListener('message', () => {
        /* HELLO / client messages ignored until GREEN */
      });
      return new Response(null, { status: 101, webSocket: client });
    }

    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname.endsWith('/broadcast')) {
      return new Response('BranchQueueRoom broadcast not implemented', {
        status: 501,
      });
    }

    return new Response('BranchQueueRoom stub', { status: 501 });
  }
}
