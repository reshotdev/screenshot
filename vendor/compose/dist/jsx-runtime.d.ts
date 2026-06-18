type ComposeNode = ComposeElement | string | number | boolean | null | undefined | ComposeNode[];
type ComposeComponent<P = Record<string, unknown>> = (props: P & {
    children?: ComposeNode;
}) => ComposeNode;
type ComposeElementType = string | ComposeComponent | symbol;
interface ComposeElement {
    readonly $$compose: true;
    type: ComposeElementType;
    props: Record<string, unknown>;
    children: ComposeNode[];
    key?: string;
}
declare const Fragment: unique symbol;
declare function normalizeChildren(value: unknown): ComposeNode[];
declare function jsx(type: ComposeElementType, props: Record<string, unknown> | null, key?: string): ComposeElement;
declare function jsxs(type: ComposeElementType, props: Record<string, unknown> | null, key?: string): ComposeElement;
declare const jsxDEV: typeof jsx;
type ComposeIntrinsicProps = {
    className?: string;
    id?: string;
    style?: Record<string, string | number | null | undefined | false>;
    children?: ComposeNode;
} & Record<string, unknown>;
declare namespace JSX {
    type Element = ComposeNode;
    interface ElementChildrenAttribute {
        children: ComposeNode;
    }
    interface IntrinsicElements {
        [tag: string]: ComposeIntrinsicProps;
    }
}

export { type ComposeComponent, type ComposeElement, type ComposeElementType, type ComposeNode, Fragment, JSX, jsx, jsxDEV, jsxs, normalizeChildren };
