(function process(request, response) {
    var body = request.body.data;

    var issueNumber   = body.issue_number || '';
    var issueKey      = body.u_github_issue_key || '';
    var issueUrl      = body.issue_url || body.u_github_issue_url || '';

    var rawTitle      = (body.title || '').replace(/^\[(CR|ECR)\]:\s*/i, '').trim();
    var title         = body.u_short_description || rawTitle || 'GitHub Issue';

    var description       = body.description || '';
    var priority          = body.priority || '3 - Moderate';
    var catalogItem       = body.catalog_item || '';
    var caseType          = body.case_type || 'Service Request';
    var category          = body.category || '';
    var account           = body.account || '';
    var announcementType  = body.announcement_type || '';
    var project           = body.project || '';

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

    var affectedComp       = body.u_affected_component || '';
    var affectedSvc        = body.u_affected_services || '';
    var impact             = body.u_impact || '';
    var impactDescOverall  = body.u_impact_description_overall || '';
    var impactDescCustomer = body.u_impact_description_customer || '';
    var implPlan           = body.u_implementation_plan || '';
    var testPlan           = body.u_test_plan || '';
    var serviceOutage      = body.u_service_outage || '';
    var requestDetails     = body.u_request_details || '';
    var maintenanceWindow  = body.u_maintenance_window || '';
    var monitoringChecks   = body.u_monitoring_checks || '';
    var changeRequestType  = (body.u_change_request_type || '').trim();

    var CHANGE_TYPE_TAGS = {
        'Normal Change':    'CR/NormalChange',
        'Standard Change':  'CR/StandardChange',
        'Emergency Change': 'CR/EmergencyChange'
    };

    function assignTag(tableName, recordSysId, tagName) {
        if (!tableName || !recordSysId || !tagName) return;
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
            gs.warn('GitHubCaseIntegration [POST]: Could not resolve tag "' + tagName + '"');
            return;
        }
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
            gs.info('GitHubCaseIntegration [POST]: Tagged ' + tableName + '/' + recordSysId + ' with "' + tagName + '"');
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

    if (!issueNumber) {
        gs.warn('GitHubCaseIntegration [POST]: Missing required field: issue_number');
        response.setStatus(400);
        response.setBody({ error: 'issue_number is required' });
        return;
    }

    var isIncident     = (caseType === 'Incident');
    var isEmergency    = !isIncident && /^\[ECR\]:/i.test(body.title || '');
    var isNormalChange = !isIncident && !isEmergency && /^\[CR\]:/i.test(body.title || '');
    var templateType   = isIncident ? 'Incident' : isEmergency ? 'Emergency Change' : isNormalChange ? 'Normal Change' : 'SR Generic';

    gs.info('GitHubCaseIntegration [POST]: Processing issue #' + issueNumber +
            ' | key: ' + (issueKey || 'none') +
            ' | template: ' + templateType +
            ' | case_type: ' + caseType);

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
        if (!requestDetails) missingFields.push('Request Details (u_request_details)');
        if (!description)    missingFields.push('Description (description)');
        if (!body.priority)  missingFields.push('Priority (priority)');
        if (!environment)    missingFields.push('Environment Details (u_project_environment)');
    }

    if (missingFields.length > 0) {
        gs.warn('GitHubCaseIntegration [POST]: Validation failed for issue #' + issueNumber +
                ' (template: ' + templateType + ') — missing fields: ' + missingFields.join(', '));
        response.setStatus(422);
        response.setBody({
            error: 'Validation failed',
            template_type: templateType,
            missing_fields: missingFields,
            message: 'Required fields missing for ' + templateType + ' template'
        });
        return;
    }

    gs.info('GitHubCaseIntegration [POST]: Validation passed for issue #' + issueNumber + ' (' + templateType + ')');

    var existingCase = null;

    if (issueKey) {
        var keyGr = new GlideRecord('sn_customerservice_case');
        if (keyGr.isValidField('u_github_issue_key')) {
            keyGr.addQuery('u_github_issue_key', issueKey);
            keyGr.query();
            if (keyGr.next()) {
                existingCase = keyGr;
                gs.info('GitHubCaseIntegration [POST]: Idempotency hit (u_github_issue_key) — case ' + keyGr.number + ' for issue #' + issueNumber);
            }
        }
    }

    if (!existingCase && account) {
        var fallbackGr = new GlideRecord('sn_customerservice_case');
        fallbackGr.addQuery('u_github_issue_number', issueNumber);
        fallbackGr.addQuery('account', account);
        fallbackGr.query();
        if (fallbackGr.next()) {
            existingCase = fallbackGr;
            gs.info('GitHubCaseIntegration [POST]: Idempotency hit (u_github_issue_number + account fallback) — case ' + fallbackGr.number + ' for issue #' + issueNumber + ' account: ' + account);
        }
    }

    if (existingCase) {
        var existingSysId  = existingCase.sys_id.toString();
        var existingNumber = existingCase.number.toString();
        var existingWso2Id = existingCase.isValidField('u_wso2_case_id') ? existingCase.getValue('u_wso2_case_id') || '' : '';
        response.setStatus(200);
        response.setBody({
            case_number:    existingNumber,
            sys_id:         existingSysId,
            case_sys_id:    existingSysId,
            u_wso2_case_id: existingWso2Id,
            message:        'Case already exists'
        });
        return;
    }

    var priorityMap = {
        '1 - Critical': 1, 'Critical': 1,
        '2 - High': 2,     'High': 2,
        '3 - Moderate': 3, 'Moderate': 3, 'Medium': 3,
        '4 - Low': 4,      'Low': 4
    };
    var snPriority = priorityMap[priority] || 3;

    var impactMap = {
        'High': 1, '1 - High': 1, 'Critical': 1, '1 - Critical': 1,
        'Medium': 2, '2 - Medium': 2, 'Moderate': 2,
        'Low': 3, '3 - Low': 3, '4 - Low': 3
    };
    var snImpact = impact ? (impactMap[impact] || 2) : null;

    gs.info('GitHubCaseIntegration [POST]: Creating new ' + templateType + ' case for issue #' + issueNumber);

    var gr = new GlideRecord('sn_customerservice_case');
    gr.initialize();

    gr.short_description     = title;
    gr.description           = description;
    gr.priority              = snPriority;
    if (snImpact) gr.impact  = snImpact;
    gr.u_github_issue_number = issueNumber;
    gr.u_github_issue_url    = issueUrl;
    if (issueKey && gr.isValidField('u_github_issue_key')) gr.u_github_issue_key = issueKey;

    var htmlDescription = description;
    if (displayEnvironment && htmlDescription.indexOf('ENVIRONMENT:') === -1) {
        htmlDescription = '<span style="color:red;font-weight:bold;font-size:2em;">ENVIRONMENT: ' + displayEnvironment + '</span><br/><br/>' + htmlDescription;
        gr.description = htmlDescription;
    }
    if (gr.isValidField('u_html_description')) gr.u_html_description = htmlDescription;

    if (category) gr.category.setDisplayValue(category);

    if (account)      gr.setValue('account', account);
    if (caseType   && gr.isValidField('u_case_type'))     gr.u_case_type.setDisplayValue(caseType);
    if (project    && gr.isValidField('project'))         gr.setValue('project', project);

    if (announcementType && gr.isValidField('u_announcement_type')) gr.u_announcement_type = announcementType;

    if (environment && gr.isValidField('u_project_environment')) {
        gr.u_project_environment.setDisplayValue(environment);
        gs.info('GitHubCaseIntegration [POST]: Setting u_project_environment = "' + environment + '"');
    } else if (!environment) {
        gs.info('GitHubCaseIntegration [POST]: No u_project_environment value for this template (e.g. Emergency Change uses u_requested_environments instead)');
    } else {
        gs.warn('GitHubCaseIntegration [POST]: Field u_project_environment not found on sn_customerservice_case — environment not set');
    }
    if (gr.isValidField('u_catalog_item'))                gr.u_catalog_item                = catalogItem;
    if (gr.isValidField('u_affected_component'))          gr.u_affected_component          = affectedComp;
    if (gr.isValidField('u_affected_services'))           gr.u_affected_services           = affectedSvc;
    if (gr.isValidField('u_impact_description_overall'))  gr.u_impact_description_overall  = impactDescOverall;
    if (gr.isValidField('u_impact_description_customer')) gr.u_impact_description_customer = impactDescCustomer;
    if (gr.isValidField('u_implementation_plan'))         gr.u_implementation_plan         = implPlan;
    if (gr.isValidField('u_test_plan'))                   gr.u_test_plan                   = testPlan;
    if (gr.isValidField('u_service_outage'))              gr.u_service_outage              = serviceOutage;
    if (gr.isValidField('u_request_details'))             gr.u_request_details             = requestDetails;
    if (gr.isValidField('u_maintenance_window'))          gr.u_maintenance_window          = maintenanceWindow;
    if (gr.isValidField('u_monitoring_checks'))           gr.u_monitoring_checks           = monitoringChecks;
    if (changeRequestType && gr.isValidField('u_change_request_type')) gr.u_change_request_type = changeRequestType;
    if (gr.isValidField('u_rollback_plan'))               gr.u_rollback_plan               = rollbackPlan;
    if (gr.isValidField('u_emergency_approver'))          gr.u_emergency_approver          = emergencyApprover;
    if (gr.isValidField('u_requested_environments'))      gr.u_requested_environments      = requestedEnvironments;
    if (gr.isValidField('u_type_of_change'))              gr.u_type_of_change              = typeOfChange;
    if (gr.isValidField('u_system_user_impact'))          gr.u_system_user_impact          = systemUserImpact;
    if (gr.isValidField('u_impact_description'))          gr.u_impact_description          = impactDescription;
    if (gr.isValidField('u_execution_sequence'))          gr.u_execution_sequence          = executionSequence;
    if (gr.isValidField('u_approval_form_link'))          gr.u_approval_form_link          = approvalFormLink;
    if (gr.isValidField('u_environments_tested'))         gr.u_environments_tested         = environmentsTested;

    var sysId = gr.insert();

    if (!sysId) {
        gs.error('GitHubCaseIntegration [POST]: GlideRecord insert failed for issue #' + issueNumber + ' (template: ' + templateType + ')');
        response.setStatus(500);
        response.setBody({ error: 'Case creation failed' });
        return;
    }

    var changeTypeTag = CHANGE_TYPE_TAGS[changeRequestType];
    if (changeTypeTag) {
        assignTag('sn_customerservice_case', sysId.toString(), changeTypeTag);
    }

    gs.info('GitHubCaseIntegration [POST]: Created case ' + gr.number + ' (sys_id: ' + sysId + ')' +
            ' for issue #' + issueNumber + ' (' + issueKey + ') — template: ' + templateType +
            (changeRequestType ? ' — change type: ' + changeRequestType : ''));

    response.setStatus(201);
    response.setBody({
        case_number:    gr.number.toString(),
        sys_id:         sysId.toString(),
        case_sys_id:    sysId.toString(),
        u_wso2_case_id: gr.isValidField('u_wso2_case_id') ? gr.getValue('u_wso2_case_id') || '' : '',
        message:        'Case created successfully'
    });
})(request, response);
