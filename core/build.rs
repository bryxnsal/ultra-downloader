fn main() {
    #[cfg(windows)]
    {
        let mut res = winres::WindowsResource::new();
        res.set_icon("icons/icon.ico");
        res.set("ProductName", "Ultra Downloader");
        res.set("FileDescription", "Ultra High-Speed Download Manager");
        res.set("CompanyName", "Brayan Salazar");
        res.set("LegalCopyright", "Copyright © 2026 Brayan Salazar");
        res.set("OriginalFilename", "ultra-downloader.exe");
        if let Err(e) = res.compile() {
            eprintln!("Failed to compile Windows resources: {}", e);
        }
    }

    tauri_build::build();
}
