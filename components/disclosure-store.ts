"use client";

/**
 * One open/closed store for every collapsible kind in DISCLOSURES (your
 * thinking, Why, agent thinking). Each block starts at its kind's
 * Appearance "Start expanded" setting; a click toggles just that block.
 * A keyboard toggle sets every block of the kind, mounted now or later,
 * for this page load only: nothing persists, so a reload returns to the
 * setting. A changed setting replaces any keyboard set for its kind.
 */

import { useCallback, useEffect, type SetStateAction } from "react";
import { DISCLOSURE_KINDS, type DisclosureKind } from "@/src/core";
import { useAppearance } from "@/components/settings/appearance";
import { useTranscriptState } from "@/components/transcript-row-state";

type Listener = (open: boolean) => void;
type DisclosureState = { revision: number; open: boolean };

const keyboardSets: Partial<Record<DisclosureKind, boolean>> = {};
const revisions: Partial<Record<DisclosureKind, number>> = {};
const listeners = Object.fromEntries(
	DISCLOSURE_KINDS.map((kind) => [kind, new Set<Listener>()]),
) as Record<DisclosureKind, Set<Listener>>;

function setAll(kind: DisclosureKind, open: boolean) {
	// A global change also overrides choices in virtual rows that are unmounted.
	revisions[kind] = (revisions[kind] ?? 0) + 1;
	for (const listener of listeners[kind]) listener(open);
}

/** Where every block of the kind stands: the last keyboard set, else the setting. */
export function kindOpen(kind: DisclosureKind, expandByDefault: boolean): boolean {
	return keyboardSets[kind] ?? expandByDefault;
}

export function toggleAllDisclosures(kind: DisclosureKind, expandByDefault: boolean): void {
	const open = !kindOpen(kind, expandByDefault);
	keyboardSets[kind] = open;
	setAll(kind, open);
}

export function applyExpandByDefault(kind: DisclosureKind, open: boolean): void {
	delete keyboardSets[kind];
	setAll(kind, open);
}

export function useDisclosure(kind: DisclosureKind, stateKey: string) {
	const expandByDefault = useAppearance().appearance.expandByDefault[kind];
	const revision = revisions[kind] ?? 0;
	const [state, setState] = useTranscriptState<DisclosureState>(`disclosure:${kind}:${stateKey}`, () => ({
		revision, open: kindOpen(kind, expandByDefault),
	}));
	const open = state.revision === revision ? state.open : kindOpen(kind, expandByDefault);
	const setOpen = useCallback((action: SetStateAction<boolean>) => {
		const revision = revisions[kind] ?? 0;
		setState((previous) => {
			const open = previous.revision === revision ? previous.open : kindOpen(kind, expandByDefault);
			return { revision, open: typeof action === "function" ? action(open) : action };
		});
	}, [expandByDefault, kind, setState]);
	useEffect(() => {
		const subscribed = listeners[kind];
		subscribed.add(setOpen);
		// A global change that landed between this block's render and its
		// subscription would otherwise be missed.
		if ((revisions[kind] ?? 0) !== revision) setOpen(kindOpen(kind, expandByDefault));
		return () => {
			subscribed.delete(setOpen);
		};
	}, [expandByDefault, kind, revision, setOpen]);
	return [open, setOpen] as const;
}
