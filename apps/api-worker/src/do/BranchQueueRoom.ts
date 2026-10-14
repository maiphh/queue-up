import {
  BranchQueueBroadcastRequestSchema,
  WsClientHelloSchema,
  type QueueUpdatedEvent,
  type WsClientRole,
  type YourTurnCalledEvent,
} from '@luotdi/shared';

type SocketAttachment = {
  role: WsClientRole;
  branchId: string;
  ticketId?: string;
};

/**
 * Per-branch live queue WebSocket room (hibernation API).
 *
 * - Upgrade → WebSocketPair + `state.acceptWebSocket(server)`
 * - HELLO → serializeAttachment({ role, ticketId?, branchId })
 * - POST /broadcast → QUEUE_UPDATED to all; YOUR_TURN_CALLED to matching CUSTOMER
 */
export class BranchQueueRoom {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const upgrade = request.headers.get('Upgrade');
    if (upgrade?.toLowerCase() === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      this.state.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname.endsWith('/broadcast')) {
      return this.handleBroadcast(request);
    }

    return new Response('Not found', { status: 404 });
  }

  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    const text =
      typeof message === 'string'
        ? message
        : new TextDecoder().decode(message);

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return;
    }

    const hello = WsClientHelloSchema.safeParse(json);
    if (!hello.success) return;

    const attachment: SocketAttachment = {
      role: hello.data.role,
      branchId: hello.data.branchId,
      ticketId: hello.data.ticketId,
    };
    ws.serializeAttachment(attachment);
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    try {
      ws.close(code, reason);
    } catch {
      /* already closed */
    }
  }

  private async handleBroadcast(request: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }

    const parsed = BranchQueueBroadcastRequestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response('Invalid broadcast body', { status: 400 });
    }

    const { branchId, ticketId, displayNumber, status } = parsed.data;
    const at = parsed.data.at ?? Date.now();

    const queueUpdated: QueueUpdatedEvent = {
      type: 'QUEUE_UPDATED',
      branchId,
      ticketId,
      displayNumber,
      status,
      at,
    };

    const yourTurn: YourTurnCalledEvent = {
      type: 'YOUR_TURN_CALLED',
      branchId,
      ticketId,
      displayNumber,
      at,
    };

    const queuePayload = JSON.stringify(queueUpdated);
    const turnPayload = JSON.stringify(yourTurn);

    for (const socket of this.state.getWebSockets()) {
      try {
        socket.send(queuePayload);

        const attachment =
          socket.deserializeAttachment() as SocketAttachment | null;
        if (
          attachment?.role === 'CUSTOMER' &&
          attachment.ticketId === ticketId
        ) {
          socket.send(turnPayload);
        }
      } catch {
        /* socket may be closing */
      }
    }

    return new Response(null, { status: 204 });
  }
}
