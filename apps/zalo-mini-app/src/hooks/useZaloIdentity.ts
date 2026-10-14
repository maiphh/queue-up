/**
 * Zalo identity for ticket issuance.
 * RED stub — GREEN: zmp-sdk getUserInfo; local-dev UUID fallback.
 */

export type ZaloIdentity = {
  zaloUserId: string;
  customerName: string;
  ready: boolean;
};

export function useZaloIdentity(): ZaloIdentity {
  return {
    zaloUserId: 'dev-anonymous',
    customerName: 'Guest',
    ready: true,
  };
}
