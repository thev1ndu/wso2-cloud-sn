(function process(/*RESTAPIRequest*/ request, /*RESTAPIResponse*/ response) {

    var body        = request.body.data;
    var issueNumber = body.issue_number || '';
    var githubUser  = body.github_user  || 'GitHub';

    if (!issueNumber) {
        gs.warn('GitHubCaseUpdate [PATCH]: Missing required field: issue_number');
        response.setStatus(400);
        response.setBody({ error: 'issue_number is required' });
        return;
    }

    gs.info('GitHubCaseUpdate [PATCH]: Processing update for issue #' + issueNumber + ' by ' + githubUser);

    var caseType       = body.case_type || '';
    var isIncident     = (caseType === 'Incident');
    var isEmergency    = !isIncident && /^\[ECR\]:/i.test(body.title || '');
    var isNormalChange = !isIncident && !isEmergency && /^\[CR\]:/i.test(body.title || '');
    var templateType   = isIncident ? 'Incident' : isEmergency ? 'Emergency Change' : isNormalChange ? 'Normal Change' : 'SR Generic';

    gs.info('GitHubCaseUpdate [PATCH]: Detected template type: ' + templateType + ' for issue #' + issueNumber);

    var rawTitle       = (body.title || '').replace(/^\[(CR|ECR)\]:\s*/i, '').trim();
    var description    = body.description || '';

    function extractCheckedLabels(str) {
        if (!str) return '';
        var lines = str.split('\n');
        var checked = [];
        for (var i = 0; i < lines.length; i++) {
            var m = lines[i].match(/^-\s*\[x\]\s*(.+)$/i);
            if (m) checked.push(m[1].trim());
        }
        return checked.join(', ');
    }

    var environment        = body.u_project_environment || '';
    var displayEnvironment = environment || extractCheckedLabels(body.u_requested_environments) || '';
    var requestDetails = body.u_request_details || '';
    var impact         = body.u_impact || '';
    var affectedComp   = body.u_affected_component || '';
    var affectedSvc    = body.u_affected_services || '';
    var implPlan       = body.u_implementation_plan || '';
    var testPlan       = body.u_test_plan || '';
    var serviceOutage  = body.u_service_outage || '';
    var impactDescOverall  = body.u_impact_description_overall || '';
    var impactDescCustomer = body.u_impact_description_customer || '';
    var maintenanceWindow  = body.u_maintenance_window || '';
    var monitoringChecks   = body.u_monitoring_checks || '';
    var changeRequestType  = (body.u_change_request_type || '').trim();

    var CHANGE_TYPE_TAGS = {
        'Normal Change':    'CR/NormalChange',
        'Standard Change':  'CR/StandardChange',
        'Emergency Change': 'CR/EmergencyChange'
    };

    function syncChangeTypeTag(tableName, recordSysId, tagName) {
        if (!tableName || !recordSysId || !tagName) return;
        var allTags = [];
        for (var k in CHANGE_TYPE_TAGS) { if (CHANGE_TYPE_TAGS.hasOwnProperty(k)) allTags.push(CHANGE_TYPE_TAGS[k]); }

        var labelSysId = '';
        var label = new GlideRecord('label');
        label.addQuery('name', tagName);
        label.query();
        if (label.next()) {
            labelSysId = label.getUniqueValue();
        } else {
            label.initialize();
            label.name = tagName;
            if (label.isValidField('viewable_by')) label.viewable_by = 'everyone';
            labelSysId = label.insert();
        }
        if (!labelSysId) {
            gs.warn('GitHubCaseUpdate [PATCH]: Could not resolve tag "' + tagName + '"');
            return;
        }

        var stale = new GlideRecord('label_entry');
        stale.addQuery('table', tableName);
        stale.addQuery('table_key', recordSysId);
        stale.addQuery('label.name', 'IN', allTags.join(','));
        stale.addQuery('label', '!=', labelSysId);
        stale.query();
        while (stale.next()) { stale.deleteRecord(); }

        var entry = new GlideRecord('label_entry');
        entry.addQuery('table', tableName);
        entry.addQuery('table_key', recordSysId);
        entry.addQuery('label', labelSysId);
        entry.query();
        if (!entry.next()) {
            entry.initialize();
            entry.table     = tableName;
            entry.table_key = recordSysId;
            entry.label     = labelSysId;
            entry.insert();
            gs.info('GitHubCaseUpdate [PATCH]: Tagged ' + tableName + '/' + recordSysId + ' with "' + tagName + '"');
        }
    }

    var rollbackPlan          = body.u_rollback_plan || '';
    var emergencyApprover     = body.u_emergency_approver || '';
    var requestedEnvironments = body.u_requested_environments || '';
    var typeOfChange          = body.u_type_of_change || '';
    var systemUserImpact      = body.u_system_user_impact || '';
    var impactDescription     = body.u_impact_description || '';
    var executionSequence     = body.u_execution_sequence || '';
    var approvalFormLink      = body.u_approval_form_link || '';
    var environmentsTested    = body.u_environments_tested || '';

    function hasCheckedBox(str) {
        return !!(str && /-\s*\[x\]/i.test(str));
    }

    var missingFields = [];

    if (isIncident) {
        if (!requestDetails) missingFields.push('Issue Summary (u_request_details)');
        if (!description)    missingFields.push('Detailed Description (description)');
        if (!body.priority)  missingFields.push('Severity (priority)');
        if (!environment)    missingFields.push('Affected Environments (u_project_environment)');
    } else if (isNormalChange) {
        var shortDesc = body.u_short_description || rawTitle;
        if (!changeRequestType || !CHANGE_TYPE_TAGS[changeRequestType]) {
            missingFields.push('Change Request Type (u_change_request_type) — must be Normal Change, Standard Change, or Emergency Change');
        }
        if (!shortDesc)          missingFields.push('Short Description (u_short_description)');
        if (!description)        missingFields.push('Description (description)');
        if (!body.priority)      missingFields.push('Priority (priority)');
        if (!impact)             missingFields.push('Impact (u_impact)');
        if (!impactDescOverall)  missingFields.push('Impact Description (Overall) (u_impact_description_overall)');
        if (!impactDescCustomer) missingFields.push('Impact Description (Customer) (u_impact_description_customer)');
        if (!environment)        missingFields.push('Environment Details (u_project_environment)');
        if (!affectedComp)       missingFields.push('Affected Component (u_affected_component)');
        if (!affectedSvc)        missingFields.push('Affected Services (u_affected_services)');
        if (!serviceOutage)      missingFields.push('Service Outage/Downtime (u_service_outage)');
        if (!maintenanceWindow)  missingFields.push('Maintenance Window (u_maintenance_window)');
        if (!implPlan)           missingFields.push('Implementation Plan (u_implementation_plan)');
        if (!testPlan)           missingFields.push('Test Plan (u_test_plan)');
        if (!monitoringChecks)   missingFields.push('Monitoring Checks (u_monitoring_checks)');
    } else if (isEmergency) {
        if (!description)                       missingFields.push('Issue Description (description)');
        if (!body.priority)                      missingFields.push('Priority (priority)');
        if (!hasCheckedBox(requestedEnvironments)) missingFields.push('Requested Environments (u_requested_environments)');
        if (!hasCheckedBox(typeOfChange))          missingFields.push('Type of Change (u_type_of_change)');
        if (!systemUserImpact)                    missingFields.push('System / User Impact (u_system_user_impact)');
        if (!impactDescription)                   missingFields.push('Impact Description (u_impact_description)');
        if (!implPlan)                             missingFields.push('Implementation Steps (u_implementation_plan)');
        if (!rollbackPlan)                        missingFields.push('Rollback Plan (u_rollback_plan)');
        if (!emergencyApprover)                   missingFields.push('Emergency Approver (u_emergency_approver)');
    } else {
        // SR Generic
        if (!requestDetails) missingFields.push('Request Details (u_request_details)');
        if (!description)    missingFields.push('Description (description)');
        if (!body.priority)  missingFields.push('Priority (priority)');
        if (!environment)    missingFields.push('Environment Details (u_project_environment)');
    }

    if (missingFields.length > 0) {
        gs.warn('GitHubCaseUpdate [PATCH]: Validation failed for issue #' + issueNumber +
                ' (template: ' + templateType + ') — missing: ' + missingFields.join(', '));
        response.setStatus(422);
        response.setBody({
            error: 'Validation failed',
            template_type: templateType,
            missing_fields: missingFields,
            message: 'Required fields missing for ' + templateType + ' template update'
        });
        return;
    }

    gs.info('GitHubCaseUpdate [PATCH]: Validation passed for issue #' + issueNumber + ' (' + templateType + ')');

    // Locate the case the same way gh.post.js keys it: prefer the repo-scoped,
    // globally-unique u_github_issue_key, and only fall back to the bare issue
    // number. Querying by u_github_issue_number alone can match a case from a
    // different repo/account that happens to share the issue number, and picks
    // an arbitrary row when several match.
    var issueKey = body.u_github_issue_key || '';
    var gr = null;

    if (issueKey) {
        var keyGr = new GlideRecord('sn_customerservice_case');
        if (keyGr.isValidField('u_github_issue_key')) {
            keyGr.addQuery('u_github_issue_key', issueKey);
            keyGr.orderByDesc('sys_created_on');
            keyGr.query();
            if (keyGr.next()) {
                gr = keyGr;
                gs.info('GitHubCaseUpdate [PATCH]: Matched case ' + keyGr.number + ' by u_github_issue_key for issue #' + issueNumber);
            }
        }
    }

    if (!gr) {
        var numGr = new GlideRecord('sn_customerservice_case');
        numGr.addQuery('u_github_issue_number', issueNumber);
        numGr.orderByDesc('sys_created_on');
        numGr.query();
        if (numGr.next()) {
            gr = numGr;
            gs.info('GitHubCaseUpdate [PATCH]: Matched case ' + numGr.number + ' by u_github_issue_number fallback for issue #' + issueNumber);
        }
    }

    if (!gr) {
        gs.warn('GitHubCaseUpdate [PATCH]: No case found for issue #' + issueNumber);
        response.setStatus(404);
        response.setBody({ error: 'No case found for issue ' + issueNumber });
        return;
    }

    gs.info('GitHubCaseUpdate [PATCH]: Found case ' + gr.number + ' for issue #' + issueNumber + ', applying diff');

    var changedFields = [];

    function updateStr(label, fieldName, newValue) {
        if (!newValue || !gr.isValidField(fieldName)) return;
        var oldVal = (gr.getValue(fieldName) || '').trim();
        var newVal = (newValue + '').trim();
        if (oldVal === newVal) return;
        changedFields.push(label);
        gr.setValue(fieldName, newVal);
    }

    // Priority
    var priorityMap = {
        '1 - Critical': 1, 'Critical': 1,
        '2 - High': 2,     'High': 2,
        '3 - Moderate': 3, 'Moderate': 3, 'Medium': 3,
        '4 - Low': 4,      'Low': 4
    };
    var newPriorityRaw = body.priority || '';
    if (newPriorityRaw) {
        var newPriority = priorityMap[newPriorityRaw] || 3;
        var oldPriority = parseInt(gr.getValue('priority') || '3', 10);
        if (oldPriority !== newPriority) {
            changedFields.push('Priority');
            gr.priority = newPriority;
        }
    }

    var impactMap = {
        'High': 1, '1 - High': 1, 'Critical': 1, '1 - Critical': 1,
        'Medium': 2, '2 - Medium': 2, 'Moderate': 2,
        'Low': 3, '3 - Low': 3, '4 - Low': 3
    };
    var newImpactRaw = body.u_impact || '';
    if (newImpactRaw) {
        var newImpact = impactMap[newImpactRaw] || 2;
        var oldImpact = parseInt(gr.getValue('impact') || '0', 10);
        if (oldImpact !== newImpact) {
            changedFields.push('Impact');
            gr.impact = newImpact;
        }
    }

    var newShortDesc = (body.u_short_description || rawTitle || '').trim();
    if (newShortDesc) {
        var oldShortDesc = (gr.getValue('short_description') || '').trim();
        if (oldShortDesc !== newShortDesc) {
            changedFields.push('Short Description');
            gr.short_description = newShortDesc;
        }
    }

    updateStr('Impact Description (Overall)',  'u_impact_description_overall',  impactDescOverall);
    updateStr('Impact Description (Customer)', 'u_impact_description_customer', impactDescCustomer);

    if (environment && gr.isValidField('u_project_environment')) {
        var oldEnv = (gr.getDisplayValue('u_project_environment') || '').trim();
        if (oldEnv !== environment.trim()) {
            changedFields.push('Environment');
            gr.u_project_environment.setDisplayValue(environment);
            gs.info('GitHubCaseUpdate [PATCH]: Setting u_project_environment = "' + environment + '"');
        }
    }
    updateStr('Affected Component',            'u_affected_component',          affectedComp);
    updateStr('Affected Services',             'u_affected_services',           affectedSvc);
    updateStr('Service Outage',                'u_service_outage',              serviceOutage);
    updateStr('Implementation Plan',           'u_implementation_plan',         implPlan);
    updateStr('Test Plan',                     'u_test_plan',                   testPlan);
    updateStr('Request Details',               'u_request_details',             requestDetails);
    updateStr('Maintenance Window',            'u_maintenance_window',          maintenanceWindow);
    updateStr('Monitoring Checks',             'u_monitoring_checks',           monitoringChecks);
    updateStr('Change Request Type',           'u_change_request_type',         changeRequestType);
    updateStr('Rollback Plan',                 'u_rollback_plan',               rollbackPlan);
    updateStr('Emergency Approver',            'u_emergency_approver',          emergencyApprover);
    updateStr('Requested Environments',        'u_requested_environments',      requestedEnvironments);
    updateStr('Type of Change',                'u_type_of_change',              typeOfChange);
    updateStr('System / User Impact',          'u_system_user_impact',          systemUserImpact);
    updateStr('Impact Description',            'u_impact_description',          impactDescription);
    updateStr('Execution Sequence',            'u_execution_sequence',          executionSequence);
    updateStr('Approval Form Link',            'u_approval_form_link',          approvalFormLink);
    updateStr('Environments Tested',           'u_environments_tested',         environmentsTested);

    if (description) {
        var htmlDescription = description;
        if (displayEnvironment && htmlDescription.indexOf('ENVIRONMENT:') === -1) {
            htmlDescription = '<span style="color:red;font-weight:bold;font-size:2em;">ENVIRONMENT: ' + displayEnvironment + '</span><br/><br/>' + htmlDescription;
        }
        gr.description = htmlDescription;
        if (gr.isValidField('u_html_description')) gr.u_html_description = htmlDescription;
    }

    if (changedFields.length > 0) {
        gs.info('GitHubCaseUpdate [PATCH]: Updating ' + changedFields.length + ' field(s) on case ' +
                gr.number + ': ' + changedFields.join(', '));
    } else {
        gs.info('GitHubCaseUpdate [PATCH]: No field changes detected for case ' + gr.number + ' — description refreshed');
    }

    gr.update();

    var changeTypeTag = CHANGE_TYPE_TAGS[changeRequestType];
    if (changeTypeTag) {
        syncChangeTypeTag('sn_customerservice_case', gr.sys_id.toString(), changeTypeTag);
    }

    gs.info('GitHubCaseUpdate [PATCH]: Case ' + gr.number + ' updated successfully for issue #' + issueNumber);

    response.setStatus(200);
    response.setBody({
        case_number:    gr.number.toString(),
        sys_id:         gr.sys_id.toString(),
        case_sys_id:    gr.sys_id.toString(),
        changes:        changedFields.length,
        changed_fields: changedFields,
        message:        changedFields.length > 0
            ? 'Case updated with ' + changedFields.length + ' change(s)'
            : 'No field changes detected; description refreshed'
    });

})(request, response);
