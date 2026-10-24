import assert from "node:assert/strict";
import { test } from "node:test";

import { physicalDirections } from "./design-ratchet-direction.mjs";

const count = (classes) => physicalDirections(`<div className="${classes}" />`);

test("counts physical left/right classes", () => {
  assert.equal(count("ml-2 mr-auto pl-4 pr-[1rem]"), 4);
  assert.equal(count("left-0 right-1/2 -left-12 inset-l-0"), 4);
  assert.equal(count("text-left text-right border-l border-r-2 border-l-transparent"), 5);
  assert.equal(count("rounded-l-md rounded-tr-lg rounded-r float-left origin-top-left"), 5);
  assert.equal(count("hover:ml-2 md:text-right group-data-[open]/x:pl-3 !mr-1"), 4);
});

test("leaves logical classes and look-alikes alone", () => {
  assert.equal(count("ms-2 me-auto ps-4 pe-1 start-0 end-1/2 text-start text-end"), 0);
  assert.equal(count("border-s border-e rounded-s-md rounded-ee-lg border-red-500 rounded-lg"), 0);
  // Already logical in Tailwind 4.
  assert.equal(count("space-x-2 divide-x -space-x-1"), 0);
  // Not classes: a locale tag and prose.
  assert.equal(physicalDirections(`const locale = "pl-PL"; // left-to-right text`), 0);
});

test("skips classes that are physical on purpose", () => {
  assert.equal(count("ltr:pl-2 rtl:pr-2 [&>span]:ltr:left-auto"), 0);
  assert.equal(count("data-[side=left]:-right-1 data-[side=right]:left-0"), 0);
  assert.equal(count("data-[placement=left]:slide-in-from-right-2 data-[placement=right]:ml-1"), 0);
});

test("skips centring with a negative half translate on the same line", () => {
  assert.equal(count("absolute left-1/2 -translate-x-1/2"), 0);
  assert.equal(count("fixed left-[50%] translate-x-[-50%]"), 0);
  assert.equal(count("after:left-1/2 after:-translate-x-1/2"), 0);
  // Only the centring pair is exempt, and only beside its translate.
  assert.equal(count("absolute left-1/2 -translate-x-1/2 ml-2"), 1);
  assert.equal(count("absolute left-1/2"), 1);
});
