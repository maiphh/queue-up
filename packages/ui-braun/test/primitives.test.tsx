import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  BraunChassis,
  GridCell,
  KeycapButton,
  LedIndicator,
  SegmentedMatrix,
  TabularMetric,
} from '../src/index';

describe('BraunChassis', () => {
  it('renders chassis surface and grid frame classes', () => {
    const { container } = render(
      <BraunChassis>
        <span>inner</span>
      </BraunChassis>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute('data-braun', 'chassis');
    expect(root.className).toContain('bg-chassis');
    expect(root.className).toContain('border-grid');
    expect(root.className).toContain('rounded-none');
    expect(screen.getByText('inner')).toBeInTheDocument();
  });

  it('matches snapshot', () => {
    const { container } = render(
      <BraunChassis className="p-4">shell</BraunChassis>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('GridCell', () => {
  it('renders uppercase mono index header and children', () => {
    render(
      <GridCell label="01 / PARTY SIZE">
        <span>body</span>
      </GridCell>,
    );
    const label = screen.getByText('01 / PARTY SIZE');
    expect(label.className).toContain('font-mono');
    expect(label.className).toContain('text-[10px]');
    expect(label.className).toContain('uppercase');
    expect(screen.getByText('body')).toBeInTheDocument();
  });

  it('matches snapshot', () => {
    const { container } = render(
      <GridCell label="02 / EST. WAIT">12 min</GridCell>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('KeycapButton', () => {
  it.each(['primary', 'secondary', 'danger'] as const)(
    'renders %s variant with border-b-2 press affordance',
    (variant) => {
      render(<KeycapButton variant={variant}>ACTION</KeycapButton>);
      const btn = screen.getByRole('button', { name: 'ACTION' });
      expect(btn).toHaveAttribute('data-variant', variant);
      expect(btn.className).toContain('border-b-2');
      expect(btn.className).toContain('rounded-none');
      expect(btn.className).toContain('active:border-b');
    },
  );

  it('invokes onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<KeycapButton onClick={onClick}>SUMMON</KeycapButton>);
    await user.click(screen.getByRole('button', { name: 'SUMMON' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('matches snapshot for primary', () => {
    const { container } = render(
      <KeycapButton variant="primary">ISSUE QUEUE PASS</KeycapButton>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('SegmentedMatrix', () => {
  it('renders 1–8+ options with collapsed borders', () => {
    render(<SegmentedMatrix defaultValue={2} />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(8);
    expect(radios[0]).toHaveTextContent('1');
    expect(radios[7]).toHaveTextContent('8+');
    expect(radios[1]).toHaveAttribute('aria-checked', 'true');
    for (let i = 1; i < radios.length; i += 1) {
      expect(radios[i]?.className).toContain('-ml-[1px]');
    }
  });

  it('calls onChange when selecting a segment', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SegmentedMatrix value={1} onChange={onChange} />);
    await user.click(screen.getByRole('radio', { name: '4' }));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('matches snapshot', () => {
    const { container } = render(<SegmentedMatrix value={3} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('LedIndicator', () => {
  it.each([
    ['active', 'bg-signal-green'],
    ['warning', 'bg-signal-amber'],
    ['idle', 'bg-grid'],
  ] as const)('renders %s state', (state, colorClass) => {
    render(<LedIndicator state={state} />);
    const led = screen.getByRole('status');
    expect(led).toHaveAttribute('data-state', state);
    expect(led.className).toContain('h-[6px]');
    expect(led.className).toContain('w-[6px]');
    expect(led.className).toContain('rounded-led');
    expect(led.className).toContain(colorClass);
  });

  it('matches snapshot', () => {
    const { container } = render(<LedIndicator state="active" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('TabularMetric', () => {
  it.each(['display', 'lg', 'md'] as const)(
    'renders %s size with tabular mono classes',
    (size) => {
      render(<TabularMetric size={size} value="A·014" />);
      const metric = screen.getByText('A·014');
      expect(metric).toHaveAttribute('data-size', size);
      expect(metric.className).toContain('font-mono');
      expect(metric.className).toContain('tabular');
    },
  );

  it('matches snapshot for display size', () => {
    const { container } = render(
      <TabularMetric size="display" value="A·014" />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
