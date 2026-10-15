/**
 * Real ZNS sender — Zalo Notification Service template message.
 * Docs: https://developers.zalo.me/docs/zalo-notification-service/gui-tin-zns/gui-zns
 *
 * POST https://business.openapi.zalo.me/message/template
 *   headers: access_token: <OA access token>
 *   body: { phone, template_id, template_data, tracking_id, mode? }
 *   ok:   { error: 0, data: { msg_id, sent_time, quota } }
 *
 * Secrets (wrangler secret put): ZALO_OA_ACCESS_TOKEN, ZNS_TEMPLATE_APPROACHING_ID.
 * `tracking_id` = the wallet dedupe key (zns_approaching_<ticketId>) so the
 * ZNS delivery webhook can be matched to the ledger row.
 */

import {
  znsApproachingIdempotencyKey,
  type ZnsApproachingDispatch,
} from '@luotdi/shared';
import type { ZnsSender } from './zns-dispatcher';

export const ZNS_TEMPLATE_URL = 'https://business.openapi.zalo.me/message/template';

export class ZnsSendError extends Error {
  constructor(
    message: string,
    readonly zaloError?: number,
  ) {
    super(message);
    this.name = 'ZnsSendError';
  }
}

/** ZNS expects `84xxxxxxxxx` (no +, no leading 0). */
export function toZnsPhone(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, '');
  if (/^84\d{9,10}$/.test(digits)) return digits;
  if (/^0\d{9,10}$/.test(digits)) return `84${digits.slice(1)}`;
  return null;
}

export type ZaloZnsSenderConfig = {
  accessToken: string;
  approachingTemplateId: string;
  developmentMode?: boolean;
  fetchImpl?: typeof fetch;
};

export class ZaloZnsSender implements ZnsSender {
  readonly requiresRecipient = true;

  constructor(private readonly cfg: ZaloZnsSenderConfig) {}

  async sendApproachingTurn(payload: ZnsApproachingDispatch): Promise<void> {
    const phone = payload.phone ? toZnsPhone(payload.phone) : null;
    if (!phone) throw new ZnsSendError('missing or invalid recipient phone');

    const body: Record<string, unknown> = {
      phone,
      template_id: this.cfg.approachingTemplateId,
      // ⚠️ Keys must match the approved template's parameter names in ZCA.
      template_data: {
        ticket_number: payload.displayNumber,
        parties_ahead: String(payload.partiesAhead),
        ...(payload.branchName ? { branch_name: payload.branchName } : {}),
      },
      tracking_id: znsApproachingIdempotencyKey(payload.ticketId),
    };
    if (this.cfg.developmentMode) body.mode = 'development';

    const doFetch = this.cfg.fetchImpl ?? fetch;
    const res = await doFetch(ZNS_TEMPLATE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        access_token: this.cfg.accessToken,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new ZnsSendError(`ZNS HTTP ${res.status}`);
    const json = (await res.json().catch(() => ({}))) as {
      error?: number;
      message?: string;
    };
    if (json.error !== 0) {
      throw new ZnsSendError(json.message ?? 'ZNS error', json.error);
    }
  }
}

/** Build the sender from env; undefined when secrets are not configured. */
export function znsSenderFromEnv(env: {
  ZALO_OA_ACCESS_TOKEN?: string;
  ZNS_TEMPLATE_APPROACHING_ID?: string;
  ZNS_DEVELOPMENT_MODE?: string;
}): ZnsSender | undefined {
  if (!env.ZALO_OA_ACCESS_TOKEN || !env.ZNS_TEMPLATE_APPROACHING_ID) return undefined;
  return new ZaloZnsSender({
    accessToken: env.ZALO_OA_ACCESS_TOKEN,
    approachingTemplateId: env.ZNS_TEMPLATE_APPROACHING_ID,
    developmentMode: env.ZNS_DEVELOPMENT_MODE === '1',
  });
}
