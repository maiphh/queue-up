import { clientCopy as c } from '@luotdi/shared';
import { Rail } from '../../components/Rail';

/** Client rail: only Thương hiệu is built in Round 4; the rest are placeholders. */
export function ClientRail() {
  return (
    <Rail
      active="brands"
      items={[
        { id: 'brands', icon: 'brands', label: c.nav.brands, to: '/client' },
        { id: 'wallet', icon: 'wallet', label: c.nav.wallet, placeholder: true },
        { id: 'reports', icon: 'reports', label: c.nav.reports, placeholder: true },
        { id: 'account', icon: 'clients', label: c.nav.account, placeholder: true },
      ]}
    />
  );
}
