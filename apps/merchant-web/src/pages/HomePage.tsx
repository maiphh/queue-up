import { useNavigate } from 'react-router-dom';
import { adminCopy, managerCopy } from '@luotdi/shared';
import { GridCell, KeycapButton } from '@luotdi/ui-braun';
import { writeDevActor } from '../dev/actor';

const ADMIN_BLURB = 'Thêm client và xem mọi cơ sở';
const CLIENT_BLURB = 'Xem thương hiệu và chi nhánh';
const MANAGER_BLURB = 'Gọi số tại quầy';

export function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-chassis">
      <header className="border-b border-grid bg-ink px-4 py-4 text-panel">
        <h1 className="font-sans text-2xl font-semibold tracking-tight">
          LượtĐi
        </h1>
      </header>

      <section className="m-4 grid gap-3 md:grid-cols-3">
        <GridCell label="01 / PLATFORM">
          <h2 className="font-sans text-base font-semibold text-carbon">
            {adminCopy.title}
          </h2>
          <p className="mt-2 font-sans text-sm text-carbon">{ADMIN_BLURB}</p>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-graphite tabular">
            admin@luotdi.vn
          </p>
          <div className="mt-3">
            <KeycapButton
              variant="primary"
              onClick={() => {
                writeDevActor({ role: 'PLATFORM_ADMIN' });
                navigate('/admin');
              }}
            >
              {adminCopy.title}
            </KeycapButton>
          </div>
        </GridCell>

        <GridCell label="02 / ACCOUNT">
          <h2 className="font-sans text-base font-semibold text-carbon">
            Client
          </h2>
          <p className="mt-2 font-sans text-sm text-carbon">{CLIENT_BLURB}</p>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-graphite tabular">
            client@antam.vn
          </p>
          <div className="mt-3">
            <KeycapButton
              variant="secondary"
              onClick={() => {
                writeDevActor({
                  role: 'CLIENT_ADMIN',
                  clientId: 'client-an-tam',
                });
                navigate('/client');
              }}
            >
              Client
            </KeycapButton>
          </div>
        </GridCell>

        <GridCell label="03 / FLOOR">
          <h2 className="font-sans text-base font-semibold text-carbon">
            {managerCopy.eyebrow}
          </h2>
          <p className="mt-2 font-sans text-sm text-carbon">{MANAGER_BLURB}</p>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-graphite tabular">
            manager@pho-nh.vn
          </p>
          <div className="mt-3">
            <KeycapButton
              variant="secondary"
              onClick={() => {
                writeDevActor({
                  role: 'BRANCH_MANAGER',
                  branchId: 'branch-pho-d1',
                });
                navigate('/manage/branch-pho-d1');
              }}
            >
              {managerCopy.eyebrow}
            </KeycapButton>
          </div>
        </GridCell>
      </section>
    </div>
  );
}
