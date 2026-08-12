/**
 * Session / state ownership map (architectural lock — documentation + helpers).
 *
 * | Domain     | Owner module              | Mutators (allowed)                          |
 * |------------|---------------------------|---------------------------------------------|
 * | Volume     | core/VoxelGrid            | createVoxie3D api + commands/volumeCommands |
 * | Groups     | groups/VoxelGroupStore    | api.startGroup, stopGroup, applyGroup*      |
 * | Selection  | select/SelectionStore     | api.selection.*, ForgeInput shift/select    |
 * | History    | history/UndoStack         | api.undo/redo, paint commits                |
 * | Prefs      | ui/prefs.js               | loadPrefs/savePrefs, performance panel      |
 * | Camera     | camera/*                  | ForgeInput + createCameraController         |
 * | Tools      | tools/registry.js         | api.setTool (normalizeTool + lifecycle)     |
 * | Generate   | generate/ShapeGenController | api.setShapeGen*, rerollShapeGen          |
 *
 * Quarantine: ARENA_PART_MACHINE stays outside THIRD_GAME — do not import/revive.
 */

export const STATE_OWNERS = Object.freeze({
  volume: "createVoxie3D / commands/volumeCommands",
  groups: "groups/VoxelGroupStore via api",
  selection: "select/SelectionStore via api.selection",
  history: "history/UndoStack via api",
  prefs: "ui/prefs.js",
  camera: "camera/createCameraController",
  tools: "tools/registry.js via api.setTool",
  generate: "generate/ShapeGenController via api",
});

/** Target folder layout (migrate additively; do not mega-move). */
export const TARGET_LAYOUT = Object.freeze({
  "js/voxie3d/core/": "VoxelGrid, serialize, events, ownership",
  "js/voxie3d/commands/": "volume + future undoable commands",
  "js/voxie3d/tools/": "registry, brushes, shapes, stroke, texturizer",
  "js/voxie3d/input/": "ForgeInput, bindingsHelp",
  "js/voxie3d/render/": "VoxelRenderer, meshing, layers, gizmo",
  "js/voxie3d/world/": "chunks, biomes, terrain, seed, pawns",
  "js/voxie3d/generate/": "shape stamps catalog + generators",
  "js/voxie3d/groups/": "VoxelGroupStore, channelApply",
  "js/voxie3d/io/": "VXW / VXB / VXT / VXP / texture packs",
  "js/voxie3d/ui/": "dock, navbar, panels, prefs, HUD binders",
  "js/voxie3d/camera/": "orbit, pan, keyboard, wheel",
  "js/forge/": "thin hosts only (forgeApp, worldApp)",
  assets: "user/project assets (not arena)",
});
