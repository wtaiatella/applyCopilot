/**
 * Manual Jest mock for `@react-pdf/renderer` (auto-applied for any test that imports it,
 * per Jest's root `__mocks__/<package>` convention for node_modules packages).
 *
 * `@react-pdf/renderer` ships ESM-only builds with no CJS entrypoint, which Jest's
 * CommonJS-based transform pipeline (via next/jest) cannot parse. Rather than fighting
 * next/jest's non-overridable default `transformIgnorePatterns`, this mock stands in for the
 * whole rendering pipeline: `Document`/`Page`/`Text`/`View` are simple pass-through React
 * components, `StyleSheet.create` is the identity function, and `renderToBuffer` walks the
 * resulting element tree collecting every text node into one string, returned as a
 * `%PDF`-prefixed Buffer.
 *
 * This is sufficient to unit-test `cvPdfService.ts`'s actual logic under test — which
 * bullets/summary/skills get included based on `included: true` — without needing a real PDF
 * renderer at test time. The real rendering pipeline (actual PDF bytes, single-column
 * layout, `@react-pdf/renderer` primitives) was manually verified end-to-end outside Jest
 * (via `renderCVToPdfBuffer` run directly under Node/tsx) during development of this file.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const React = require("react");

function passthroughComponent(tag) {
  return function Component(props) {
    return React.createElement(tag, props, props?.children);
  };
}

const Document = passthroughComponent("mock-document");
const Page = passthroughComponent("mock-page");
const Text = passthroughComponent("mock-text");
const View = passthroughComponent("mock-view");

const StyleSheet = {
  create: (styles) => styles,
};

function collectText(node, out) {
  if (node === null || node === undefined || typeof node === "boolean") return;
  if (Array.isArray(node)) {
    node.forEach((child) => collectText(child, out));
    return;
  }
  if (typeof node === "string" || typeof node === "number") {
    out.push(String(node));
    return;
  }
  if (React.isValidElement(node)) {
    collectText(node.props?.children, out);
  }
}

async function renderToBuffer(document) {
  const textParts = [];
  collectText(document, textParts);
  return Buffer.from(
    `%PDF-1.7 (mock)\n${textParts.join("\n")}\n%%EOF`,
    "utf-8",
  );
}

module.exports = { Document, Page, Text, View, StyleSheet, renderToBuffer };
