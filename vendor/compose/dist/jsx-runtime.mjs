import { createRequire as __reshotCreateRequire } from 'module'; const require = __reshotCreateRequire(import.meta.url);

// src/jsx-runtime.ts
var Fragment = /* @__PURE__ */ Symbol("Fragment");
function normalizeChildren(value) {
  if (value == null || value === false || value === true) return [];
  if (Array.isArray(value)) return value.flatMap(normalizeChildren);
  return [value];
}
function jsx(type, props, key) {
  const nextProps = props ?? {};
  const { children, ...rest } = nextProps;
  return {
    $$compose: true,
    type,
    props: rest,
    children: normalizeChildren(children),
    key
  };
}
function jsxs(type, props, key) {
  return jsx(type, props, key);
}
var jsxDEV = jsx;
export {
  Fragment,
  jsx,
  jsxDEV,
  jsxs,
  normalizeChildren
};
