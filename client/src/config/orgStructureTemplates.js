/**
 * Huy: Mirror label template IT (locale-friendly) — ids khớp BE orgStructureTemplates.
 */
export const ORG_STRUCTURE_TEMPLATE_IDS = [
  'startup',
  'product',
  'outsourcing',
  'enterprise-software',
  'functional',
  'enterprise-compat',
];

/** @type {Record<string, { labelKey: string, descriptionKey: string }>} */
export const ORG_STRUCTURE_TEMPLATE_META = {
  startup: {
    labelKey: 'adminOrg.tplStartup',
    descriptionKey: 'adminOrg.tplStartupDesc',
  },
  product: {
    labelKey: 'adminOrg.tplProduct',
    descriptionKey: 'adminOrg.tplProductDesc',
  },
  outsourcing: {
    labelKey: 'adminOrg.tplOutsourcing',
    descriptionKey: 'adminOrg.tplOutsourcingDesc',
  },
  'enterprise-software': {
    labelKey: 'adminOrg.tplEnterprise',
    descriptionKey: 'adminOrg.tplEnterpriseDesc',
  },
  functional: {
    labelKey: 'adminOrg.tplFunctional',
    descriptionKey: 'adminOrg.tplFunctionalDesc',
  },
  'enterprise-compat': {
    labelKey: 'adminOrg.tplCompat',
    descriptionKey: 'adminOrg.tplCompatDesc',
  },
};
