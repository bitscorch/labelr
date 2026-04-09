use std::process::Command;

fn main() {
    println!("cargo:rerun-if-changed=front/src/");
    println!("cargo:rerun-if-changed=front/index.html");

    let status = Command::new("npx")
        .args(["esbuild", "front/src/main.ts", "--bundle", "--outfile=front/dist/bundle.js"])
        .status()
        .expect("failed to run esbuild — is npm installed?");

    if !status.success() {
        panic!("esbuild failed");
    }

    std::fs::copy("front/index.html", "front/dist/index.html")
        .expect("failed to copy index.html");
}
