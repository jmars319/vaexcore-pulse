fn cleanup_old_preview_clips(cache_dir: &Path) {
    let expire_before = SystemTime::now()
        .checked_sub(Duration::from_secs(60 * 60 * 24 * 3))
        .unwrap_or(SystemTime::UNIX_EPOCH);
    let max_cache_bytes: u64 = 512 * 1024 * 1024;
    let max_cache_files: usize = 24;

    let entries = match fs::read_dir(cache_dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    let mut retained_entries = Vec::new();
    for entry in entries.flatten() {
        let preview_path = entry.path();
        let metadata = match entry.metadata() {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        let modified_time = match metadata.modified() {
            Ok(modified_time) => modified_time,
            Err(_) => continue,
        };

        if modified_time < expire_before {
            let _ = fs::remove_file(preview_path);
            continue;
        }

        retained_entries.push((preview_path, metadata.len(), modified_time));
    }

    retained_entries.sort_by_key(|(_, _, modified_time)| *modified_time);

    let mut total_bytes = retained_entries
        .iter()
        .fold(0_u64, |sum, (_, size_bytes, _)| {
            sum.saturating_add(*size_bytes)
        });
    let mut total_files = retained_entries.len();

    for (preview_path, size_bytes, _) in retained_entries {
        if total_bytes <= max_cache_bytes && total_files <= max_cache_files {
            break;
        }

        if fs::remove_file(&preview_path).is_ok() {
            total_bytes = total_bytes.saturating_sub(size_bytes);
            total_files = total_files.saturating_sub(1);
        }
    }
}

fn preview_cache_dir() -> std::path::PathBuf {
    std::env::temp_dir().join("vaexcore-pulse-preview-clips")
}

fn sanitize_file_stem(file_stem: &str) -> String {
    let sanitized = file_stem
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character
            } else {
                '-'
            }
        })
        .collect::<String>();

    let trimmed = sanitized.trim_matches('-');
    if trimmed.is_empty() {
        "moment-preview".to_string()
    } else {
        trimmed.to_string()
    }
}
