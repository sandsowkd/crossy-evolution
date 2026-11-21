/** Model selection uses validation only. The final suite is opened after selection. */
export const VALIDATION_SEEDS = Array.from(
  { length: 64 },
  (_, i) => (0xb2000000 + i * 65537) >>> 0,
);
export const FINAL_TEST_SEEDS = Array.from(
  { length: 512 },
  (_, i) => (0xf3000000 + i * 104729) >>> 0,
);
/** Fresh test maps reserved for the continuation; the first final suite is now historical. */
export const CONTINUATION_TEST_SEEDS = Array.from(
  { length: 512 },
  (_, i) => (0xc1000000 + i * 104729) >>> 0,
);
/** Common development comparison for the parameter sweep, declared before testing. */
export const EXPERIMENT_VALIDATION_SEEDS = [
  ...VALIDATION_SEEDS,
  ...Array.from({ length: 64 }, (_, i) => (0xa1000000 + i * 65537) >>> 0),
  ...Array.from({ length: 64 }, (_, i) => (0xd7000000 + i * 65537) >>> 0),
];
/** Larger development panel for continued tuning; these are never final tests. */
export const WIDE_DEVELOPMENT_SEEDS = [
  ...EXPERIMENT_VALIDATION_SEEDS,
  ...Array.from({ length: 576 }, (_, i) => (0xe2000000 + i * 104729) >>> 0),
];
/** Historical first long-game final assessment; never use it for future selection. */
export const LONG_TEST_SEEDS = Array.from(
  { length: 512 },
  (_, i) => (0xd9000000 + i * 104729) >>> 0,
);
/** Historical second long-game assessment; never use for future selection. */
export const LONG_IMPROVEMENT_TEST_SEEDS = Array.from(
  { length: 512 },
  (_, i) => (0xe9000000 + i * 104729) >>> 0,
);
/** Historical third long-game assessment; never use for future selection. */
export const LONG_FURTHER_TEST_SEEDS = Array.from(
  { length: 512 },
  (_, i) => (0xf9000000 + i * 104729) >>> 0,
);
/** Unopened FA assessment reserved for a frozen development mean of at least1450. */
export const LONG_POST_FURTHER_TEST_SEEDS = Array.from(
  { length: 512 },
  (_, i) => (0xfa000000 + i * 104729) >>> 0,
);
