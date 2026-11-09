import type { DdgSearchOptions } from '../common/DdgSearchOptions.ts';

/** Time window the image must fall within. */
export type DdgTime = 'Day' | 'Week' | 'Month';
/** Image size bucket. */
export type DdgSize = 'Small' | 'Medium' | 'Large' | 'Wallpaper';
/** Color filter. */
export type DdgColor = 'color' | 'Monochrome';
/** Image kind. */
export type DdgType = 'photo' | 'clipart' | 'gif' | 'transparent' | 'line';
/** Aspect-ratio layout. */
export type DdgLayout = 'Square' | 'Tall' | 'Wide';
/** Usage-rights filter. */
export type DdgLicense = 'Any' | 'Public';

/** Options for `DuckDuckGo.imageSearch`: the shared options plus image filters. All fields are optional. */
export type DdgImageSearchOptions = DdgSearchOptions & {
	/** Restrict to images from the last day, week, or month. */
	time?: DdgTime;
	/** Restrict to a size bucket. */
	size?: DdgSize;
	/** Restrict to color or monochrome. */
	color?: DdgColor;
	/** Restrict to an image kind (photo, clipart, gif, ...). */
	type?: DdgType;
	/** Restrict to an aspect-ratio layout. */
	layout?: DdgLayout;
	/** Restrict by usage rights. */
	license?: DdgLicense;
};
