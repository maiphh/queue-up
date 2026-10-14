/** Durable Object stub for per-branch live queue WebSockets — Phase 1+ */
export class BranchQueueRoom {
  constructor(private readonly state: DurableObjectState) {
    void this.state;
  }

  async fetch(_request: Request): Promise<Response> {
    return new Response('BranchQueueRoom stub', { status: 501 });
  }
}
