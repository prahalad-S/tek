import { parse, type DefaultTreeAdapterTypes } from "parse5";
import type { SiteElement } from "./publishedSite";

type SourceNode = DefaultTreeAdapterTypes.Node;
type SourceElement = DefaultTreeAdapterTypes.Element;
const normalizeText = (value: string) => value.replace(/\s+/g, " ").trim();
function domPath(element: Element) {
  const parts: string[] = [];
  for (let current: Element | null = element; current; current = current.parentElement) {
    const siblings = current.parentElement ? Array.from(current.parentElement.children).filter(sibling => sibling.tagName === current!.tagName) : [current];
    parts.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(current) + 1})`);
  }
  return parts.join(" > ");
}
function matches(source: Element, published: SiteElement) {
  if (source.tagName.toLowerCase() !== published.tag) return false;
  const expected = normalizeText(published.fullText ?? published.text);
  const actual = normalizeText(source.textContent || "");
  // A structural address alone is insufficient when JavaScript has changed the DOM.
  if (!expected || (published.fullText !== undefined ? actual.slice(0,4000) !== expected : actual !== expected)) return false;
  if (published.childCount !== undefined && source.children.length !== published.childCount) return false;
  return !published.classes.length || published.classes.some(name => source.classList.contains(name));
}
export function matchPublishedElement(document: Document, published: SiteElement): Element | null {
  if (published.domPath) {
    const located = document.querySelector(published.domPath);
    if (located && matches(located, published)) return located;
  }
  const possible = Array.from(document.getElementsByTagName(published.tag)).filter(element => matches(element, published));
  return possible.length === 1 ? possible[0] : null;
}

// Patch only opening tags using parser offsets. Keep scripts, formatting, IDs and unrelated attributes intact.
export function identifySourceElements(original: string, document: Document, targets: { element: Element; className: string }[]) {
  const parsed = parse(original, { sourceCodeLocationInfo: true });
  const sourceByPath = new Map<string, SourceElement>();
  function visit(node: SourceNode, parentPath = "", position = 1) {
    const isElement = "tagName" in node;
    const path = isElement ? `${parentPath ? `${parentPath} > ` : ""}${node.tagName}:nth-of-type(${position})` : parentPath;
    if (isElement) sourceByPath.set(path, node);
    if (!("childNodes" in node)) return;
    const counts = new Map<string, number>();
    for (const child of node.childNodes) {
      const index = "tagName" in child ? (counts.get(child.tagName) || 0) + 1 : 1;
      if ("tagName" in child) counts.set(child.tagName, index);
      visit(child, path, index);
    }
  }
  visit(parsed);
  const patches: { start: number; end: number; content: string }[] = [];
  const selectors: string[] = [];
  const reserved = new Set<string>();
  for (const { element, className } of targets) {
    const source = sourceByPath.get(domPath(element));
    const location = source?.sourceCodeLocation;
    if (!source || !location?.startTag) throw new Error("The intended element has no editable HTML source. Use the companion for dynamically generated elements.");
    let name = className, suffix = 2;
    while (reserved.has(name) || Array.from(document.getElementsByClassName(name)).some(candidate => candidate !== element)) name = `${className}-${suffix++}`;
    reserved.add(name); selectors.push(`.${name}`);
    if (element.classList.contains(name)) continue;
    const classes = [...element.classList, name].join(" ").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    const attribute = location.attrs?.class;
    if (attribute) patches.push({ start: attribute.startOffset, end: attribute.endOffset, content: `class="${classes}"` });
    else {
      let insertion = location.startTag.endOffset - 1;
      if (original[insertion - 1] === "/") insertion--;
      patches.push({ start: insertion, end: insertion, content: ` class="${classes}"` });
    }
  }
  let content = original;
  for (const patch of patches.sort((a,b) => b.start - a.start)) content = content.slice(0,patch.start) + patch.content + content.slice(patch.end);
  return { content, selectors };
}
