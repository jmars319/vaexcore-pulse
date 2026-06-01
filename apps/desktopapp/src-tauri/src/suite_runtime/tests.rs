    use super::*;
    use crate::local_services::{
        resolve_pulse_helper_paths_from_candidates, ApiBridgeLaunch, PulseHelperSource,
    };

    #[test]
    fn pulse_handoff_validation_rejects_wrong_schema_version() {
        let mut handoff = valid_handoff();
        handoff.schema_version = 2;

        assert!(validate_pulse_recording_handoff_document(&handoff, None)
            .unwrap_err()
            .contains("schema version"));
    }

    #[test]
    fn pulse_handoff_validation_rejects_wrong_target_app() {
        let mut handoff = valid_handoff();
        handoff.target_app = "vaexcore-console".to_string();

        assert!(validate_pulse_recording_handoff_document(&handoff, None)
            .unwrap_err()
            .contains("target app"));
    }

    #[test]
    fn pulse_handoff_validation_rejects_empty_recording_path() {
        let mut handoff = valid_handoff();
        handoff.recording.output_path = "  ".to_string();

        assert!(validate_pulse_recording_handoff_document(&handoff, None)
            .unwrap_err()
            .contains("outputPath"));
    }

    #[test]
    fn pulse_handoff_validation_rejects_stale_files() {
        let handoff = valid_handoff();

        assert!(validate_pulse_recording_handoff_document(
            &handoff,
            Some(PULSE_HANDOFF_STALE_AFTER + Duration::from_secs(1)),
        )
        .unwrap_err()
        .contains("stale"));
    }

    #[test]
    fn pulse_handoff_validation_accepts_output_ready_contract() {
        let mut handoff = valid_handoff();
        handoff.output_ready = Some(valid_output_ready());

        assert!(validate_pulse_recording_handoff_document(&handoff, None).is_ok());
    }

    #[test]
    fn pulse_handoff_validation_rejects_invalid_output_ready_contract() {
        let mut handoff = valid_handoff();
        let mut output_ready = valid_output_ready();
        output_ready.ready = true;
        output_ready.state = "blocked".to_string();
        handoff.output_ready = Some(output_ready);

        assert!(validate_pulse_recording_handoff_document(&handoff, None)
            .unwrap_err()
            .contains("outputReady.ready"));
    }

    #[test]
    fn suite_discovery_validation_rejects_epoch_timestamps() {
        let mut discovery = valid_discovery();
        discovery.started_at = "1778025273".to_string();

        assert!(validate_suite_discovery_document(&discovery)
            .unwrap_err()
            .contains("startedAt"));
    }

    #[test]
    fn suite_command_validation_rejects_non_object_payload() {
        let mut command = valid_suite_command();
        command.payload = serde_json::json!("bad-payload");

        assert!(validate_suite_command_document(&command, None)
            .unwrap_err()
            .contains("payload"));
    }

    #[test]
    fn suite_command_validation_rejects_wrong_target_app() {
        let mut command = valid_suite_command();
        command.target_app = "vaexcore-console".to_string();

        assert!(validate_suite_command_document(&command, None)
            .unwrap_err()
            .contains("target app"));
    }

    #[test]
    fn suite_command_validation_rejects_stale_files() {
        let command = valid_suite_command();

        assert!(validate_suite_command_document(
            &command,
            Some(SUITE_COMMAND_STALE_AFTER + Duration::from_secs(1)),
        )
        .unwrap_err()
        .contains("stale"));
    }

    #[test]
    fn suite_command_consume_removes_valid_and_invalid_schema_files() {
        let directory = temp_test_dir("suite-command-consume");
        let valid_path = directory.join("valid.json");
        let invalid_path = directory.join("invalid.json");
        fs::write(
            &valid_path,
            serde_json::to_vec_pretty(&valid_suite_command()).unwrap(),
        )
        .unwrap();
        let mut invalid = valid_suite_command();
        invalid.target_app = "vaexcore-console".to_string();
        fs::write(&invalid_path, serde_json::to_vec_pretty(&invalid).unwrap()).unwrap();

        let commands = consume_suite_commands_from_dir(&directory, false);

        assert_eq!(commands.len(), 1);
        assert_eq!(commands[0].command, "open-review");
        assert_eq!(commands[0].payload["recordingSessionId"], "rec_smoke");
        assert!(!valid_path.exists());
        assert!(!invalid_path.exists());
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn suite_command_consume_retains_malformed_json_files() {
        let directory = temp_test_dir("suite-command-malformed");
        let malformed_path = directory.join("malformed.json");
        fs::write(&malformed_path, "{bad json").unwrap();

        assert!(consume_suite_commands_from_dir(&directory, false).is_empty());
        assert!(malformed_path.exists());

        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn handoff_consume_removes_valid_files() {
        let directory = temp_test_dir("handoff-valid");
        let path = directory.join(PULSE_RECORDING_INTAKE_FILE);
        fs::write(&path, serde_json::to_vec_pretty(&valid_handoff()).unwrap()).unwrap();

        let handoff = consume_pulse_recording_handoff_file(&path, false);

        let handoff = handoff.expect("handoff should be consumed");
        assert_eq!(handoff.recording.capture_mode.as_deref(), Some("display"));
        assert_eq!(
            handoff.recording.capture_detail.as_deref(),
            Some("Main Display recorded as a source-backed display.")
        );
        assert!(!path.exists());
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn handoff_consume_retains_malformed_json_files() {
        let directory = temp_test_dir("handoff-malformed");
        let path = directory.join(PULSE_RECORDING_INTAKE_FILE);
        fs::write(&path, "{bad json").unwrap();

        assert!(consume_pulse_recording_handoff_file(&path, false).is_none());
        assert!(path.exists());

        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn helper_resolution_prefers_packaged_resources_without_repo_fallback() {
        let manifest_dir = temp_test_dir("helper-manifest");
        let resources = temp_test_dir("helper-resources");
        create_packaged_helpers(&resources);

        let paths = resolve_pulse_helper_paths_from_candidates(
            None,
            Some(&resources),
            &manifest_dir,
            false,
        )
        .unwrap();

        assert_eq!(paths.source, PulseHelperSource::PackagedResources);
        assert!(paths.analyzer_source_dir.ends_with("pulse-analyzer/src"));
        match paths.api_launch {
            ApiBridgeLaunch::BundledScript { script } => {
                assert!(script.ends_with("pulse-api/server.mjs"));
            }
            ApiBridgeLaunch::TsxSource { .. } => panic!("expected bundled API script"),
        }

        let _ = fs::remove_dir_all(manifest_dir);
        let _ = fs::remove_dir_all(resources);
    }

    #[test]
    fn helper_resolution_rejects_packaged_mode_without_resources() {
        let manifest_dir = temp_test_dir("helper-missing-manifest");
        let resources = temp_test_dir("helper-missing-resources");

        let error = resolve_pulse_helper_paths_from_candidates(
            None,
            Some(&resources),
            &manifest_dir,
            false,
        )
        .unwrap_err();

        assert!(error.contains("packaged helper resources are missing"));
        let _ = fs::remove_dir_all(manifest_dir);
        let _ = fs::remove_dir_all(resources);
    }

    #[test]
    fn helper_resolution_allows_explicit_repo_override() {
        let repo = temp_test_dir("helper-repo");
        let manifest_dir = temp_test_dir("helper-manifest");
        create_repo_helpers(&repo);

        let paths =
            resolve_pulse_helper_paths_from_candidates(Some(&repo), None, &manifest_dir, false)
                .unwrap();

        assert_eq!(paths.source, PulseHelperSource::EnvRepo);
        match paths.api_launch {
            ApiBridgeLaunch::TsxSource { cli, script } => {
                assert!(cli.ends_with("node_modules/tsx/dist/cli.mjs"));
                assert!(script.ends_with("services/api/src/server.ts"));
            }
            ApiBridgeLaunch::BundledScript { .. } => panic!("expected repo API source"),
        }

        let _ = fs::remove_dir_all(repo);
        let _ = fs::remove_dir_all(manifest_dir);
    }

    fn valid_handoff() -> PulseRecordingHandoffDocument {
        PulseRecordingHandoffDocument {
            schema_version: SUITE_DISCOVERY_SCHEMA_VERSION,
            request_id: "studio-recording-rec-smoke-1".to_string(),
            source_app: STUDIO_APP_ID.to_string(),
            source_app_name: "vaexcore studio".to_string(),
            target_app: PULSE_APP_ID.to_string(),
            requested_at: "2026-05-06T12:00:00Z".to_string(),
            recording: PulseRecordingHandoffRecording {
                session_id: "rec_smoke".to_string(),
                output_path: "/tmp/rec_smoke.mkv".to_string(),
                profile_id: Some("profile_1080p".to_string()),
                profile_name: Some("1080p".to_string()),
                capture_mode: Some("display".to_string()),
                capture_detail: Some(
                    "Main Display recorded as a source-backed display.".to_string(),
                ),
                stopped_at: "2026-05-06T12:05:00Z".to_string(),
            },
            output_ready: None,
        }
    }

    fn valid_output_ready() -> PulseRecordingHandoffOutputReady {
        PulseRecordingHandoffOutputReady {
            ready: true,
            state: "ready".to_string(),
            detail: "Scene output handoff is ready for Pulse intake.".to_string(),
            active_scene_id: Some("scene-main".to_string()),
            active_scene_name: Some("Main scene".to_string()),
            program_preview_frame_ready: Some(true),
            compositor_render_plan_ready: Some(true),
            output_preflight_ready: Some(true),
            media_pipeline_ready: Some(true),
            blockers: Vec::new(),
            warnings: Vec::new(),
        }
    }

    fn valid_suite_command() -> SuiteCommandDocument {
        SuiteCommandDocument {
            schema_version: SUITE_DISCOVERY_SCHEMA_VERSION,
            command_id: "open-review-1".to_string(),
            source_app: STUDIO_APP_ID.to_string(),
            source_app_name: "vaexcore studio".to_string(),
            target_app: PULSE_APP_ID.to_string(),
            command: "open-review".to_string(),
            requested_at: "2026-05-06T12:00:00Z".to_string(),
            payload: serde_json::json!({ "recordingSessionId": "rec_smoke" }),
        }
    }

    fn temp_test_dir(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("vaexcore-pulse-{name}-{nanos}"));
        fs::create_dir_all(&directory).unwrap();
        directory
    }

    fn create_packaged_helpers(resources: &Path) {
        let analyzer_package = resources.join("pulse-analyzer/src/vaexcore_pulse_analyzer");
        fs::create_dir_all(&analyzer_package).unwrap();
        fs::write(analyzer_package.join("server.py"), "").unwrap();
        let api_dir = resources.join("pulse-api");
        fs::create_dir_all(&api_dir).unwrap();
        fs::write(api_dir.join("server.mjs"), "").unwrap();
    }

    fn create_repo_helpers(repo: &Path) {
        let analyzer_package = repo.join("services/analyzer/src/vaexcore_pulse_analyzer");
        fs::create_dir_all(&analyzer_package).unwrap();
        fs::write(analyzer_package.join("server.py"), "").unwrap();
        let api_dir = repo.join("services/api");
        fs::create_dir_all(api_dir.join("src")).unwrap();
        fs::write(api_dir.join("src/server.ts"), "").unwrap();
        let tsx_dir = api_dir.join("node_modules/tsx/dist");
        fs::create_dir_all(&tsx_dir).unwrap();
        fs::write(tsx_dir.join("cli.mjs"), "").unwrap();
    }

    fn valid_discovery() -> SuiteDiscoveryDocument {
        SuiteDiscoveryDocument {
            schema_version: SUITE_DISCOVERY_SCHEMA_VERSION,
            app_id: PULSE_APP_ID.to_string(),
            app_name: APP_NAME.to_string(),
            bundle_identifier: "com.vaexil.vaexcore.pulse".to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
            pid: 1234,
            started_at: "2026-05-06T12:00:00Z".to_string(),
            updated_at: "2026-05-06T12:00:15Z".to_string(),
            api_url: Some("http://127.0.0.1:4010".to_string()),
            ws_url: None,
            health_url: Some("http://127.0.0.1:4010/health".to_string()),
            capabilities: vec!["pulse.api".to_string()],
            launch_name: APP_NAME.to_string(),
            suite_session_id: None,
            activity: Some("ready".to_string()),
            activity_detail: None,
            local_runtime: Some(SuiteLocalRuntime {
                contract_version: SUITE_DISCOVERY_SCHEMA_VERSION,
                mode: "local-first".to_string(),
                state: "ready".to_string(),
                app_storage_dir: "/tmp/pulse".to_string(),
                suite_dir: "/tmp/vaexcore/suite".to_string(),
                secure_storage: "none-required".to_string(),
                secret_storage_state: "not-applicable".to_string(),
                durable_storage: vec!["sqlite".to_string()],
                network_policy: "localhost-only".to_string(),
                dependencies: vec![SuiteLocalRuntimeDependency {
                    name: "pulse-api".to_string(),
                    kind: "local-http-service".to_string(),
                    state: "reachable".to_string(),
                    detail: "http://127.0.0.1:4010".to_string(),
                }],
            }),
        }
    }
