use std::path::{Path, PathBuf};

const IMAGE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "bmp", "webp", "tiff", "tif"];

pub struct Dataset {
    pub images_dir: PathBuf,
    pub labels_dir: PathBuf,
    pub image_files: Vec<String>,
}

impl Dataset {
    pub fn scan(images_dir: &Path, labels_dir: Option<&Path>) -> anyhow::Result<Self> {
        if !images_dir.is_dir() {
            anyhow::bail!("images directory does not exist: {}", images_dir.display());
        }

        let labels_dir = match labels_dir {
            Some(dir) => dir.to_path_buf(),
            None => images_dir.parent().unwrap_or(images_dir).join("labels"),
        };

        if !labels_dir.exists() {
            std::fs::create_dir_all(&labels_dir)?;
        }

        let mut image_files: Vec<String> = std::fs::read_dir(images_dir)?
            .filter_map(|entry| {
                let entry = entry.ok()?;
                let path = entry.path();
                let ext = path.extension()?.to_str()?.to_lowercase();
                if IMAGE_EXTENSIONS.contains(&ext.as_str()) {
                    Some(entry.file_name().to_string_lossy().into_owned())
                } else {
                    None
                }
            })
            .collect();

        image_files.sort();

        println!("found {} images in {}", image_files.len(), images_dir.display());

        Ok(Self {
            images_dir: images_dir.to_path_buf(),
            labels_dir,
            image_files,
        })
    }

    pub fn label_path(&self, image_filename: &str) -> PathBuf {
        let stem = Path::new(image_filename)
            .file_stem()
            .unwrap()
            .to_string_lossy();
        self.labels_dir.join(format!("{stem}.txt"))
    }
}
