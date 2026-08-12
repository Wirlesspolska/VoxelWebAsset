/**

 * Voxie3D — reusable Three.js voxel sculpt framework for Part Machine.

 *

 * Public API:

 *   createVoxie3D(canvasOrContainer, options) → controller

 *   options.mode: 'part' | 'world'

 *   options.worldSize: {x,y,z} (world mode; default 32³)

 *   controller.setAxis(axis) / cycleAxis() / setSlice(n) / nudgeSlice(d)

 *   controller.setLayerMode('all'|'active'|'base+active')

 *   controller.setColorHSB(h,s,b) / getColorHSB() / setColorHex / getColorHex

 *   controller.setBorder(true|false) / getBorder()

 *   controller.setTool('place'|'erase'|'none')  // none = deselect

 *   controller.setBrushSize(1|3) / setIsolatePart(bool)

 *   controller.exportVolume() / importVolume(data) / clear()

 *   controller.generateTerrain(seed?, opts?) / setCharacterHeight(blocks)

 *   controller.addWorldChunks({dirs,biome?}) / previewWorldChunks / cancelWorldChunks

 *   controller.onChange(fn) / onSliceChange(fn) / on(type,fn) / dispose()

 *

 * Volume schema:

 *   { mode:'part'|'world', size, worldSize:{x,y,z}, voxels:[...],

 *     axis, slice, partId, seed?, groups?:[{id,name,color,voxelKeys}], meta? }

 *

 * Default bindings (viewport):

 *   LMB hold-drag paint (place) · RMB hold-drag erase (place/erase)

 *   Alt+LMB orbit · MMB free pan · Shift+RMB pan · MMB click cycle plane

 *   WASD/arrows/QE camera move · Scroll / [ ] / , . ±1 slice · Alt+Scroll zoom

 * Preview pawns: opt-in only (characters: false by default).

 */



export { createVoxie3D } from "./createVoxie3D.js";

export { VoxelGrid, voxelKey } from "./core/VoxelGrid.js";

export {

  normalizeVolume,

  volumeToJSON,

  normalizeWorldSize,

  normalizeMode,

  normalizeGroups,

  AXES,

  MODES,

} from "./core/serialize.js";

export { LAYER_MODES } from "./render/layerVisibility.js";

export {
  TOOLS,
  normalizeTool,
  brushCells,
  BRUSH_PRESETS,
  paintBrushCells,
  SHAPE_IDS,
  shapeCells,
  STROKE_DIRS,
  normalizeStrokeLength,
  TOOL_REGISTRY,
  EXCLUSIVE_TOOL_IDS,
  SCROLL_OWNERSHIP,
  getToolNavItems,
  getToolDef,
  getInputMode,
  applyToolLifecycle,
} from "./tools/tools.js";
export { commitCells, assertVolumeCommandPath } from "./commands/volumeCommands.js";
export { STATE_OWNERS, TARGET_LAYOUT } from "./core/ownership.js";
export {
  SHAPE_GEN_LIST,
  SHAPE_GEN_IDS,
  normalizeShapeGenId,
  shapeGenCategories,
  createShapeGenController,
  MAX_STAMP_CELLS,
  MAX_STAMP_EXTENT,
} from "./generate/index.js";
export { createGeneratePanel } from "./ui/panels/generatePanel.js";
export {
  createTextureDef,
  generateTexturePixels,
  hydrateTextureDef,
  serializeTextureDef,
} from "./tools/texturizer.js";
export { createSelectionStore } from "./select/index.js";
export { createSwatchStore, loadLastColors, loadFavouriteColors } from "./color/swatches.js";
export { EFFECT_PRESETS, applyEffect, applyEffectToKeys } from "./materials/effects.js";
export { createTextureStore } from "./materials/textures.js";
export {
  packTextures,
  mergeTextureShards,
  downloadTexturePack,
  MAX_SHARD_BYTES,
  TEXTURE_PACK_MAGIC,
} from "./io/texturePack.js";
export { createAssetBrowser } from "./project/assetBrowser.js";
export { bindForgePanel } from "./ui/bindForgePanel.js";
export { bindColorPicker } from "./ui/colorPicker.js";
export { createNerdOverlay } from "./ui/nerdOverlay.js";
export { mountLeftDock, buildForgePanels, applyDockSide, buildToolPanels } from "./ui/leftDock.js";
export {
  mountUtilityLayer,
  buildUtilityPanels,
  UTILITY_DEFS,
} from "./ui/utilityLayer.js";
export { bindToolsNavbar, TOOL_NAV_ITEMS } from "./ui/toolsNavbar.js";
export { createPanelPopoutManager, attachPopoutButton, POPOUT_CHANNEL } from "./ui/panelPopout.js";
export { createUndoStack, UNDO_MAX } from "./history/index.js";
export { createBrushPanel } from "./ui/panels/brushPanel.js";
export { createColorPickerPanel } from "./ui/panels/colorPickerPanel.js";
export { createHistoryPanel } from "./ui/panels/historyPanel.js";
export { createPlacePanel } from "./ui/panels/placePanel.js";
export { createErasePanel } from "./ui/panels/erasePanel.js";
export { createPerformancePanel } from "./ui/panels/performancePanel.js";

