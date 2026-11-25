import { createMathPlugin } from "@streamdown/math";
import { parseMarkdownIntoBlocks } from "streamdown";
import type { Element, Root } from "hast";
import type { Plugin, Transformer } from "unified";
import { markdownDisplayRanges } from "@/src/core/content-reader";

const math = createMathPlugin({ singleDollarTextMath: true });
type KatexOptions = { output?: "html"; errorColor?: string };
type File = Parameters<Transformer<Root>>[1];
type RenderKatex = (this: ThisParameterType<Plugin>, options: KatexOptions) => (tree: Root, file: File) => void;
// @streamdown/math supplies a [rehype-katex, options] tuple. Keep its
// parsing, error recovery and defaults, changing only the output format.
const [renderKatex, options] = math.rehypePlugin as [RenderKatex, KatexOptions];

function hasClass(node: Element, name: string): boolean {
	const classes = node.properties.className;
	return Array.isArray(classes) && classes.includes(name);
}

const htmlWithSource: Plugin<[], Root> = function () {
	const render = renderKatex.call(this, { ...options, output: "html" });
	return (tree, file) => {
		const sources: { parent: Root | Element; index: number; tex: string }[] = [];
		const collect = (parent: Root | Element) => {
			parent.children.forEach((node, index) => {
				if (node.type !== "element") return;
				// Display math is <pre><code class=language-math>; rehype-katex
				// swaps the whole <pre>. Inline math replaces just its own node.
				const token = node.tagName === "pre"
					? node.children.find((child): child is Element => child.type === "element" && child.tagName === "code" && hasClass(child, "language-math"))
					: node;
				if (token && (hasClass(token, "language-math") || hasClass(token, "math-inline") || hasClass(token, "math-display"))) {
					const tex = token.children.map((child) => child.type === "text" ? child.value : "").join("");
					sources.push({ parent, index, tex });
				} else collect(node);
			});
		};
		collect(tree);
		// rehype-katex replaces each token with a single span in place. Reuse
		// that span rather than keeping a second tree just to recover the TeX.
		render(tree, file);
		for (const { parent, index, tex } of sources) {
			const result = parent.children[index];
			if (result?.type !== "element") continue;
			const formula = hasClass(result, "katex-display")
				? result.children.find((child): child is Element => child.type === "element" && hasClass(child, "katex"))
				: result;
			if (formula && hasClass(formula, "katex")) formula.properties.dataTex = tex;
		}
	};
};

export const transcriptMath = { ...math, rehypePlugin: htmlWithSource };

/** Streamdown's dollar count can include literal code or adjacent inline math.
 * Keep its normal block splits except for boundaries inside a display formula. */
export function parseTranscriptBlocks(markdown: string): string[] {
	const blocks = parseMarkdownIntoBlocks(markdown);
	if (blocks.length < 2 || !/(^|\n)[ \t>]*\${2,}[ \t]*\r?(\n|$)/.test(markdown) || blocks.join("") !== markdown) return blocks;
	const displays = markdownDisplayRanges(markdown);
	if (!displays.length) return blocks;
	let offset = 0, start = 0, display = 0;
	const merged: string[] = [];
	for (const block of blocks) {
		offset += block.length;
		while (displays[display] && displays[display]!.end <= offset) display++;
		if (displays[display] && displays[display]!.start < offset) continue;
		merged.push(markdown.slice(start, offset));
		start = offset;
	}
	return merged;
}
