"use client";

import type {} from "react/canary";
import * as React from "react";

const transcript = {
	"chat-switch-next": "chat-switch-next",
	"chat-switch-previous": "chat-switch-previous",
	"chat-switch-enter": "chat-switch-enter",
	default: "none",
};
const dock = {
	"chat-switch-next": "chat-switch-dock-down",
	"chat-switch-previous": "chat-switch-dock-up",
	"chat-switch-enter": "chat-switch-dock-down",
	default: "none",
};
type ChatSwitchType = Exclude<keyof typeof transcript, "default">;
let pendingSwitch: { pathname: string; type: ChatSwitchType } | null = null;

function activeViewTransition() {
	return (document as Document & { activeViewTransition?: ViewTransition | null }).activeViewTransition;
}

/** React waits for a running view transition before committing another one. */
export function prepareChatSwitch(pathname: string, type: ChatSwitchType | null) {
	pendingSwitch = type ? { pathname, type } : null;
	if (!document.startViewTransition) return;
	const active = activeViewTransition();
	if (active !== undefined) {
		if (active && Object.keys(transcript).some(key => key !== "default" && active.types.has(key))) {
			active.skipTransition();
		}
		return;
	}
	for (const animation of document.getAnimations()) {
		const effect = animation.effect;
		if (effect instanceof KeyframeEffect && /^::view-transition-[\w-]+\(chat-switch-(transcript|dock)\)$/.test(effect.pseudoElement ?? "")) {
			animation.finish();
		}
	}
}

/** Play the incoming slide on the live viewport if React skips the capture. */
export function animateChatArrival(pathname: string, viewport: HTMLElement, dockViewport: HTMLElement | null) {
	const intent = pendingSwitch;
	if (intent?.pathname !== pathname) return;
	const root = document.documentElement;
	const active = activeViewTransition();
	const listeners = new AbortController();
	const viewportAttribute = "data-chat-switch-arrival";
	const dockAttribute = "data-chat-switch-dock-arrival";
	const play = (element: HTMLElement, attribute: string, name: string) => {
		const clear = (event: AnimationEvent) => {
			if (event.target === element && event.animationName === name) element.removeAttribute(attribute);
		};
		element.setAttribute(attribute, intent.type);
		element.addEventListener("animationend", clear, { signal: listeners.signal });
		element.addEventListener("animationcancel", clear, { signal: listeners.signal });
	};
	const arrive = () => {
		if (listeners.signal.aborted || pendingSwitch !== intent || location.pathname !== pathname) return;
		pendingSwitch = null;
		if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		play(viewport, viewportAttribute, "chat-switch-in");
		if (dockViewport && intent.type !== "chat-switch-previous") play(dockViewport, dockAttribute, "chat-switch-dock-unfold");
	};
	const useCapture = () => {
		if (listeners.signal.aborted || pendingSwitch !== intent) return;
		if (getComputedStyle(root, "::view-transition-new(chat-switch-transcript)").animationName !== "chat-switch-in") {
			arrive();
		} else {
			pendingSwitch = null;
		}
	};
	const transitionType = `:active-view-transition-type(${intent.type})`;
	if (active?.types.has(intent.type)) {
		void active.ready.then(useCapture, arrive);
	} else if (active === undefined && CSS.supports(`selector(${transitionType})`) && root.matches(transitionType)) {
		pendingSwitch = null;
	} else {
		queueMicrotask(arrive);
	}
	return () => {
		listeners.abort();
		viewport.removeAttribute(viewportAttribute);
		dockViewport?.removeAttribute(dockAttribute);
	};
}

/** Animate the captured viewport while its real scroll layout stays put. */
export function ChatSwitchTransition({ part, children }: { part: "transcript" | "dock"; children: React.ReactNode }) {
	const ViewTransition = React.ViewTransition;
	if (!ViewTransition) return children;
	const fixed = part === "dock";
	return (
		<ViewTransition name={`chat-switch-${part}`} default="none" share={fixed ? dock : transcript}
			enter={fixed ? dock : { "chat-switch-enter": "chat-switch-enter", default: "none" }}>
			{children}
		</ViewTransition>
	);
}