export {

  hsbToHex,

  hsbToRgb,

  hexToHsb,

  hexToRgb,

  rgbToHsb,

  rgbToHex,

  PRESET_COLORS,

} from "./color/hsb.js";

export { bindForgeHud } from "./ui/bindForgeHud.js";

export { bindNavbar, FILE_MENU_MAP } from "./ui/navbar.js";

export {
  PREFS_KEY,
  DEFAULT_PREFS,
  loadPrefs,
  savePrefs,
  normalizePrefs,
  normalizeMeshWorkerThreads,
  resolveMeshWorkerCount,
} from "./ui/prefs.js";

export {
  MATERIAL_PRESETS,
  getMaterialPreset,
  tintWithNoise,
  resolveMaterialColor,
  hashUnit,
} from "./materials/palettes.js";

export { createVoxelGroupStore, normalizeGroups as normalizeGroupList } from "./groups/index.js";

export {
  generateTerrain,
  generateTerrainChunk,
  fillTerrainColumn,
  listChunkColumns,
  createChunkTerrainContext,
  TERRAIN_COLORS,
} from "./world/terrain.js";

export {
  BIOMES,
  BIOME_IDS,
  getBiome,
  biomeTerrainOpts,
} from "./world/biomes.js";

export { createLightController } from "./world/lights.js";

export {
  BLOCK_IDS,
  BLOCK_COLORS,
  blockAtlasMeta,
} from "./materials/blockAtlasMeta.js";

export { createBlockAtlas } from "./materials/blockAtlas.js";

export {
  buildGreedyMesh,
  collectHaloOccupancy,
  materialKeyOf,
} from "./render/greedyMesh.js";

export {
  CHUNK_DIRS,
  DIR_OFFSETS,
  chunkKey,
  parseChunkKey,
  chunkBounds,
  neighborChunks,
  worldSizeForChunks,
  normalizeChunkSize,
  readChunkMeta,
  writeChunkMeta,
  pickAnchorChunk,
} from "./world/chunks.js";

export { createChunkGenController } from "./world/chunkGen.js";

export { createWorldPawns } from "./world/pawns.js";

export { createRng, hashSeed } from "./world/seed.js";

export { getAssetCache, createAssetCache } from "./cache/AssetCache.js";

export { CHUNK_SIZE } from "./render/VoxelRenderer.js";

export { createAxisGizmo } from "./render/axisGizmo.js";

export {
  createCameraController,
  createForgeCamera,
  createKeyboardMove,
  KEYBOARD_MOVE_CODES,
  createWheelAccumulator,
  DEFAULT_SLICE_WHEEL_THRESHOLD,
} from "./camera/index.js";

export {
  VXW_MAGIC,
  VXW_KINDS,
  DEFAULT_Z_MIN,
  normalizeWorldBounds,
  cullVoxelsByZ,
  isVxw,
  serializeVxw,
  parseVxw,
  loadVxw,
  VXT_MAGIC,
  isVxt,
  serializeVxtPalette,
  serializeVxtAtlas,
  parseVxt,
  applyVxt,
  VXP_MAGIC,
  isVxp,
  serializeVxpStub,
  parseVxp,
  VXB_MAGIC,
  VXBIN_VERSION,
  BINARY_VOXEL_THRESHOLD,
  shouldPreferBinary,
  scaleVolumeCoords,
  serializeVxb,
  parseVxb,
  loadVxb,
  isVxb,
  EXPORT_SCALES,
  FORMAT_SPECTRUM,
} from "./io/index.js";

export {
  PROJECT_MAGIC,
  PROJECT_TYPES,
  ASSET_KINDS,
  RECENT_KEY,
  RECENT_MAX,
  DRAFT_KEY,
  ASSET_ROOT,
  createProject,
  isProject,
  serializeProject,
  parseProject,
  touchProject,
  addProjectAsset,
  rememberRecent,
  listRecent,
  listRecentFiltered,
  clearRecent,
  downloadBlob,
  downloadJSON,
  projectFilename,
  assetSubfolder,
  assetPathOrKey,
  assetDownloadFilename,
  isAssetsPath,
  saveDraft,
  loadDraft,
  clearDraft,
  hasDraft,
  usesVxw,
  normalizeProjectType,
} from "./project/index.js";


