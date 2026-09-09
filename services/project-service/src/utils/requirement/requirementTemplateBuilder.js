/**
 * Serve official Standard Format xlsx from assets (not ExcelJS regenerate).
 */

const fs = require('fs');
const path = require('path');
const { TEMPLATE_FILE_NAME } = require('../../constants/requirementTemplate.constants');

const ASSET_PATH = path.join(__dirname, '../../../assets/Requirement_Template.xlsx');

async function buildRequirementTemplateBuffer() {
  return fs.promises.readFile(ASSET_PATH);
}

function getRequirementTemplateAssetPath() {
  return ASSET_PATH;
}

module.exports = {
  buildRequirementTemplateBuffer,
  getRequirementTemplateAssetPath,
  TEMPLATE_FILE_NAME,
};
