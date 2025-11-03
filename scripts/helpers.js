function $(sel, root = document) { return root.querySelector(sel); }
function $$(sel, root = document) { return [...root.querySelectorAll(sel)]; }
function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
function isHex(v) { return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v); }
