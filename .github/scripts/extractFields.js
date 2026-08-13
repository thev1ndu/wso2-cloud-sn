/*
# -------------------------------------------------------------------------------------
#
# Copyright (c) 2026, WSO2 LLC (http://www.wso2.com).
#
# This software is the property of WSO2 LLC and its suppliers, if any.
# Dissemination of any information or reproduction of any material contained
# herein in any form is strictly forbidden, unless permitted by WSO2 expressly.
# You may not alter or remove any copyright or other notice from copies of this content.
#
# -------------------------------------------------------------------------------------
*/

const SECTION_REGEX = /###\s+([^\n]+)\s*\n+([^\n][\s\S]*?)(?=\n+###|\n*$)/g;
const EMPTY_VALUES  = new Set(['_No response_', 'No response']);

function isBlank(val) {
  return !val || EMPTY_VALUES.has(val) || val.startsWith('<!--');
}

function linkifyAttachments(value) {
  if (!value) return value;
  return value
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, (_, alt, url) => `<a href="${url}" target="_blank" rel="noopener">${alt || url}</a>`)
    .replace(/\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, (_, text, url) => `<a href="${url}" target="_blank" rel="noopener">${text || url}</a>`);
}

function extractByLabel(body) {
  const fields = {};
  const regex  = new RegExp(SECTION_REGEX.source, 'g');
  let match;
  while ((match = regex.exec(body)) !== null) {
    const label = match[1].trim();
    const value = match[2].trim();
    if (!isBlank(value)) fields[label] = value;
  }
  return fields;
}

function getFieldValue(body, fieldName) {
  const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex   = new RegExp(`###\\s*${escaped}\\s*\\n+([\\s\\S]*?)(?=\\n###|$)`, 'i');
  const match   = body.match(regex);
  if (!match) return null;
  const val = match[1].trim();
  return isBlank(val) ? null : val;
}

function extractAllFields(body) {
  const fields = {};
  const regex  = new RegExp(SECTION_REGEX.source, 'g');
  const knownFields = {
    'template marker':                        'template_marker',
    'servicenow catalog item':                'catalog_item',
    'catalog item':                           'catalog_item',
    'case type':                              'case_type',
    'priority':                               'priority',
    'severity':                               'priority',
    'short description':                      'u_short_description',
    'description':                            'description',
    'detailed description':                   'description',
    'issue description':                      'description',
    'impact':                                 'u_impact',
    'impact description (overall)':           'u_impact_description_overall',
    'impact description (customer)':          'u_impact_description_customer',
    'environment details':                    'u_project_environment',
    'environment':                            'u_project_environment',
    'affected environments':                  'u_project_environment',
    'issue summary':                          'u_request_details',
    'affected component':                     'u_affected_component',
    'affected services':                      'u_affected_services',
    'service outage/downtime':                'u_service_outage',
    'is a maintenance window required or not':'u_maintenance_window',
    'maintenance window':                     'u_maintenance_window',
    'implementation plan':                    'u_implementation_plan',
    'implementation steps':                   'u_implementation_plan',
    'test plan':                              'u_test_plan',
    'monitoring checks':                      'u_monitoring_checks',
    'request details':                        'u_request_details'
  };
  let match;
  while ((match = regex.exec(body)) !== null) {
    const label = match[1].trim();
    const value = match[2].trim();
    if (EMPTY_VALUES.has(value) || !value) continue;
    const normalized = label.toLowerCase();
    const fieldId = knownFields[normalized]
      ?? ('u_' + label.replace(/[^\w\s-]/g, '').trim().toLowerCase().replace(/\s+/g, '_').replace(/^u_+/, ''));
    fields[fieldId] = linkifyAttachments(value);
  }

  const priorityMap = { Critical: '1 - Critical', High: '2 - High', Moderate: '3 - Moderate', Low: '4 - Low' };
  const rawPriority = (fields.priority || 'Moderate').replace(/\s*\(.*?\)/g, '').trim();
  fields.priority = priorityMap[rawPriority] || '3 - Moderate';

  if (fields.u_project_environment) {
    fields.u_project_environment = fields.u_project_environment
      .split(',').map(e => e.trim()).filter(Boolean).join(', ');
  }

  return fields;
}

module.exports = extractAllFields;
module.exports.extractByLabel = extractByLabel;
module.exports.getFieldValue  = getFieldValue;
