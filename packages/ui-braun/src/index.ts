export const PACKAGE_NAME = 'ui-braun' as const;

export const BRAUN_TOKENS = {
  bgChassis: '#E6E5E0',
  bgPanel: '#F4F3EF',
  bgInk: '#111111',
  borderGrid: '#C8C6BE',
  textCarbon: '#111111',
  textGraphite: '#66645E',
  signalOrange: '#FF4400',
  signalAmber: '#D97706',
  signalGreen: '#15803D',
} as const;

export { cn } from './cn';

export { BraunChassis } from './BraunChassis';
export type { BraunChassisProps } from './BraunChassis';

export { GridCell } from './GridCell';
export type { GridCellProps } from './GridCell';

export { KeycapButton } from './KeycapButton';
export type {
  KeycapButtonProps,
  KeycapButtonVariant,
} from './KeycapButton';

export {
  SegmentedMatrix,
  SEGMENTED_MATRIX_OPTIONS,
} from './SegmentedMatrix';
export type {
  SegmentedMatrixProps,
  SegmentedMatrixValue,
} from './SegmentedMatrix';

export { LedIndicator } from './LedIndicator';
export type { LedIndicatorProps, LedIndicatorState } from './LedIndicator';

export { TabularMetric } from './TabularMetric';
export type { TabularMetricProps, TabularMetricSize } from './TabularMetric';
