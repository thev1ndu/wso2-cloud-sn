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

/**
 * Builds a deep-link URL to a ServiceNow case record in the CSM/FSM
 * Configurable Workspace (agent record view).
 * @param {string} snUiUrl - Base ServiceNow UI URL (e.g. https://instance.service-now.com)
 * @param {string} caseSysId - 32-char sys_id of the case record
 * @returns {string} Full URL, or empty string if either required param is missing
 */
exports.buildCaseUrl = function buildCaseUrl(snUiUrl, caseSysId) {
  if (!caseSysId || !snUiUrl) return '';
  return `${snUiUrl}/now/cwf/agent/record/sn_customerservice_case/${caseSysId}`;
};
