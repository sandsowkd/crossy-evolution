/** Legacy IDs/658 channels stay frozen. V9 appends explicit water/rail/eagle sensors. */
export type ObservationVersion = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export const VARIANT_TWO_INPUT_START = 90000;
export const VARIANT_TWO_EXTRA_INPUTS = 8 * 9 * 3 + 8;
export const LEGACY_INPUTS = 658;
export const sensorCount = (version: ObservationVersion = 1) => LEGACY_INPUTS + (version === 9 ? VARIANT_TWO_EXTRA_INPUTS : 0);
export const sensorNodeId = (index: number) => index < LEGACY_INPUTS ? index : VARIANT_TWO_INPUT_START + index - LEGACY_INPUTS;
export const sensorIndex = (node: number) => node >= VARIANT_TWO_INPUT_START ? LEGACY_INPUTS + node - VARIANT_TWO_INPUT_START : node;
