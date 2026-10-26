/**
 * Public types for the independent anatomical reference viewer.
 *
 * The host owns every asset URL. This module never bundles, hardcodes or
 * prefetches a remote brain asset.
 */

/** A host-supplied surface mesh (for example an ICBM152 hemisphere). */
export interface BrainAsset {
  readonly url: string;
  readonly name: string;
}

/** A host-supplied volume (for example the MNI152 template MRI). */
export type BrainVolumeAsset = BrainAsset;

export interface BrainViewerProps {
  /** Standard-template surface meshes. Order is preserved. */
  readonly meshes?: BrainAsset[];
  /**
   * Standard-template MRI volume. It is fetched only after the user
   * explicitly selects the MRI view.
   */
  readonly volume?: BrainVolumeAsset;
  readonly className?: string;
}

/** Surface meshes and MRI slices are deliberately separate views. */
export type BrainView = 'surface' | 'volume';

/** Renderer lifecycle. */
export type BrainStatus = 'initializing' | 'ready' | 'error';

/** On-demand volume lifecycle. */
export type BrainVolumeStatus = 'idle' | 'loading' | 'ready' | 'error';

/** An RGBA tuple with channels in the 0..1 range expected by Niivue. */
export type BrainRgba = [number, number, number, number];

/** Resolved theme values derived exclusively from host design tokens. */
export interface BrainThemeColors {
  readonly background: BrainRgba;
  readonly crosshair: BrainRgba;
  readonly font: BrainRgba;
  /** Neutral surface colors, cycled per mesh. */
  readonly meshes: readonly BrainRgba[];
}

/** CSS color strings taken from the host theme. */
export interface BrainThemeInput {
  readonly background: string;
  readonly text: string;
  readonly primary: string;
  readonly meshPrimary: string;
  readonly meshSecondary: string;
}

/** Visible failure state. `detail` may contain a technical message. */
export interface BrainFailure {
  readonly title: string;
  readonly detail?: string;
}
