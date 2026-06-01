fn validate_suite_discovery_document(document: &SuiteDiscoveryDocument) -> Result<(), String> {
    if document.schema_version != SUITE_DISCOVERY_SCHEMA_VERSION {
        return Err(format!(
            "expected schema version {}, got {}",
            SUITE_DISCOVERY_SCHEMA_VERSION, document.schema_version
        ));
    }
    let definition = suite_app_definition_for(&document.app_id)
        .ok_or_else(|| format!("unknown suite app {}", document.app_id))?;
    if document.app_name != definition.app_name {
        return Err(format!("unexpected appName {}", document.app_name));
    }
    if document.bundle_identifier != definition.bundle_identifier {
        return Err(format!(
            "unexpected bundleIdentifier {}",
            document.bundle_identifier
        ));
    }
    if document.launch_name != definition.launch_name {
        return Err(format!("unexpected launchName {}", document.launch_name));
    }
    if document.version.trim().is_empty() {
        return Err("version is required".to_string());
    }
    if document.pid == 0 {
        return Err("pid must be greater than 0".to_string());
    }
    if chrono::DateTime::parse_from_rfc3339(&document.started_at).is_err() {
        return Err("startedAt must be an RFC3339 timestamp".to_string());
    }
    if chrono::DateTime::parse_from_rfc3339(&document.updated_at).is_err() {
        return Err("updatedAt must be an RFC3339 timestamp".to_string());
    }
    if document.capabilities.is_empty() {
        return Err("capabilities must not be empty".to_string());
    }
    if let Some(api_url) = document.api_url.as_deref() {
        validate_local_url(api_url, "apiUrl")?;
    }
    if let Some(ws_url) = document.ws_url.as_deref() {
        validate_local_url(ws_url, "wsUrl")?;
    }
    if let Some(health_url) = document.health_url.as_deref() {
        validate_local_url(health_url, "healthUrl")?;
    }
    if let Some(runtime) = document.local_runtime.as_ref() {
        if runtime.contract_version != SUITE_DISCOVERY_SCHEMA_VERSION {
            return Err("localRuntime.contractVersion mismatch".to_string());
        }
        if runtime.dependencies.is_empty() {
            return Err("localRuntime.dependencies must not be empty".to_string());
        }
    }
    Ok(())
}

fn validate_local_url(value: &str, field: &str) -> Result<(), String> {
    if value.starts_with("http://127.0.0.1:")
        || value.starts_with("http://localhost:")
        || value.starts_with("ws://127.0.0.1:")
        || value.starts_with("ws://localhost:")
    {
        Ok(())
    } else {
        Err(format!("{field} must be a localhost URL"))
    }
}
