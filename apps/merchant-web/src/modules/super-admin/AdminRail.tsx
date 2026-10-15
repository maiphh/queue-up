import { adminCopy as a } from '@luotdi/shared';
import { Rail } from '../../components/Rail';

/** Admin rail: Client + Thêm are built; Ví & gói, Hệ thống, Cài đặt stay placeholders (Round 4). */
export function AdminRail({ active, onAdd, onList }: { active: 'clients' | 'add'; onAdd: () => void; onList: () => void }) {
  return (
    <Rail
      active={active}
      items={[
        { id: 'clients', icon: 'clients', label: a.nav.clients, onClick: onList },
        { id: 'add', icon: 'plus', label: a.nav.add, onClick: onAdd },
        { id: 'wallet', icon: 'wallet', label: a.nav.wallet, placeholder: true },
        { id: 'system', icon: 'system', label: a.nav.system, placeholder: true },
        { id: 'settings', icon: 'settings', label: a.nav.settings, placeholder: true },
      ]}
    />
  );
}
