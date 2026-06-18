"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/jsx-runtime.ts
var jsx_runtime_exports = {};
__export(jsx_runtime_exports, {
  Fragment: () => Fragment,
  jsx: () => jsx,
  jsxDEV: () => jsxDEV,
  jsxs: () => jsxs,
  normalizeChildren: () => normalizeChildren
});
module.exports = __toCommonJS(jsx_runtime_exports);
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Fragment,
  jsx,
  jsxDEV,
  jsxs,
  normalizeChildren
});
//# sourceMappingURL=jsx-runtime.cjs.map