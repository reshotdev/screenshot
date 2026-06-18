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
var jsxDEV = jsx;
export {
  Fragment,
  jsxDEV as jsx,
  jsxDEV,
  jsxDEV as jsxs
};
//# sourceMappingURL=jsx-dev-runtime.mjs.map