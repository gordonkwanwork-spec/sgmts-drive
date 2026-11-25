import * as T from 'three';

const PROTO_UPDATE_MW = T.Object3D.prototype.updateMatrixWorld;
const PROTO_ADD = T.Object3D.prototype.add;

/**
 * Bakes world matrices for a static subtree once and skips per-frame traversal
 * unless forced or invalidated when a child is added asynchronously to `root`.
 */
export function freezeStatic(root) {
 if (!root) return root;
 let dirty = false;
 const freezeTree = () => {
  PROTO_UPDATE_MW.call(root, true);
  root.traverse(n => {
   n.matrixAutoUpdate = false;
   n.matrixWorldNeedsUpdate = false;
  });
  dirty = false;
 };
 freezeTree();
 root.add = function frozenAdd(...objects) {
  const result = PROTO_ADD.apply(this, objects);
  dirty = true;
  return result;
 };
 root.updateMatrixWorld = function frozenUpdateMatrixWorld(force) {
  if (!force && !dirty) return;
  if (dirty) freezeTree();
  else PROTO_UPDATE_MW.call(this, true);
 };
 return root;
}

/**
 * Skips matrix updates across a dynamic subtree (e.g. off-screen vehicles or
 * rigged characters) while `visible === false`, keeping `matrixAutoUpdate`
 * intact so `collision.js` still tracks it dynamically and rendering resumes
 * immediately upon becoming visible.
 */
export function skipWhenHidden(root) {
 if (!root) return root;
 root.updateMatrixWorld = function visibleOnlyUpdateMatrixWorld(force) {
  if (!this.visible && !force) return;
  PROTO_UPDATE_MW.call(this, force);
 };
 return root;
}
