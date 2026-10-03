/**
 * Serve official SRS.xlsx (AI/Admin intake).
 * Asset SSOT: assets/SRS.xlsx — 16-sheet intake schema (download name SRS.xlsx).
 * Legacy fallback: assets/Requirement_Template.xlsx.
 * Runtime parse/validate still expect Standard Format v2.0 sheet names until phase B
 * (see docs/requirement/srs-intake-validation-baseline.md).
 */

const fs = require('fs');
const path = require('path');
const {
  TEMPLATE_FILE_NAME,
  TEMPLATE_FILE_NAME_LEGACY,
} = require('../../constants/requirementTemplate.constants');

const ASSETS_DIR = path.join(__dirname, '../../../assets');
const ASSET_PATH = path.join(ASSETS_DIR, TEMPLATE_FILE_NAME);
const LEGACY_ASSET_PATH = path.join(ASSETS_DIR, TEMPLATE_FILE_NAME_LEGACY);

async function buildRequirementTemplateBuffer() {
  try {
    return await fs.promises.readFile(ASSET_PATH);
  } catch {
    return fs.promises.readFile(LEGACY_ASSET_PATH);
  }
}

function getRequirementTemplateAssetPath() {
  try {
    fs.accessSync(ASSET_PATH);
    return ASSET_PATH;
  } catch {
    return LEGACY_ASSET_PATH;
  }
}

module.exports = {
  buildRequirementTemplateBuffer,
  getRequirementTemplateAssetPath,
  TEMPLATE_FILE_NAME,
};
